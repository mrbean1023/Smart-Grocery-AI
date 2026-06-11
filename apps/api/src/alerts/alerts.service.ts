import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertType, Prisma } from '@prisma/client';
import type { UpsertAlertInput } from './alerts.schemas';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import { AuthUser } from '../auth/types';
import { DEFAULT_PRICE_DROP_THRESHOLD_PCT } from './price-drop.util';

export interface AlertSettingDto {
  type: AlertType;
  enabled: boolean;
  threshold: number | null;
  channel: string;
}

export interface PriceWatchDto {
  id: string;
  targetPriceCents: number | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
    storeCode: string;
    latestPriceCents: number | null;
    isPromo: boolean;
  };
}

const ALL_ALERT_TYPES: AlertType[] = [
  'PRICE_DROP',
  'PROMOTION',
  'EXPIRING_INGREDIENT',
  'BUDGET_OVERRUN',
];

/** Sensible default thresholds shown for not-yet-configured alerts. */
export function defaultThreshold(type: AlertType): number | null {
  switch (type) {
    case 'PRICE_DROP':
      return DEFAULT_PRICE_DROP_THRESHOLD_PCT; // % drop
    case 'EXPIRING_INGREDIENT':
      return 3; // days
    default:
      return null;
  }
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  // ------------------------------------------------------------------
  // Alert settings
  // ------------------------------------------------------------------

  async getSettings(userId: string): Promise<AlertSettingDto[]> {
    const existing = await this.prisma.alert.findMany({ where: { userId } });
    const byType = new Map(existing.map((a) => [a.type, a]));
    return ALL_ALERT_TYPES.map((type) => {
      const alert = byType.get(type);
      return alert
        ? {
            type,
            enabled: alert.enabled,
            threshold: alert.threshold,
            channel: alert.channel,
          }
        : { type, enabled: false, threshold: defaultThreshold(type), channel: 'in_app' };
    });
  }

  async upsert(user: AuthUser, input: UpsertAlertInput): Promise<AlertSettingDto> {
    if (input.enabled) {
      // Alerts are a premium feature — gate on enabling only, so users can
      // always switch alerts off.
      await this.quota.assertPremium(user, 'alerts');
    }
    const alert = await this.prisma.alert.upsert({
      where: { userId_type: { userId: user.id, type: input.type as AlertType } },
      create: {
        userId: user.id,
        type: input.type as AlertType,
        enabled: input.enabled,
        threshold: input.threshold ?? defaultThreshold(input.type as AlertType),
        channel: input.channel,
      },
      update: {
        enabled: input.enabled,
        ...(input.threshold !== undefined ? { threshold: input.threshold } : {}),
        channel: input.channel,
      },
    });
    return {
      type: alert.type,
      enabled: alert.enabled,
      threshold: alert.threshold,
      channel: alert.channel,
    };
  }

  // ------------------------------------------------------------------
  // Price watches
  // ------------------------------------------------------------------

  async createPriceWatch(
    userId: string,
    productId: string,
    targetPriceCents?: number,
  ): Promise<PriceWatchDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    try {
      const watch = await this.prisma.priceWatch.create({
        data: { userId, productId, targetPriceCents: targetPriceCents ?? null },
      });
      return this.priceWatchToDto(watch.id, userId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('You are already watching this product');
      }
      throw err;
    }
  }

  async listPriceWatches(userId: string): Promise<PriceWatchDto[]> {
    const watches = await this.prisma.priceWatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            store: { select: { code: true } },
            prices: { orderBy: { effectiveAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    return watches.map((w) => ({
      id: w.id,
      targetPriceCents: w.targetPriceCents,
      createdAt: w.createdAt.toISOString(),
      product: {
        id: w.product.id,
        name: w.product.name,
        brand: w.product.brand,
        imageUrl: w.product.imageUrl,
        storeCode: w.product.store.code,
        latestPriceCents: w.product.prices[0]?.priceCents ?? null,
        isPromo: w.product.prices[0]?.isPromo ?? false,
      },
    }));
  }

  async deletePriceWatch(userId: string, id: string): Promise<{ deleted: true }> {
    const result = await this.prisma.priceWatch.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Price watch not found');
    return { deleted: true };
  }

  private async priceWatchToDto(id: string, userId: string): Promise<PriceWatchDto> {
    const watches = await this.listPriceWatches(userId);
    const dto = watches.find((w) => w.id === id);
    if (!dto) throw new NotFoundException('Price watch not found');
    return dto;
  }
}
