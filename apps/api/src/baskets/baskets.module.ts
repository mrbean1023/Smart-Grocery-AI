import { Module } from '@nestjs/common';
import { PricesModule } from '../prices/prices.module';
import { BasketsController } from './baskets.controller';
import { BasketsService } from './baskets.service';
import { BasketOptimizerService } from './basket-optimizer.service';

@Module({
  imports: [PricesModule],
  controllers: [BasketsController],
  providers: [BasketsService, BasketOptimizerService],
  exports: [BasketsService, BasketOptimizerService],
})
export class BasketsModule {}
