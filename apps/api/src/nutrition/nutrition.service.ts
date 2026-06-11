import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PerServingNutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
  sodiumMg: number;
  sugarG: number;
}

const COVERAGE_WARN_THRESHOLD = 0.3;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Health score 0-100 from per-serving macros.
 * Baseline 70, protein/fibre bonuses, sodium/sugar/fat penalties.
 */
export function computeHealthScore(perServing: PerServingNutrition): number {
  let score = 70;
  score += Math.min(20, perServing.proteinG * 0.5);
  score += Math.min(10, perServing.fibreG * 2);
  score -= Math.min(25, perServing.sodiumMg / 80);
  score -= Math.min(15, Math.max(0, perServing.sugarG - 10) * 1.5);
  score -= Math.min(15, Math.max(0, perServing.fatG - 25));
  return round1(Math.min(100, Math.max(0, score)));
}

@Injectable()
export class NutritionService {
  private readonly logger = new Logger(NutritionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sum ingredient nutrition (per 100g) weighted by normalized gram
   * quantities, divide by servings, score, and upsert RecipeNutrition.
   * Ingredients without nutrition rows are skipped but tracked as coverage.
   */
  async computeRecipeNutrition(recipeId: string): Promise<void> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: {
          include: { ingredient: { include: { nutrition: true } } },
        },
      },
    });
    if (!recipe) {
      this.logger.warn(`computeRecipeNutrition: recipe ${recipeId} not found`);
      return;
    }

    const totals: PerServingNutrition = {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fibreG: 0,
      sodiumMg: 0,
      sugarG: 0,
    };
    let totalMassG = 0;
    let coveredMassG = 0;

    for (const item of recipe.ingredients) {
      const qtyG = item.normalizedQtyG;
      if (qtyG === null || qtyG === undefined || qtyG <= 0) continue;
      totalMassG += qtyG;
      const nutrition = item.ingredient?.nutrition;
      if (!nutrition) continue;
      coveredMassG += qtyG;
      const factor = qtyG / 100;
      totals.calories += nutrition.calories * factor;
      totals.proteinG += nutrition.proteinG * factor;
      totals.carbsG += nutrition.carbsG * factor;
      totals.fatG += nutrition.fatG * factor;
      totals.fibreG += nutrition.fibreG * factor;
      totals.sodiumMg += nutrition.sodiumMg * factor;
      totals.sugarG += nutrition.sugarG * factor;
    }

    const servings = Math.max(1, recipe.servings);
    const perServing: PerServingNutrition = {
      calories: round1(totals.calories / servings),
      proteinG: round1(totals.proteinG / servings),
      carbsG: round1(totals.carbsG / servings),
      fatG: round1(totals.fatG / servings),
      fibreG: round1(totals.fibreG / servings),
      sodiumMg: round1(totals.sodiumMg / servings),
      sugarG: round1(totals.sugarG / servings),
    };
    const healthScore = computeHealthScore(perServing);

    const coverage = totalMassG > 0 ? coveredMassG / totalMassG : 0;
    if (coverage < COVERAGE_WARN_THRESHOLD) {
      this.logger.warn(
        `Recipe ${recipeId}: nutrition coverage ${(coverage * 100).toFixed(0)}% of mass — health score may be unreliable`,
      );
    }

    await this.prisma.recipeNutrition.upsert({
      where: { recipeId },
      create: { recipeId, ...perServing, healthScore, computedAt: new Date() },
      update: { ...perServing, healthScore, computedAt: new Date() },
    });
    this.logger.log(
      `Recipe ${recipeId}: nutrition computed (coverage ${(coverage * 100).toFixed(0)}%, score ${healthScore})`,
    );
  }
}
