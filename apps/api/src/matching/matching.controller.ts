import { Controller, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { MatchingJobData } from './matching.processor';

@Controller('matching')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class MatchingController {
  constructor(@InjectQueue('matching') private readonly matchingQueue: Queue<MatchingJobData>) {}

  @Post('rebuild')
  async rebuild() {
    const job = await this.matchingQueue.add(
      'rebuild',
      { rebuild: true },
      { removeOnComplete: true },
    );
    return { enqueued: true, jobId: job.id };
  }
}
