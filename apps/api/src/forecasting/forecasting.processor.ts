import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PriceForecastService, type ForecastingJobData } from './price-forecast.service';

@Processor('forecasting')
export class ForecastingProcessor extends WorkerHost {
  private readonly logger = new Logger(ForecastingProcessor.name);

  constructor(private readonly forecasts: PriceForecastService) {
    super();
  }

  async process(job: Job<ForecastingJobData>): Promise<void> {
    if (!job.data.productId) {
      this.logger.warn(`Forecasting job ${job.id} carried no productId, skipping`);
      return;
    }
    await this.forecasts.forecastProduct(job.data.productId);
  }
}
