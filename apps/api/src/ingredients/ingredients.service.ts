import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toCanonical, type IngredientCategory } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface IngredientMatch {
  ingredientId: string | null;
  confidence: number;
}

export interface ParsedQtyInput {
  quantity: number | null;
  unit: string | null;
}

export interface IngredientConversionInfo {
  density: number | null;
  gramsPerPiece: number | null;
}

export interface IngredientSearchRow {
  id: string;
  displayName: string;
  category: IngredientCategory;
}

export interface SubstitutionRow {
  ingredient: { id: string; displayName: string };
  ratio: number;
  notes: string | null;
  confidence: number;
}

const TRIGRAM_THRESHOLD = 0.35;

@Injectable()
export class IngredientsService {
  private readonly logger = new Logger(IngredientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Match a normalized ingredient name to a canonical Ingredient row.
   * Exact name (1.0) → alias (0.95) → pg_trgm fuzzy on names and aliases
   * (similarity score as confidence).
   */
  async findOrMatch(name: string): Promise<IngredientMatch> {
    const q = name.trim().toLowerCase();
    if (!q) return { ingredientId: null, confidence: 0 };

    const exact = await this.prisma.ingredient.findUnique({
      where: { name: q },
      select: { id: true },
    });
    if (exact) return { ingredientId: exact.id, confidence: 1.0 };

    const alias = await this.prisma.ingredientAlias.findUnique({
      where: { alias: q },
      select: { ingredientId: true },
    });
    if (alias) return { ingredientId: alias.ingredientId, confidence: 0.95 };

    try {
      const [nameRows, aliasRows] = await Promise.all([
        this.prisma.$queryRaw<Array<{ id: string; s: number }>>`
          SELECT id, similarity(name, ${q}) s
          FROM ingredients
          WHERE similarity(name, ${q}) > ${TRIGRAM_THRESHOLD}
          ORDER BY s DESC
          LIMIT 1`,
        this.prisma.$queryRaw<Array<{ id: string; s: number }>>`
          SELECT "ingredientId" AS id, similarity(alias, ${q}) s
          FROM ingredient_aliases
          WHERE similarity(alias, ${q}) > ${TRIGRAM_THRESHOLD}
          ORDER BY s DESC
          LIMIT 1`,
      ]);
      const candidates = [...nameRows, ...aliasRows].sort((a, b) => b.s - a.s);
      const best = candidates[0];
      if (best) {
        return { ingredientId: best.id, confidence: Math.min(0.94, Number(best.s)) };
      }
    } catch (err) {
      // pg_trgm missing or similar — degrade to "no match" rather than failing the pipeline
      this.logger.warn(
        `Trigram match failed for "${q}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { ingredientId: null, confidence: 0 };
  }

  /**
   * Convert a parsed quantity to canonical grams (ml for liquids without a
   * known density). Returns null when no deterministic conversion exists.
   */
  toCanonicalQty(
    parsed: ParsedQtyInput,
    ingredient: IngredientConversionInfo | null,
  ): number | null {
    if (parsed.quantity === null || parsed.quantity <= 0) return null;
    const unit = parsed.unit ?? 'piece';
    const normalized = toCanonical(parsed.quantity, unit, {
      density: ingredient?.density ?? null,
      gramsPerPiece: ingredient?.gramsPerPiece ?? null,
    });
    if (normalized.unit === 'g' || normalized.unit === 'ml') {
      return normalized.value;
    }
    return null; // pure piece count with no per-piece weight
  }

  async search(q: string): Promise<IngredientSearchRow[]> {
    const query = q.trim();
    const rows = await this.prisma.ingredient.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
          { aliases: { some: { alias: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      select: { id: true, displayName: true, category: true },
      orderBy: { displayName: 'asc' },
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      category: row.category as IngredientCategory,
    }));
  }

  async getSubstitutions(ingredientId: string): Promise<SubstitutionRow[]> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { id: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');

    const [forward, reverse] = await Promise.all([
      this.prisma.ingredientSubstitution.findMany({
        where: { fromIngredientId: ingredientId },
        include: { toIngredient: { select: { id: true, displayName: true } } },
      }),
      this.prisma.ingredientSubstitution.findMany({
        where: { toIngredientId: ingredientId },
        include: { fromIngredient: { select: { id: true, displayName: true } } },
      }),
    ]);

    const rows: SubstitutionRow[] = [];
    const seen = new Set<string>();
    for (const sub of forward) {
      if (seen.has(sub.toIngredient.id)) continue;
      seen.add(sub.toIngredient.id);
      rows.push({
        ingredient: { id: sub.toIngredient.id, displayName: sub.toIngredient.displayName },
        ratio: sub.ratio,
        notes: sub.notes,
        confidence: sub.confidence,
      });
    }
    for (const sub of reverse) {
      if (seen.has(sub.fromIngredient.id)) continue;
      seen.add(sub.fromIngredient.id);
      rows.push({
        ingredient: { id: sub.fromIngredient.id, displayName: sub.fromIngredient.displayName },
        // reverse direction → invert the ratio
        ratio: sub.ratio > 0 ? Number((1 / sub.ratio).toFixed(3)) : 1,
        notes: sub.notes,
        confidence: sub.confidence,
      });
    }
    return rows;
  }
}
