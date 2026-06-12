import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StoreCode } from '@prisma/client';
import type { Paginated, ProductDto } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { PricesService } from '../prices/prices.service';
import { productToDto } from './product.mapper';

// Shared product mapper, re-exported for use across modules.
export { productToDto, priceToDto } from './product.mapper';

export interface ProductSearchParams {
  q: string;
  storeCodes?: StoreCode[];
  page: number;
  pageSize: number;
}

interface PgSearchRow {
  id: string;
  total: bigint;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly prices: PricesService,
  ) {}

  async searchProducts(params: ProductSearchParams): Promise<Paginated<ProductDto>> {
    const esResult = await this.search.searchProducts({
      q: params.q,
      storeCodes: params.storeCodes,
      page: params.page,
      pageSize: params.pageSize,
    });

    let ids: string[];
    let total: number;
    if (esResult) {
      ids = esResult.ids;
      total = esResult.total;
    } else {
      const pg = await this.searchPostgres(params);
      ids = pg.ids;
      total = pg.total;
    }

    const items = await this.hydrateProducts(ids);
    return {
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  /** Postgres fallback: ILIKE + trigram similarity ordering. */
  private async searchPostgres(
    params: ProductSearchParams,
  ): Promise<{ ids: string[]; total: number }> {
    const q = params.q.trim();
    const storeFilter =
      params.storeCodes && params.storeCodes.length > 0
        ? Prisma.sql`AND s.code = ANY(${params.storeCodes.map(String)}::"StoreCode"[])`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<PgSearchRow[]>(Prisma.sql`
      SELECT p.id, count(*) OVER() AS total
      FROM products p
      JOIN stores s ON s.id = p."storeId"
      WHERE p."isAvailable" = true
        AND s."isActive" = true
        ${storeFilter}
        AND (
          p.name ILIKE ${'%' + q + '%'}
          OR COALESCE(p.brand, '') ILIKE ${'%' + q + '%'}
          OR similarity(lower(p.name), lower(${q})) > 0.2
        )
      ORDER BY similarity(lower(p.name), lower(${q})) DESC, p.name ASC
      LIMIT ${params.pageSize}
      OFFSET ${(params.page - 1) * params.pageSize}
    `);

    return {
      ids: rows.map((r) => r.id),
      total: rows.length > 0 ? Number(rows[0].total) : 0,
    };
  }

  /** Load products + store + latest price, preserving the input id order. */
  async hydrateProducts(ids: string[]): Promise<ProductDto[]> {
    if (ids.length === 0) {
      return [];
    }
    const [products, priceMap] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: ids } },
        include: { store: true },
      }),
      this.prices.latestPriceMap(ids),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const result: ProductDto[] = [];
    for (const id of ids) {
      const product = byId.get(id);
      if (product) {
        result.push(productToDto(product, priceMap.get(id) ?? null));
      }
    }
    return result;
  }

  async getById(id: string): Promise<ProductDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { store: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    const priceMap = await this.prices.latestPriceMap([id]);
    return productToDto(product, priceMap.get(id) ?? null);
  }

  /** Daily closing prices (last price recorded per calendar day). */
  async getHistory(id: string, days: number): Promise<Array<{ date: string; priceCents: number }>> {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const prices = await this.prisma.price.findMany({
      where: { productId: id, effectiveAt: { gte: since } },
      orderBy: { effectiveAt: 'asc' },
      select: { effectiveAt: true, priceCents: true },
    });

    const closing = new Map<string, number>();
    for (const price of prices) {
      const date = price.effectiveAt.toISOString().slice(0, 10);
      closing.set(date, price.priceCents); // ascending order: last write wins = closing price
    }
    return [...closing.entries()].map(([date, priceCents]) => ({ date, priceCents }));
  }
}
