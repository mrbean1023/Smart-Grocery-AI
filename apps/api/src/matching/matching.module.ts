import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MatchingController } from './matching.controller';
import { ProductMatchingService } from './product-matching.service';
import { MatchingProcessor } from './matching.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'matching' })],
  controllers: [MatchingController],
  providers: [ProductMatchingService, MatchingProcessor],
  exports: [ProductMatchingService],
})
export class MatchingModule {}
