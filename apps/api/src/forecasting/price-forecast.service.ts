import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { PriceForecastDto } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  clamp,
  forecastConfidence,
  linearRegression,
  median,
  priceDirection,
  weightedPromoLikelihood,
} from './forecasting.math';

export interface ForecastingJobData {
  productId: string;
}

const MIN_POINTS = 8;
const HISTORY_DAYS = 365;
const RECENT_WINDOW_DAYS = 90;
const HORIZONS = [7, 14, 30] as const;
const MODEL_VERSION = 'v1-linreg';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class PriceForecastService {
  private readonly logger = new Logger(PriceForecastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @InjectQueue('forecasting') private readonly forecastingQueue: Queue<ForecastingJobData>,
  ) {}

  /**
   * Compute and upsert 7/14/30-day forecasts for one product using linear
   * regression over up to 365 days of price history. Skips products with
   * fewer than 8 price points.
   */
  async forecastProduct(productId: string): Promise<void> {
    const since = new Date(Date.now() - HISTORY_DAYS * MS_PER_DAY);
    const prices = await this.prisma.price.findMany({
      where: { productId, effectiveAt: { gte: since } },
      orderBy: { effectiveAt: 'asc' },
      select: { priceCents: true, isPromo: true, effectiveAt: true },
    });

    if (prices.length < MIN_POINTS) {
      this.logger.debug(
        `Skipping forecast for product ${productId}: only ${prices.length} price points`,
      );
      return;
    }

    const t0 = prices[0].effectiveAt.getTime();
    const points = prices.map((p) => ({
      x: (p.effectiveAt.getTime() - t0) / MS_PER_DAY,
      y: p.priceCents,
    }));
    const { slope, intercept, r2 } = linearRegression(points);

    const med = median(points.map((p) => p.y));
    const lo = Math.round(0.5 * med);
    const hi = Math.round(2 * med);
    const lastDay = points[points.length - 1].x;
    const currentPrice = points[points.length - 1].y;

    const recentCutoff = Date.now() - RECENT_WINDOW_DAYS * MS_PER_DAY;
    const promoLikelihood = weightedPromoLikelihood(
      prices.map((p) => ({ isPromo: p.isPromo, recent: p.effectiveAt.getTime() >= recentCutoff })),
    );

    const confidence = forecastConfidence(points.length, r2);

    for (const horizon of HORIZONS) {
      const raw = intercept + slope * (lastDay + horizon);
      const predicted = Math.round(clamp(raw, lo, hi));
      const direction = priceDirection(currentPrice, predicted);

      await this.prisma.priceForecast.upsert({
        where: { productId_horizonDays: { productId, horizonDays: horizon } },
        create: {
          productId,
          horizonDays: horizon,
          predictedPriceCents: predicted,
          direction,
          promoLikelihood,
          confidence,
          modelVersion: MODEL_VERSION,
        },
        update: {
          predictedPriceCents: predicted,
          direction,
          promoLikelihood,
          confidence,
          modelVersion: MODEL_VERSION,
          createdAt: new Date(),
        },
      });
    }

    this.metrics.increment('forecasts_computed_total');
  }

  /** Read forecasts for a product, computing them on demand when missing. */
  async getForecastsForProduct(productId: string): Promise<PriceForecastDto[]> {
    let forecasts = await this.prisma.priceForecast.findMany({
      where: { productId },
      orderBy: { horizonDays: 'asc' },
    });
    if (forecasts.length === 0) {
      await this.forecastProduct(productId);
      forecasts = await this.prisma.priceForecast.findMany({
        where: { productId },
        orderBy: { horizonDays: 'asc' },
      });
    }
    return forecasts.map((f) => ({
      productId: f.productId,
      horizonDays: f.horizonDays,
      predictedPriceCents: f.predictedPriceCents,
      direction: f.direction as PriceForecastDto['direction'],
      promoLikelihood: f.promoLikelihood,
      confidence: f.confidence,
    }));
  }

  /** Nightly batch: queue every product with enough price history. */
  @Cron('0 3 * * *')
  async scheduleNightlyForecasts(): Promise<void> {
    const groups = await this.prisma.price.groupBy({
      by: ['productId'],
      _count: { productId: true },
      having: { productId: { _count: { gte: MIN_POINTS } } },
    });
    if (groups.length === 0) {
      this.logger.log('Nightly forecasting: no products with enough price history');
      return;
    }
    await this.forecastingQueue.addBulk(
      groups.map((g) => ({
        name: 'forecast-product',
        data: { productId: g.productId },
        opts: { attempts: 2, backoff: { type: 'exponential' as const, delay: 30_000 }, removeOnComplete: true },
      })),
    );
    this.logger.log(`Nightly forecasting: queued ${groups.length} products`);
  }
}
