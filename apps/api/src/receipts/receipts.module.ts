import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OcrModule } from '../ocr/ocr.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceiptsProcessor } from './receipts.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'receipt-processing' }), OcrModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptsProcessor],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
