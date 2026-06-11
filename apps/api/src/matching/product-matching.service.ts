import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRODUCT_MATCH_MIN_SIMILARITY } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../ai/openai.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  decideMatchPath,
  filterCandidates,
  ingredientEmbeddingText,
  productEmbeddingText,
  toVectorLiteral,
  TRIGRAM_CANDIDATE_FLOOR,
  type MatchCandidate,
} from './matching.logic';

const CANDIDATE_LIMIT = 5;
const REBUILD_BATCH_SIZE = 200;

interface CandidateRow {
  id: string;
  sim: number;
}

@Injectable()
export class ProductMatchingService {
  private readonly logger = new Logger(ProductMatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly metrics: MetricsService,
  ) {}

  /** Match one product against the ingredient catalogue. */
  async matchProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      this.logger.warn(`matchProduct: product ${productId} not found`);
      return;
    }

    let hasEmbedding = await this.rowHasEmbedding('products', productId);
    if (!hasEmbedding && this.openai.isConfigured()) {
      hasEmbedding = await this.embedProduct(productId, product.name, product.brand, product.category);
    }

    const ingredientEmbeddings = await this.countEmbeddings('ingredients');
    const path = decideMatchPath(hasEmbedding, ingredientEmbeddings);

    let candidates: MatchCandidate[];
    if (path === 'embedding') {
      candidates = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
        SELECT i.id::text AS id, (1 - (i.embedding <=> p.embedding))::float AS sim
        FROM ingredients i, products p
        WHERE p.id = ${productId}::uuid
          AND i.embedding IS NOT NULL
          AND p.embedding IS NOT NULL
        ORDER BY i.embedding <=> p.embedding
        LIMIT ${CANDIDATE_LIMIT}
      `);
    } else {
      candidates = await this.trigramIngredientCandidates(product.name);
    }

    const floor = path === 'trigram' ? TRIGRAM_CANDIDATE_FLOOR : 0;
    const accepted = filterCandidates(candidates, PRODUCT_MATCH_MIN_SIMILARITY, floor);

    for (const candidate of accepted) {
      await this.prisma.productIngredientMatch.upsert({
        where: { productId_ingredientId: { productId, ingredientId: candidate.id } },
        create: {
          productId,
          ingredientId: candidate.id,
          similarity: candidate.sim,
          matchedBy: path,
        },
        update: { similarity: candidate.sim, matchedBy: path },
      });
    }

    this.metrics.increment('matching_products_matched_total');
    this.logger.debug(
      `matchProduct ${productId}: ${accepted.length} matches via ${path} (from ${candidates.length} candidates)`,
    );
  }

  /** Mirror direction: match one ingredient against the product catalogue. */
  async matchIngredient(ingredientId: string): Promise<void> {
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ingredient) {
      this.logger.warn(`matchIngredient: ingredient ${ingredientId} not found`);
      return;
    }

    let hasEmbedding = await this.rowHasEmbedding('ingredients', ingredientId);
    if (!hasEmbedding && this.openai.isConfigured()) {
      hasEmbedding = await this.embedIngredient(ingredientId, ingredient.displayName, ingredient.category);
    }

    const productEmbeddings = await this.countEmbeddings('products');
    const path = decideMatchPath(hasEmbedding, productEmbeddings);

    let candidates: MatchCandidate[];
    if (path === 'embedding') {
      candidates = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
        SELECT p.id::text AS id, (1 - (p.embedding <=> i.embedding))::float AS sim
        FROM products p, ingredients i
        WHERE i.id = ${ingredientId}::uuid
          AND p.embedding IS NOT NULL
          AND i.embedding IS NOT NULL
        ORDER BY p.embedding <=> i.embedding
        LIMIT ${CANDIDATE_LIMIT}
      `);
    } else {
      candidates = await this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
        SELECT p.id::text AS id,
               GREATEST(
                 similarity(lower(p.name), lower(${ingredient.name})),
                 similarity(lower(p.name), lower(${ingredient.displayName}))
               )::float AS sim
        FROM products p
        ORDER BY sim DESC
        LIMIT ${CANDIDATE_LIMIT}
      `);
    }

    const floor = path === 'trigram' ? TRIGRAM_CANDIDATE_FLOOR : 0;
    const accepted = filterCandidates(candidates, PRODUCT_MATCH_MIN_SIMILARITY, floor);

    for (const candidate of accepted) {
      await this.prisma.productIngredientMatch.upsert({
        where: { productId_ingredientId: { productId: candidate.id, ingredientId } },
        create: {
          productId: candidate.id,
          ingredientId,
          similarity: candidate.sim,
          matchedBy: path,
        },
        update: { similarity: candidate.sim, matchedBy: path },
      });
    }

    this.metrics.increment('matching_ingredients_matched_total');
  }

  /** Re-match every product, in batches of 200. */
  async rebuildAll(): Promise<void> {
    this.logger.log('Starting full match rebuild');
    let cursor: string | undefined;
    let processed = 0;
    for (;;) {
      const products: Array<{ id: string }> = await this.prisma.product.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
        take: REBUILD_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (products.length === 0) {
        break;
      }
      for (const product of products) {
        try {
          await this.matchProduct(product.id);
        } catch (err) {
          this.logger.warn(`rebuildAll: failed to match product ${product.id}: ${(err as Error).message}`);
        }
        processed++;
      }
      cursor = products[products.length - 1].id;
      this.logger.log(`Match rebuild progress: ${processed} products`);
    }
    this.logger.log(`Match rebuild finished: ${processed} products processed`);
  }

  // ---- internals ----

  private async trigramIngredientCandidates(productName: string): Promise<MatchCandidate[]> {
    const name = productName.toLowerCase();
    return this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT i.id::text AS id,
             GREATEST(
               similarity(lower(i.name), ${name}),
               similarity(lower(i."displayName"), ${name}),
               COALESCE((
                 SELECT max(similarity(lower(a.alias), ${name}))
                 FROM ingredient_aliases a
                 WHERE a."ingredientId" = i.id
               ), 0)
             )::float AS sim
      FROM ingredients i
      ORDER BY sim DESC
      LIMIT ${CANDIDATE_LIMIT}
    `);
  }

  private async rowHasEmbedding(table: 'products' | 'ingredients', id: string): Promise<boolean> {
    const sql =
      table === 'products'
        ? Prisma.sql`SELECT (embedding IS NOT NULL) AS has FROM products WHERE id = ${id}::uuid`
        : Prisma.sql`SELECT (embedding IS NOT NULL) AS has FROM ingredients WHERE id = ${id}::uuid`;
    const rows = await this.prisma.$queryRaw<Array<{ has: boolean }>>(sql);
    return rows.length > 0 && rows[0].has === true;
  }

  private async countEmbeddings(table: 'products' | 'ingredients'): Promise<number> {
    const sql =
      table === 'products'
        ? Prisma.sql`SELECT count(*)::int AS c FROM products WHERE embedding IS NOT NULL`
        : Prisma.sql`SELECT count(*)::int AS c FROM ingredients WHERE embedding IS NOT NULL`;
    const rows = await this.prisma.$queryRaw<Array<{ c: number }>>(sql);
    return rows.length > 0 ? Number(rows[0].c) : 0;
  }

  private async embedProduct(
    id: string,
    name: string,
    brand: string | null,
    category: string | null,
  ): Promise<boolean> {
    try {
      const [vector] = await this.openai.embed([productEmbeddingText(name, brand, category)]);
      if (!vector) {
        return false;
      }
      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE products SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${id}::uuid`,
      );
      return true;
    } catch (err) {
      this.logger.warn(`Failed to embed product ${id}: ${(err as Error).message}`);
      return false;
    }
  }

  private async embedIngredient(id: string, displayName: string, category: string): Promise<boolean> {
    try {
      const [vector] = await this.openai.embed([ingredientEmbeddingText(displayName, category)]);
      if (!vector) {
        return false;
      }
      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE ingredients SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${id}::uuid`,
      );
      return true;
    } catch (err) {
      this.logger.warn(`Failed to embed ingredient ${id}: ${(err as Error).message}`);
      return false;
    }
  }
}
