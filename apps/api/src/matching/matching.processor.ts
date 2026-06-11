import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ProductMatchingService } from './product-matching.service';

export type MatchingJobData =
  | { productId: string; rebuild?: never }
  | { rebuild: true; productId?: never };

@Processor('matching')
export class MatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(private readonly matching: ProductMatchingService) {
    super();
  }

  async process(job: Job<MatchingJobData>): Promise<void> {
    if (job.data.rebuild === true) {
      this.logger.log(`Processing full match rebuild (job ${job.id})`);
      await this.matching.rebuildAll();
      return;
    }
    if (job.data.productId) {
      await this.matching.matchProduct(job.data.productId);
      return;
    }
    this.logger.warn(`Matching job ${job.id} carried no productId and no rebuild flag, skipping`);
  }
}
