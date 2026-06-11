import { Injectable, Logger } from '@nestjs/common';
import type {
  Ingredient,
  Recipe,
  RecipeIngredient,
  RecipeNutrition,
} from '@prisma/client';
import type {
  IngredientCategory,
  RecipeDto,
  RecipeIngredientDto,
  RecipeSource,
  RecipeStatus,
} from '@smart-grocery/shared';
import { StorageService } from '../storage/storage.service';

export type RecipeWithRelations = Recipe & {
  ingredients: Array<RecipeIngredient & { ingredient: Ingredient | null }>;
  nutrition: RecipeNutrition | null;
};

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

@Injectable()
export class RecipeMapper {
  private readonly logger = new Logger(RecipeMapper.name);

  constructor(private readonly storage: StorageService) {}

  async toDto(recipe: RecipeWithRelations): Promise<RecipeDto> {
    // Recipe.imageUrl holds either an external http(s) URL (URL imports) or
    // an internal storage key (uploads) that must be presigned.
    let imageUrl: string | null = recipe.imageUrl;
    if (imageUrl && !isExternalUrl(imageUrl)) {
      try {
        imageUrl = await this.storage.getSignedUrl(imageUrl);
      } catch (err) {
        this.logger.warn(
          `Failed to presign image for recipe ${recipe.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        imageUrl = null;
      }
    }

    const ingredients: RecipeIngredientDto[] = [...recipe.ingredients]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        rawText: item.rawText,
        quantity: item.quantity,
        unit: item.unit,
        normalizedQtyG: item.normalizedQtyG,
        optional: item.optional,
        matchConfidence: item.matchConfidence,
        ingredient: item.ingredient
          ? {
              id: item.ingredient.id,
              name: item.ingredient.name,
              displayName: item.ingredient.displayName,
              category: item.ingredient.category as IngredientCategory,
            }
          : null,
      }));

    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      source: recipe.source as RecipeSource,
      status: recipe.status as RecipeStatus,
      sourceUrl: recipe.sourceUrl,
      imageUrl,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      instructions: recipe.instructions,
      tags: recipe.tags,
      cuisine: recipe.cuisine,
      failureReason: recipe.failureReason,
      ingredients,
      nutrition: recipe.nutrition
        ? {
            calories: recipe.nutrition.calories,
            proteinG: recipe.nutrition.proteinG,
            carbsG: recipe.nutrition.carbsG,
            fatG: recipe.nutrition.fatG,
            fibreG: recipe.nutrition.fibreG,
            sodiumMg: recipe.nutrition.sodiumMg,
            sugarG: recipe.nutrition.sugarG,
            healthScore: recipe.nutrition.healthScore,
          }
        : null,
      createdAt: recipe.createdAt.toISOString(),
    };
  }
}
