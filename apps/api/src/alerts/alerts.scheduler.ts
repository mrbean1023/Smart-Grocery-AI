import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { ScanName } from './alert-scan.service';

export const ALERTS_QUEUE = 'alerts';

/**
 * Cron handlers only enqueue scan jobs on the 'alerts' BullMQ queue; the
 * AlertsProcessor executes them. With multiple K8s replicas every replica's
 * cron fires, but jobs use deterministic jobIds (scan name + time bucket) so
 * duplicates are collapsed by BullMQ, and the queue serializes execution —
 * making concurrent replicas safe-ish without a distributed lock.
 */
@Injectable()
export class AlertsScheduler {
  private readonly logger = new Logger(AlertsScheduler.name);

  constructor(@InjectQueue(ALERTS_QUEUE) private readonly queue: Queue) {}

  @Cron(CronExpression.EVERY_HOUR)
  async enqueuePriceDropScan(): Promise<void> {
    await this.enqueue('price-drop', 'hour');
  }

  @Cron('0 8 * * *', { timeZone: 'Asia/Singapore' })
  async enqueueExpiringScan(): Promise<void> {
    await this.enqueue('expiring', 'day');
  }

  @Cron('0 9 * * *', { timeZone: 'Asia/Singapore' })
  async enqueuePromotionsScan(): Promise<void> {
    await this.enqueue('promotions', 'day');
  }

  @Cron('0 10 * * 1', { timeZone: 'Asia/Singapore' })
  async enqueueBudgetOverrunScan(): Promise<void> {
    await this.enqueue('budget-overrun', 'day');
  }

  private async enqueue(name: ScanName, bucket: 'hour' | 'day'): Promise<void> {
    // Deterministic job id per time bucket dedupes jobs across replicas.
    const stamp =
      bucket === 'hour'
        ? new Date().toISOString().slice(0, 13) // YYYY-MM-DDTHH
        : new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    try {
      await this.queue.add(
        name,
        {},
        {
          jobId: `${name}:${stamp}`,
          removeOnComplete: 100,
          removeOnFail: 100,
          attempts: 1,
        },
      );
      this.logger.log(`Enqueued alert scan "${name}" (${stamp})`);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue alert scan "${name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
