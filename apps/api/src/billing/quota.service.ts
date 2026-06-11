import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FREE_TIER_LIMITS } from '@smart-grocery/shared';
import { AuthUser } from '../auth/types';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';

export type QuotaKind = 'RECIPE_SCAN' | 'BASKET_OPTIMIZATION' | 'AI_CHAT_MESSAGE' | 'OCR_UPLOAD';

export interface UsageEntry {
  kind: QuotaKind;
  used: number;
  /** null = unlimited (PREMIUM tier or freemium enforcement disabled). */
  limit: number | null;
  period: string;
}

interface QuotaRule {
  period: 'monthly' | 'daily';
  limit: number;
  label: string;
}

const QUOTA_KINDS: QuotaKind[] = [
  'RECIPE_SCAN',
  'BASKET_OPTIMIZATION',
  'AI_CHAT_MESSAGE',
  'OCR_UPLOAD',
];

/** Singapore (UTC+8) offset for quota period boundaries. */
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Free-tier quota enforcement. Feature modules call exactly:
 *
 *   await quotaService.assertAndConsume(user, 'RECIPE_SCAN');
 *   await quotaService.assertPremium(user, 'Meal planning');
 *
 * PREMIUM users (and FREEMIUM_ENFORCED=false) are no-ops. Usage is tracked
 * via an atomic upsert+increment on UsageRecord, keyed by SGT period
 * (`YYYY-MM` monthly, `YYYY-MM-DD` daily). Over-limit requests throw a 402
 * with code QUOTA_EXCEEDED.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly enforced: boolean;
  private readonly rules: Record<QuotaKind, QuotaRule>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    configService: ConfigService,
  ) {
    this.enforced = configService.get<boolean>('freemium.enforced', true);
    const scansPerMonth = configService.get<number>(
      'freemium.scansPerMonth',
      FREE_TIER_LIMITS.recipeScansPerMonth,
    );
    const optimizationsPerDay = configService.get<number>(
      'freemium.optimizationsPerDay',
      FREE_TIER_LIMITS.basketOptimizationsPerDay,
    );

    this.rules = {
      RECIPE_SCAN: { period: 'monthly', limit: scansPerMonth, label: 'recipe scans' },
      BASKET_OPTIMIZATION: {
        period: 'daily',
        limit: optimizationsPerDay,
        label: 'basket optimizations',
      },
      AI_CHAT_MESSAGE: {
        period: 'daily',
        limit: FREE_TIER_LIMITS.aiChatMessagesPerDay,
        label: 'AI assistant messages',
      },
      OCR_UPLOAD: { period: 'monthly', limit: scansPerMonth, label: 'OCR uploads' },
    };

    if (!this.enforced) {
      this.logger.warn('FREEMIUM_ENFORCED=false — free-tier quotas are NOT enforced');
    }
  }

  /**
   * Consumes one unit of quota for the given kind, throwing 402
   * QUOTA_EXCEEDED when the free-tier limit has been reached.
   */
  async assertAndConsume(user: AuthUser, kind: QuotaKind): Promise<void> {
    if (this.isUnlimited(user)) {
      return;
    }

    const rule = this.rules[kind];
    const periodKey = this.periodKey(rule.period);

    const record = await this.prisma.usageRecord.upsert({
      where: { userId_kind_periodKey: { userId: user.id, kind, periodKey } },
      create: { userId: user.id, kind, periodKey, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (record.count > rule.limit) {
      this.metrics.increment('quota_exceeded_total', { kind });
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: `Free plan limit reached: ${rule.limit} ${rule.label} per ${
            rule.period === 'monthly' ? 'month' : 'day'
          }. Upgrade to Premium for unlimited access.`,
          code: 'QUOTA_EXCEEDED',
          kind,
          limit: rule.limit,
          period: periodKey,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    this.metrics.increment('quota_consumed_total', { kind });
  }

  /** Current usage vs limits for every quota kind (used by GET /v1/billing/usage). */
  async getUsage(user: AuthUser): Promise<UsageEntry[]> {
    const unlimited = this.isUnlimited(user);

    return Promise.all(
      QUOTA_KINDS.map(async (kind): Promise<UsageEntry> => {
        const rule = this.rules[kind];
        const periodKey = this.periodKey(rule.period);
        const record = await this.prisma.usageRecord.findUnique({
          where: { userId_kind_periodKey: { userId: user.id, kind, periodKey } },
        });
        return {
          kind,
          used: record?.count ?? 0,
          limit: unlimited ? null : rule.limit,
          period: periodKey,
        };
      }),
    );
  }

  /**
   * Gates premium-only features (meal plans, forecasts, alerts). Throws 402
   * with code PREMIUM_REQUIRED for free-tier users.
   */
  assertPremium(user: AuthUser, feature: string): void {
    if (this.isUnlimited(user)) {
      return;
    }
    this.metrics.increment('premium_gate_blocked_total');
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message: `${feature} is a Premium feature. Upgrade to unlock it.`,
        code: 'PREMIUM_REQUIRED',
        feature,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private isUnlimited(user: AuthUser): boolean {
    return user.tier === 'PREMIUM' || !this.enforced;
  }

  /** SGT-based period key: `YYYY-MM` (monthly) or `YYYY-MM-DD` (daily). */
  private periodKey(period: 'monthly' | 'daily'): string {
    const sgtNow = new Date(Date.now() + SGT_OFFSET_MS).toISOString();
    return period === 'monthly' ? sgtNow.slice(0, 7) : sgtNow.slice(0, 10);
  }
}
