import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { IngestionService } from './ingestion.service';

export interface IngestionJobData {
  runId: string;
}

@Processor('ingestion')
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly ingestion: IngestionService) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<void> {
    this.logger.log(`Processing ingestion job ${job.id} (run ${job.data.runId})`);
    await this.ingestion.executeRun(job.data.runId);
  }
}
