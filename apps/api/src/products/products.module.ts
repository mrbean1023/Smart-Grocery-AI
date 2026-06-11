import { Module } from '@nestjs/common';
import { PricesModule } from '../prices/prices.module';
import { ForecastingModule } from '../forecasting/forecasting.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [PricesModule, ForecastingModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
