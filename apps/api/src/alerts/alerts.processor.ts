import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AlertScanService, ScanName } from './alert-scan.service';
import { ALERTS_QUEUE } from './alerts.scheduler';

const SCAN_NAMES: ReadonlySet<string> = new Set([
  'price-drop',
  'expiring',
  'promotions',
  'budget-overrun',
]);

/**
 * Executes alert scan jobs from the 'alerts' queue. The queue serializes
 * execution (default concurrency 1 per worker), and AlertScanService holds an
 * in-process lock per scan name as a second layer against overlap.
 */
@Processor(ALERTS_QUEUE)
export class AlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsProcessor.name);

  constructor(private readonly scans: AlertScanService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (!SCAN_NAMES.has(job.name)) {
      this.logger.warn(`Ignoring unknown alerts job "${job.name}"`);
      return;
    }
    this.logger.log(`Running alert scan job "${job.name}" (id ${job.id})`);
    await this.scans.runScan(job.name as ScanName);
  }
}
