import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PriceForecastService } from './price-forecast.service';
import { ForecastingProcessor } from './forecasting.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'forecasting' })],
  providers: [PriceForecastService, ForecastingProcessor],
  exports: [PriceForecastService],
})
export class ForecastingModule {}
