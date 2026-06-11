import { forwardRef, Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { PriceNormalizationService } from './price-normalization.service';
import { PriceComparisonService } from './price-comparison.service';
import { PriceSubmissionsService } from './price-submissions.service';

@Module({
  imports: [forwardRef(() => IngestionModule)],
  controllers: [PricesController],
  providers: [
    PricesService,
    PriceNormalizationService,
    PriceComparisonService,
    PriceSubmissionsService,
  ],
  exports: [PricesService, PriceNormalizationService],
})
export class PricesModule {}
