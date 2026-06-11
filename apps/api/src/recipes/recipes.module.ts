import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OcrModule } from '../ocr/ocr.module';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { NutritionModule } from '../nutrition/nutrition.module';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { RecipeProcessor } from './recipe.processor';
import { RecipeMapper } from './recipe.mapper';
import { RECIPE_PROCESSING_QUEUE } from './recipe-processing.types';

@Module({
  imports: [
    BullModule.registerQueue({ name: RECIPE_PROCESSING_QUEUE }),
    OcrModule,
    IngredientsModule,
    NutritionModule,
  ],
  controllers: [RecipesController],
  providers: [RecipesService, RecipeProcessor, RecipeMapper],
  exports: [RecipesService],
})
export class RecipesModule {}
