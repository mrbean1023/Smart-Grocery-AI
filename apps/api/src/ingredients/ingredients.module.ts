import { Module } from '@nestjs/common';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';
import { NormalizationService } from './normalization.service';

@Module({
  controllers: [IngredientsController],
  providers: [IngredientsService, NormalizationService],
  exports: [IngredientsService, NormalizationService],
})
export class IngredientsModule {}
