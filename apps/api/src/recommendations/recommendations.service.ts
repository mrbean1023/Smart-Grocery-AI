import { Injectable, Logger } from '@nestjs/common';
import type { IngredientCategory, NutritionDto } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/types';
import { PantryService } from '../pantry/pantry.service';
import { filterRecipesByDiet } from './diet-filter';
import {
  computeRecommendationScore,
  DEFAULT_MAX_BUDGET_PER_SERVING_CENTS,
  type NutritionGoals,
} from './scoring';
import { estimateRecipeCost, fetchIngredientCosts } from './recipe-cost.util';

export interface RecipeRecommendationDto {
  recipe: {
    id: string;
    title: string;
    imageUrl: string | null;
    nutrition: NutritionDto | null;
    tags: string[];
  };
  score: number;
  pantryCoverage: number;
  estimatedCostCents: number;
  missingIngredients: string[];
}

interface CandidateIngredient {
  ingredientId: string | null;
  normalizedQtyG: number | null;
  optional: boolean;
  rawText: string;
  ingredient: {
    id: string;
    name: string;
    displayName: string;
    category: IngredientCategory;
  } | null;
}

const CANDIDATE_POOL_SIZE = 200;

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pantry: PantryService,
  ) {}

  async recommendRecipes(
    user: AuthUser,
    budgetCents: number | undefined,
    limit: number,
  ): Promise<RecipeRecommendationDto[]> {
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { dietaryRestrictions: true, nutritionGoals: true },
    });
    const restrictions = profile?.dietaryRestrictions ?? [];
    const goals = (profile?.nutritionGoals as unknown as NutritionGoals | null) ?? null;

    const recipes = await this.prisma.recipe.findMany({
      where: {
        status: 'READY',
        deletedAt: null,
        OR: [{ isPublic: true }, { userId: user.id }],
      },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        tags: true,
        servings: true,
        nutrition: true,
        ingredients: {
          select: {
            ingredientId: true,
            normalizedQtyG: true,
            optional: true,
            rawText: true,
            ingredient: {
              select: { id: true, name: true, displayName: true, category: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_POOL_SIZE,
    });

    const allowed = filterRecipesByDiet(
      recipes.map((r) => ({
        ...r,
        ingredients: r.ingredients.map((i) => ({
          name: i.ingredient?.name ?? i.rawText,
          category: (i.ingredient?.category as string | null) ?? null,
          original: i,
        })),
      })),
      restrictions,
    );

    if (allowed.length === 0) return [];

    // Gather every linked ingredient id once for cost + pantry lookups.
    const allIngredientIds = [
      ...new Set(
        allowed.flatMap((r) =>
          r.ingredients
            .map((i) => i.original.ingredientId)
            .filter((id): id is string => id !== null),
        ),
      ),
    ];

    const [costs, availability] = await Promise.all([
      fetchIngredientCosts(this.prisma, allIngredientIds),
      this.pantry.coverageForIngredients(user.id, allIngredientIds),
    ]);

    const maxBudgetPerServing = budgetCents ?? DEFAULT_MAX_BUDGET_PER_SERVING_CENTS;

    const results: RecipeRecommendationDto[] = allowed.map((r) => {
      const ingredients: CandidateIngredient[] = r.ingredients.map((i) => ({
        ingredientId: i.original.ingredientId,
        normalizedQtyG: i.original.normalizedQtyG,
        optional: i.original.optional,
        rawText: i.original.rawText,
        ingredient: i.original.ingredient as CandidateIngredient['ingredient'],
      }));

      const cost = estimateRecipeCost(ingredients, costs);
      const servings = Math.max(1, r.servings);
      const costPerServing = Math.round(cost.totalCents / servings);

      const { coverage, missing } = this.pantryCoverage(ingredients, availability);

      const nutrition = r.nutrition
        ? {
            calories: r.nutrition.calories,
            proteinG: r.nutrition.proteinG,
            healthScore: r.nutrition.healthScore,
          }
        : null;

      const score = computeRecommendationScore({
        pantryCoverage: coverage,
        costPerServingCents: costPerServing,
        maxBudgetPerServingCents: maxBudgetPerServing,
        nutrition,
        goals,
      });

      return {
        recipe: {
          id: r.id,
          title: r.title,
          imageUrl: r.imageUrl,
          nutrition: r.nutrition
            ? {
                calories: r.nutrition.calories,
                proteinG: r.nutrition.proteinG,
                carbsG: r.nutrition.carbsG,
                fatG: r.nutrition.fatG,
                fibreG: r.nutrition.fibreG,
                sodiumMg: r.nutrition.sodiumMg,
                sugarG: r.nutrition.sugarG,
                healthScore: r.nutrition.healthScore,
              }
            : null,
          tags: r.tags,
        },
        score,
        pantryCoverage: Math.round(coverage * 1000) / 1000,
        estimatedCostCents: cost.totalCents,
        missingIngredients: missing,
      };
    });

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Fraction of required (non-optional) ingredient mass available in the
   * pantry, plus the list of ingredients that are missing or insufficient.
   * Ingredients without a mass estimate cannot be covered and count as missing.
   */
  private pantryCoverage(
    ingredients: CandidateIngredient[],
    availability: Map<string, number>,
  ): { coverage: number; missing: string[] } {
    let requiredTotal = 0;
    let coveredTotal = 0;
    const missing: string[] = [];

    for (const ing of ingredients) {
      if (ing.optional) continue;
      const name = ing.ingredient?.displayName ?? ing.rawText;
      const required = ing.normalizedQtyG ?? null;
      if (!ing.ingredientId || required === null || required <= 0) {
        // Unlinked or unquantified — we can't verify it; treat as missing
        // without affecting the mass-based coverage ratio.
        missing.push(name);
        continue;
      }
      requiredTotal += required;
      const available = availability.get(ing.ingredientId) ?? 0;
      coveredTotal += Math.min(available, required);
      if (available < required) missing.push(name);
    }

    const coverage = requiredTotal > 0 ? coveredTotal / requiredTotal : 0;
    return { coverage, missing: [...new Set(missing)] };
  }
}
