import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MealPlan, MealPlanSlot, MealType, Prisma, RecipeNutrition } from '@prisma/client';
import type {
  GenerateMealPlanInput,
  MealPlanDto,
  MealPlanSlotDto,
  NutritionDto,
  Paginated,
} from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import { OpenAiService } from '../ai/openai.service';
import { AuthUser } from '../auth/types';
import { filterRecipesByDiet } from '../recommendations/diet-filter';
import {
  DEFAULT_MAX_BUDGET_PER_SERVING_CENTS,
  clamp01,
  nutritionFit,
  type NutritionGoals,
} from '../recommendations/scoring';
import { estimateRecipeCost, fetchIngredientCosts } from '../recommendations/recipe-cost.util';
import { buildPlanSlots, PERIOD_DAYS, type CandidateRecipe } from './plan-builder';

export interface UpdateSlotInput {
  recipeId?: string;
  servings?: number;
}

type SlotWithRecipe = MealPlanSlot & {
  recipe:
    | {
        id: string;
        title: string;
        imageUrl: string | null;
        nutrition: RecipeNutrition | null;
      }
    | null;
};

type PlanWithSlots = MealPlan & { slots: SlotWithRecipe[] };

@Injectable()
export class MealPlansService {
  private readonly logger = new Logger(MealPlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly openAi: OpenAiService,
  ) {}

  // ------------------------------------------------------------------
  // Generation
  // ------------------------------------------------------------------

