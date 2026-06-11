import { Injectable, Logger } from '@nestjs/common';
import { Alert, AlertType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationsService, NotificationChannel } from '../notifications/notifications.service';
import { evaluatePriceDrop, DEFAULT_PRICE_DROP_THRESHOLD_PCT } from './price-drop.util';

export type ScanName = 'price-drop' | 'expiring' | 'promotions' | 'budget-overrun';

type AlertWithUser = Alert & {
  user: { id: string; email: string; weeklyBudgetCents: number | null };
};

const USER_BATCH_SIZE = 100;
const DEFAULT_EXPIRY_DAYS = 3;
const DAY_MS = 86_400_000;

@Injectable()
export class AlertScanService {
  private readonly logger = new Logger(AlertScanService.name);

  /**
   * Simple in-process locks preventing overlapping runs of the same scan
   * inside one process. Cross-replica overlap is mitigated by routing all
   * scans through the single BullMQ 'alerts' queue, which serializes job
   * execution per worker (see AlertsScheduler/AlertsProcessor).
   */
  private readonly running = new Set<ScanName>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly metrics: MetricsService,
  ) {}

  async runScan(name: ScanName): Promise<void> {
    if (this.running.has(name)) {
      this.logger.warn(`Scan "${name}" is already running in this process — skipping`);
      return;
    }
    this.running.add(name);
    const startedAt = Date.now();
    try {
      switch (name) {
        case 'price-drop':
          await this.scanPriceDrops();
          break;
        case 'expiring':
          await this.scanExpiringPantry();
          break;
        case 'promotions':
          await this.scanPromotions();
          break;
        case 'budget-overrun':
          await this.scanBudgetOverruns();
          break;
      }
      this.logger.log(`Scan "${name}" finished in ${Date.now() - startedAt}ms`);
    } finally {
      this.running.delete(name);
    }
  }

  // ------------------------------------------------------------------
  // PRICE_DROP — hourly
  // ------------------------------------------------------------------

  async scanPriceDrops(): Promise<void> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);

    await this.forEachEnabledAlert('PRICE_DROP', async (alert) => {
      const thresholdPct = alert.threshold ?? DEFAULT_PRICE_DROP_THRESHOLD_PCT;
      const watches = await this.prisma.priceWatch.findMany({
        where: { userId: alert.userId },
        include: { product: { select: { id: true, name: true } } },
      });

      for (const watch of watches) {
        const latest = await this.prisma.price.findFirst({
          where: { productId: watch.productId },
          orderBy: { effectiveAt: 'desc' },
          select: { priceCents: true },
        });
        if (!latest) continue;

        const weekAgo = await this.prisma.price.findFirst({
          where: { productId: watch.productId, effectiveAt: { lte: sevenDaysAgo } },
          orderBy: { effectiveAt: 'desc' },
          select: { priceCents: true },
        });

        const evaluation = evaluatePriceDrop(
          latest.priceCents,
          weekAgo?.priceCents ?? null,
          watch.targetPriceCents,
          thresholdPct,
        );
        if (!evaluation.triggered) continue;

        // Dedupe: skip when this product was already notified within 24h.
        const duplicate = await this.prisma.notification.findFirst({
          where: {
            userId: alert.userId,
            type: 'PRICE_DROP',
            createdAt: { gte: dayAgo },
            data: { path: ['productId'], equals: watch.productId },
          },
          select: { id: true },
        });
        if (duplicate) continue;

        const priceStr = `S$${(latest.priceCents / 100).toFixed(2)}`;
        const body =
          evaluation.reason === 'target'
            ? `${watch.product.name} is now ${priceStr}, at or below your target price.`
            : `${watch.product.name} dropped ${evaluation.dropPct.toFixed(0)}% in the last 7 days — now ${priceStr}.`;

        await this.notifications.notify(
          alert.userId,
          'PRICE_DROP',
          `Price drop: ${watch.product.name}`,
          body,
          {
            productId: watch.productId,
            priceCents: latest.priceCents,
            reason: evaluation.reason,
            dropPct: Math.round(evaluation.dropPct * 10) / 10,
          },
          alert.channel as NotificationChannel,
          alert.user.email,
        );
      }
    });
  }

  // ------------------------------------------------------------------
  // EXPIRING_INGREDIENT — daily 08:00 SGT digest
  // ------------------------------------------------------------------

  async scanExpiringPantry(): Promise<void> {
    const now = new Date();
    await this.forEachEnabledAlert('EXPIRING_INGREDIENT', async (alert) => {
      const days = alert.threshold ?? DEFAULT_EXPIRY_DAYS;
      const boundary = new Date(now.getTime() + days * DAY_MS);
      const items = await this.prisma.pantryItem.findMany({
        where: {
          userId: alert.userId,
          consumedAt: null,
          wasted: false,
          expiresAt: { not: null, gte: now, lte: boundary },
        },
        orderBy: { expiresAt: 'asc' },
        select: { id: true, name: true, expiresAt: true },
      });
      if (items.length === 0) return;

      const lines = items.map(
        (i) => `- ${i.name} (expires ${i.expiresAt!.toISOString().slice(0, 10)})`,
      );
      await this.notifications.notify(
        alert.userId,
        'EXPIRING_INGREDIENT',
        `${items.length} pantry item${items.length === 1 ? '' : 's'} expiring within ${days} day${days === 1 ? '' : 's'}`,
        `Use these soon to avoid waste:\n${lines.join('\n')}`,
        { itemIds: items.map((i) => i.id), days },
        alert.channel as NotificationChannel,
        alert.user.email,
      );
    });
  }

  // ------------------------------------------------------------------
  // PROMOTION — daily 09:00 SGT digest
  // ------------------------------------------------------------------

  async scanPromotions(): Promise<void> {
    const dayAgo = new Date(Date.now() - DAY_MS);
    await this.forEachEnabledAlert('PROMOTION', async (alert) => {
      // Products of interest: watched products + products matching the
      // ingredients of the user's 10 most recent recipes.
      const watches = await this.prisma.priceWatch.findMany({
        where: { userId: alert.userId },
        select: { productId: true },
      });
      const recentRecipes = await this.prisma.recipe.findMany({
        where: { userId: alert.userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true },
      });
      const recipeIngredients = recentRecipes.length
        ? await this.prisma.recipeIngredient.findMany({
            where: {
              recipeId: { in: recentRecipes.map((r) => r.id) },
              ingredientId: { not: null },
            },
            select: { ingredientId: true },
          })
        : [];
      const ingredientIds = [
        ...new Set(recipeIngredients.map((ri) => ri.ingredientId as string)),
      ];
      const matches = ingredientIds.length
        ? await this.prisma.productIngredientMatch.findMany({
            where: { ingredientId: { in: ingredientIds } },
            orderBy: { similarity: 'desc' },
            take: 300,
            select: { productId: true },
          })
        : [];

      const productIds = [
        ...new Set([...watches.map((w) => w.productId), ...matches.map((m) => m.productId)]),
      ];
      if (productIds.length === 0) return;

      const promos = await this.prisma.price.findMany({
        where: { isPromo: true, createdAt: { gte: dayAgo }, productId: { in: productIds } },
        orderBy: { createdAt: 'desc' },
        distinct: ['productId'],
        take: 10,
        include: { product: { select: { id: true, name: true } } },
      });
      if (promos.length === 0) return;

      const lines = promos.map((p) => {
        const was = p.wasPriceCents ? ` (was S$${(p.wasPriceCents / 100).toFixed(2)})` : '';
        return `- ${p.product.name}: S$${(p.priceCents / 100).toFixed(2)}${was}`;
      });
      await this.notifications.notify(
        alert.userId,
        'PROMOTION',
        `${promos.length} new promotion${promos.length === 1 ? '' : 's'} on items you care about`,
        lines.join('\n'),
        { productIds: promos.map((p) => p.product.id) },
        alert.channel as NotificationChannel,
        alert.user.email,
      );
    });
  }

  // ------------------------------------------------------------------
  // BUDGET_OVERRUN — Mondays 10:00 SGT, checks the previous week
  // ------------------------------------------------------------------

  async scanBudgetOverruns(): Promise<void> {
    const now = new Date();
    // Previous full week: [last Monday 00:00, this Monday 00:00)
    const thisMonday = new Date(now);
    thisMonday.setHours(0, 0, 0, 0);
    thisMonday.setDate(thisMonday.getDate() - ((now.getDay() + 6) % 7));
    const lastMonday = new Date(thisMonday.getTime() - 7 * DAY_MS);

    await this.forEachEnabledAlert('BUDGET_OVERRUN', async (alert) => {
      const budget = alert.user.weeklyBudgetCents;
      if (budget === null || budget <= 0) return;

      const agg = await this.prisma.basket.aggregate({
        where: {
          userId: alert.userId,
          status: 'PURCHASED',
          updatedAt: { gte: lastMonday, lt: thisMonday },
        },
        _sum: { totalCents: true, deliveryCents: true },
      });
      const spent = (agg._sum.totalCents ?? 0) + (agg._sum.deliveryCents ?? 0);
      if (spent <= budget) return;

      const overBy = spent - budget;
      await this.notifications.notify(
        alert.userId,
        'BUDGET_OVERRUN',
        'Weekly grocery budget exceeded',
        `Last week you spent S$${(spent / 100).toFixed(2)} against a budget of S$${(budget / 100).toFixed(2)} — S$${(overBy / 100).toFixed(2)} over.`,
        { spentCents: spent, budgetCents: budget, weekStart: lastMonday.toISOString().slice(0, 10) },
        alert.channel as NotificationChannel,
        alert.user.email,
      );
    });
  }

  // ------------------------------------------------------------------

  /**
   * Iterate every enabled alert of the given type in batches of 100 users,
   * isolating per-user failures (logged + counted, never aborting the scan).
   */
  private async forEachEnabledAlert(
    type: AlertType,
    handler: (alert: AlertWithUser) => Promise<void>,
  ): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const batch = (await this.prisma.alert.findMany({
        where: { type, enabled: true },
        include: {
          user: { select: { id: true, email: true, weeklyBudgetCents: true } },
        },
        orderBy: { id: 'asc' },
        take: USER_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      })) as AlertWithUser[];

      for (const alert of batch) {
        try {
          await handler(alert);
        } catch (err) {
          this.metrics.increment('alert_scan_errors_total');
          this.logger.error(
            `Alert scan (${type}) failed for user ${alert.userId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (batch.length < USER_BATCH_SIZE) break;
      cursor = batch[batch.length - 1].id;
    }
  }
}
