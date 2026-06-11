import { Injectable, Logger } from '@nestjs/common';
import type { AnalyticsSummary, StoreCode } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { buildInflationTrend, buildSpendTrend, type MonthlyAvgRow } from './trend.util';

const CACHE_TTL_MS = 60_000;
const DAY_MS = 86_400_000;

interface CacheEntry {
  at: number;
  data: AnalyticsSummary;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  /** Per-user in-memory cache (60s TTL). No Redis dependency by design. */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string): Promise<AnalyticsSummary> {
    const cached = this.cache.get(userId);
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) {
      return cached.data;
    }

    const data = await this.computeSummary(userId);
    this.cache.set(userId, { at: now, data });
    this.evictStale(now);
    return data;
  }

  private async computeSummary(userId: string): Promise<AnalyticsSummary> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const d90 = new Date(now.getTime() - 90 * DAY_MS);
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    const [monthBaskets, monthReceipts, trendBaskets, storeItems, inflationRows, wasteCounts] =
      await Promise.all([
        // Monthly spend/savings from purchased baskets.
        // NOTE: a basket's transition to PURCHASED bumps updatedAt, so we use
        // updatedAt as the purchase timestamp.
        this.prisma.basket.aggregate({
          where: { userId, status: 'PURCHASED', updatedAt: { gte: monthStart } },
          _sum: { totalCents: true, deliveryCents: true, savingsCents: true },
        }),
        // Receipt totals this month. We intentionally do NOT attempt to dedupe
        // receipts against baskets — a receipt for groceries bought via an
        // optimized basket may double-count, but linking them reliably is not
        // possible with current data, and the product treats them as separate
        // spend signals.
        this.prisma.receiptUpload.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: monthStart },
            totalCents: { not: null },
          },
          _sum: { totalCents: true },
        }),
        this.prisma.basket.findMany({
          where: { userId, status: 'PURCHASED', updatedAt: { gte: sixMonthsAgo } },
          select: { updatedAt: true, totalCents: true, deliveryCents: true, savingsCents: true },
        }),
        this.prisma.basketItem.findMany({
          where: {
            basket: { userId, status: 'PURCHASED', updatedAt: { gte: d90 } },
            productId: { not: null },
          },
          select: {
            totalCents: true,
            product: { select: { store: { select: { code: true, name: true } } } },
          },
        }),
        // Single grouped query over the last 12 months of price rows.
        this.prisma.$queryRaw<Array<{ month: string; avg: number }>>`
          SELECT to_char(date_trunc('month', "effectiveAt"), 'YYYY-MM') AS month,
                 AVG("pricePerKgCents")::float AS avg
          FROM prices
          WHERE "pricePerKgCents" IS NOT NULL
            AND "effectiveAt" >= NOW() - INTERVAL '12 months'
          GROUP BY 1
          ORDER BY 1`,
        this.pantryWasteCounts(userId, d90),
      ]);

    const monthlySpendCents =
      (monthBaskets._sum.totalCents ?? 0) +
      (monthBaskets._sum.deliveryCents ?? 0) +
      (monthReceipts._sum.totalCents ?? 0);
    const monthlySavingsCents = monthBaskets._sum.savingsCents ?? 0;

    // spendByStore over the last 90 days
    const storeTotals = new Map<string, { storeCode: StoreCode; storeName: string; totalCents: number }>();
    for (const item of storeItems) {
      const store = item.product?.store;
      if (!store) continue;
      const entry = storeTotals.get(store.code) ?? {
        storeCode: store.code as StoreCode,
        storeName: store.name,
        totalCents: 0,
      };
      entry.totalCents += item.totalCents;
      storeTotals.set(store.code, entry);
    }

    const inflationInput: MonthlyAvgRow[] = inflationRows.map((r) => ({
      month: r.month,
      avgPerKgCents: Number(r.avg),
    }));

    return {
      monthlySpendCents,
      monthlySavingsCents,
      spendByStore: [...storeTotals.values()].sort((a, b) => b.totalCents - a.totalCents),
      spendTrend: buildSpendTrend(trendBaskets, now),
      inflationTrend: buildInflationTrend(inflationInput),
      pantryWaste: wasteCounts,
    };
  }

  private async pantryWasteCounts(
    userId: string,
    since: Date,
  ): Promise<AnalyticsSummary['pantryWaste']> {
    const [wastedAgg, consumedCount] = await Promise.all([
      this.prisma.pantryItem.aggregate({
        where: { userId, wasted: true, consumedAt: { gte: since } },
        _count: { _all: true },
        _sum: { pricePaidCents: true },
      }),
      this.prisma.pantryItem.count({
        where: { userId, wasted: false, consumedAt: { gte: since } },
      }),
    ]);
    const wastedItems = wastedAgg._count._all;
    const denominator = wastedItems + consumedCount;
    return {
      wastedItems,
      wastedValueCents: wastedAgg._sum.pricePaidCents ?? 0,
      wasteRate: denominator > 0 ? Math.round((wastedItems / denominator) * 1000) / 1000 : 0,
    };
  }

  /** Drop expired cache entries so the map cannot grow unbounded. */
  private evictStale(now: number): void {
    if (this.cache.size < 1000) return;
    for (const [key, entry] of this.cache) {
      if (now - entry.at >= CACHE_TTL_MS) this.cache.delete(key);
    }
  }
}