  async generate(user: AuthUser, input: GenerateMealPlanInput): Promise<MealPlanDto> {
    await this.quota.assertPremium(user, 'meal_planning');

    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { dietaryRestrictions: true, nutritionGoals: true },
    });
    // Explicit request restrictions win; otherwise fall back to profile.
    const restrictions =
      input.dietaryRestrictions.length > 0
        ? input.dietaryRestrictions
        : (profile?.dietaryRestrictions ?? []);

    const recipes = await this.prisma.recipe.findMany({
      where: {
        status: 'READY',
        deletedAt: null,
        OR: [{ isPublic: true }, { userId: user.id }],
      },
      select: {
        id: true,
        title: true,
        tags: true,
        servings: true,
        nutrition: true,
        ingredients: {
          select: {
            ingredientId: true,
            normalizedQtyG: true,
            optional: true,
            rawText: true,
            ingredient: { select: { name: true, category: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    const allowed = filterRecipesByDiet(
      recipes.map((recipe) => ({
        recipe,
        tags: recipe.tags,
        ingredients: recipe.ingredients.map((i) => ({
          name: i.ingredient?.name ?? i.rawText,
          category: (i.ingredient?.category as string | null) ?? null,
        })),
      })),
      restrictions,
    ).map((entry) => entry.recipe);

    if (allowed.length === 0) {
      throw new BadRequestException(
        'No recipes satisfy the requested dietary restrictions — add or import suitable recipes first',
      );
    }

    // Cost estimation: one query for all ingredients across candidates.
    const ingredientIds = [
      ...new Set(
        allowed.flatMap((r) =>
          r.ingredients.map((i) => i.ingredientId).filter((id): id is string => id !== null),
        ),
      ),
    ];
    const costs = await fetchIngredientCosts(this.prisma, ingredientIds);

    const goals: NutritionGoals = {
      dailyCalories: input.targetCalories ?? undefined,
      dailyProteinG: input.targetProteinG ?? undefined,
    };
    if (goals.dailyCalories === undefined && goals.dailyProteinG === undefined) {
      const profileGoals = (profile?.nutritionGoals as unknown as NutritionGoals | null) ?? null;
      if (profileGoals) {
        goals.dailyCalories = profileGoals.dailyCalories;
        goals.dailyProteinG = profileGoals.dailyProteinG;
      }
    }

    let unmatchedCostIngredients = 0;
    const candidates: CandidateRecipe[] = allowed.map((r) => {
      const est = estimateRecipeCost(r.ingredients, costs);
      unmatchedCostIngredients += est.ingredientCount - est.matchedCount;
      const servings = Math.max(1, r.servings);
      const costPerServing = Math.round(est.totalCents / servings);
      const nutrition = r.nutrition
        ? {
            calories: r.nutrition.calories,
            proteinG: r.nutrition.proteinG,
            healthScore: r.nutrition.healthScore,
          }
        : null;
      const fit = nutritionFit(nutrition, goals, input.mealsPerDay);
      const costScore = clamp01(1 - Math.min(1, costPerServing / DEFAULT_MAX_BUDGET_PER_SERVING_CENTS));
      return {
        id: r.id,
        title: r.title,
        caloriesPerServing: nutrition?.calories ?? 0,
        proteinPerServing: nutrition?.proteinG ?? 0,
        costPerServingCents: costPerServing,
        baseScore: 0.6 * fit + 0.4 * costScore,
      };
    });

    const days = PERIOD_DAYS[input.period];
    const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + days - 1);

    const built = buildPlanSlots(candidates, {
      days,
      mealsPerDay: input.mealsPerDay,
      targetCalories: input.targetCalories ?? null,
      budgetCents: input.budgetCents ?? null,
      startDate,
    });

    if (built.slots.length === 0) {
      throw new BadRequestException('Could not build a meal plan from the available recipes');
    }

    const name = await this.generatePlanName(input, restrictions);

    const plan = await this.prisma.mealPlan.create({
      data: {
        userId: user.id,
        name,
        period: input.period,
        startDate,
        endDate,
        budgetCents: input.budgetCents ?? null,
        targetCalories: input.targetCalories ?? null,
        targetProteinG: input.targetProteinG ?? null,
        dietaryRestrictions: restrictions,
        estimatedCostCents: built.totalCostCents,
        generationMeta: {
          candidateCount: candidates.length,
          unmatchedCostIngredients,
          warnings: built.warnings,
          mealsPerDay: input.mealsPerDay,
        } as Prisma.InputJsonValue,
        slots: {
          create: built.slots.map((s) => ({
            recipeId: s.recipeId,
            date: s.date,
            mealType: s.mealType as MealType,
            servings: s.servings,
          })),
        },
      },
    });

    return this.getById(user.id, plan.id);
  }

  // ------------------------------------------------------------------
  // Read / delete / slot updates
  // ------------------------------------------------------------------

  async list(userId: string, page: number, pageSize: number): Promise<Paginated<MealPlanDto>> {
    const where: Prisma.MealPlanWhereInput = { userId };
    const [total, plans] = await this.prisma.$transaction([
      this.prisma.mealPlan.count({ where }),
      this.prisma.mealPlan.findMany({
        where,
        include: { slots: { include: { recipe: this.recipeSummarySelect() }, orderBy: { date: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: (plans as PlanWithSlots[]).map((p) => this.toDto(p)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(userId: string, id: string): Promise<MealPlanDto> {
    const plan = (await this.prisma.mealPlan.findFirst({
      where: { id, userId },
      include: {
        slots: {
          include: { recipe: this.recipeSummarySelect() },
          orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
        },
      },
    })) as PlanWithSlots | null;
    if (!plan) throw new NotFoundException('Meal plan not found');
    return this.toDto(plan);
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const result = await this.prisma.mealPlan.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Meal plan not found');
    return { deleted: true };
  }

  async updateSlot(
    user: AuthUser,
    planId: string,
    slotId: string,
    input: UpdateSlotInput,
  ): Promise<MealPlanDto> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id: planId, userId: user.id },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('Meal plan not found');

    const slot = await this.prisma.mealPlanSlot.findFirst({
      where: { id: slotId, mealPlanId: planId },
    });
    if (!slot) throw new NotFoundException('Meal plan slot not found');

    if (input.recipeId !== undefined) {
      const recipe = await this.prisma.recipe.findFirst({
        where: { id: input.recipeId, status: 'READY', deletedAt: null },
        select: { id: true, isPublic: true, userId: true },
      });
      if (!recipe) throw new NotFoundException('Recipe not found or not ready');
      if (!recipe.isPublic && recipe.userId !== user.id) {
        throw new ForbiddenException('You do not have access to this recipe');
      }
    }

    await this.prisma.mealPlanSlot.update({
      where: { id: slotId },
      data: {
        ...(input.recipeId !== undefined ? { recipeId: input.recipeId } : {}),
        ...(input.servings !== undefined ? { servings: input.servings } : {}),
      },
    });

    await this.recomputeEstimatedCost(planId);
    return this.getById(user.id, planId);
  }

  /** Re-price every slot (cheapest offer per ingredient) and persist the plan total. */
  private async recomputeEstimatedCost(planId: string): Promise<void> {
    const slots = await this.prisma.mealPlanSlot.findMany({
      where: { mealPlanId: planId },
      include: {
        recipe: {
          select: {
            id: true,
            servings: true,
            ingredients: {
              select: { ingredientId: true, normalizedQtyG: true, optional: true },
            },
          },
        },
      },
    });

    const ingredientIds = [
      ...new Set(
        slots.flatMap((s) =>
          (s.recipe?.ingredients ?? [])
            .map((i) => i.ingredientId)
            .filter((id): id is string => id !== null),
        ),
      ),
    ];
    const costs = await fetchIngredientCosts(this.prisma, ingredientIds);

    let totalCents = 0;
    const perRecipeCost = new Map<string, number>();
    for (const slot of slots) {
      if (!slot.recipe) continue;
      let costPerServing = perRecipeCost.get(slot.recipe.id);
      if (costPerServing === undefined) {
        const est = estimateRecipeCost(slot.recipe.ingredients, costs);
        costPerServing = Math.round(est.totalCents / Math.max(1, slot.recipe.servings));
        perRecipeCost.set(slot.recipe.id, costPerServing);
      }
      totalCents += costPerServing * slot.servings;
    }

    await this.prisma.mealPlan.update({
      where: { id: planId },
      data: { estimatedCostCents: totalCents },
    });
  }

  // ------------------------------------------------------------------

  private async generatePlanName(
    input: GenerateMealPlanInput,
    restrictions: string[],
  ): Promise<string> {
    const fallback = `${input.period.charAt(0)}${input.period.slice(1).toLowerCase()} plan from ${input.startDate}`;
    if (!this.openAi.isConfigured()) return fallback;
    try {
      const name = await this.openAi.chatText({
        system:
          'You name meal plans. Reply with a single short, friendly plan name (max 6 words, no quotes).',
        user:
          `Period: ${input.period}. Start: ${input.startDate}. ` +
          `Restrictions: ${restrictions.join(', ') || 'none'}. ` +
          `Budget: ${input.budgetCents ? `S$${(input.budgetCents / 100).toFixed(2)}` : 'flexible'}. ` +
          `Target calories/day: ${input.targetCalories ?? 'flexible'}.`,
        temperature: 0.8,
        maxTokens: 30,
      });
      const cleaned = name.trim().replace(/^["']|["']$/g, '').slice(0, 80);
      return cleaned.length > 0 ? cleaned : fallback;
    } catch (err) {
      this.logger.warn(
        `AI plan naming failed, using fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
      return fallback;
    }
  }

  private recipeSummarySelect() {
    return {
      select: { id: true, title: true, imageUrl: true, nutrition: true },
    } as const;
  }

  private toDto(plan: PlanWithSlots): MealPlanDto {
    return {
      id: plan.id,
      name: plan.name,
      period: plan.period,
      startDate: plan.startDate.toISOString().slice(0, 10),
      endDate: plan.endDate.toISOString().slice(0, 10),
      budgetCents: plan.budgetCents,
      targetCalories: plan.targetCalories,
      targetProteinG: plan.targetProteinG,
      estimatedCostCents: plan.estimatedCostCents,
      slots: plan.slots.map((s) => this.slotToDto(s)),
    };
  }

  private slotToDto(slot: SlotWithRecipe): MealPlanSlotDto {
    return {
      id: slot.id,
      date: slot.date.toISOString().slice(0, 10),
      mealType: slot.mealType,
      servings: slot.servings,
      recipe: slot.recipe
        ? {
            id: slot.recipe.id,
            title: slot.recipe.title,
            imageUrl: slot.recipe.imageUrl,
            nutrition: slot.recipe.nutrition ? this.nutritionToDto(slot.recipe.nutrition) : null,
          }
        : null,
    };
  }

  private nutritionToDto(n: RecipeNutrition): NutritionDto {
    return {
      calories: n.calories,
      proteinG: n.proteinG,
      carbsG: n.carbsG,
      fatG: n.fatG,
      fibreG: n.fibreG,
      sodiumMg: n.sodiumMg,
      sugarG: n.sugarG,
      healthScore: n.healthScore,
    };
  }
}
