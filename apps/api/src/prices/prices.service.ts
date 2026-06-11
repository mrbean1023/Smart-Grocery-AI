import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Price, PriceSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { PriceNormalizationService } from './price-normalization.service';

export interface RecordPriceInput {
  productId: string;
  priceCents: number;
  wasPriceCents?: number | null;
  isPromo?: boolean;
  promoEndsAt?: Date | null;
  source: PriceSource;
  confidence?: number;
  effectiveAt?: Date;
}

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly normalization: PriceNormalizationService,
  ) {}

  /**
   * Insert a new price point for a product, computing the normalized
   * per-kg / per-L / per-piece fields and refreshing the search index.
   */
  async recordPrice(input: RecordPriceInput): Promise<Price> {
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      include: { store: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${input.productId} not found`);
    }

    const normalized = this.normalization.normalize(
      input.priceCents,
      product.packSize,
      product.packUnit,
      product.unitCount,
    );

    const price = await this.prisma.price.create({
      data: {
        productId: product.id,
        priceCents: input.priceCents,
        wasPriceCents: input.wasPriceCents ?? null,
        isPromo: input.isPromo ?? false,
        promoEndsAt: input.promoEndsAt ?? null,
        source: input.source,
        confidence: input.confidence ?? 1.0,
        pricePerKgCents: normalized.pricePerKgCents,
        pricePerLCents: normalized.pricePerLCents,
        pricePerPieceCents: normalized.pricePerPieceCents,
        effectiveAt: input.effectiveAt ?? new Date(),
      },
    });

    await this.search.indexProducts([
      {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        storeCode: product.store.code,
        isAvailable: product.isAvailable,
        priceCents: price.priceCents,
        pricePerKgCents: price.pricePerKgCents,
      },
    ]);

    return price;
  }

  /**
   * Latest price per product in a single query
   * (DISTINCT ON (product_id) ORDER BY effective_at DESC).
   */
  async latestPriceMap(productIds: string[]): Promise<Map<string, Price>> {
    const map = new Map<string, Price>();
    const ids = [...new Set(productIds)].filter(Boolean);
    if (ids.length === 0) {
      return map;
    }

    const rows = await this.prisma.$queryRaw<Price[]>(Prisma.sql`
      SELECT DISTINCT ON ("productId")
        id, "productId", "priceCents", "wasPriceCents", "isPromo", "promoEndsAt",
        source, confidence, "pricePerKgCents", "pricePerLCents", "pricePerPieceCents",
        "effectiveAt", "createdAt"
      FROM prices
      WHERE "productId" = ANY(${ids}::uuid[])
      ORDER BY "productId", "effectiveAt" DESC
    `);

    for (const row of rows) {
      map.set(row.productId, row);
    }
    return map;
  }
}
