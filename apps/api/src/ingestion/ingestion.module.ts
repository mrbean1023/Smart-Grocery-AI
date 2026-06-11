import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PricesModule } from '../prices/prices.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { IngestionProcessor } from './ingestion.processor';
import { CsvPriceAdapter } from './adapters/csv-price.adapter';
import { ExcelPriceAdapter } from './adapters/excel-price.adapter';
import { ApiFeedAdapter } from './adapters/api-feed.adapter';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'ingestion' }),
    BullModule.registerQueue({ name: 'matching' }),
    forwardRef(() => PricesModule),
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionProcessor,
    CsvPriceAdapter,
    ExcelPriceAdapter,
    ApiFeedAdapter,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
