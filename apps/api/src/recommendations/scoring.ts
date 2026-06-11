/**
 * Pure scoring helpers for recipe recommendations and meal planning.
 *
 * Recommendation score =
 *   pantryCoverage x 0.5 + budgetFit x 0.3 + nutritionFit x 0.2
 */

export const DEFAULT_MAX_BUDGET_PER_SERVING_CENTS = 800;

export interface NutritionGoals {
  dailyCalories?: number;
  dailyProteinG?: number;
}

export interface NutritionPerServing {
  calories: number;
  proteinG: number;
  healthScore: number;
}

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** 1 at zero cost, 0 when cost per serving reaches/exceeds the budget cap. */
export function budgetFit(
  costPerServingCents: number,
  maxBudgetPerServingCents: number = DEFAULT_MAX_BUDGET_PER_SERVING_CENTS,
): number {
  if (maxBudgetPerServingCents <= 0) return 0;
  return clamp01(1 - Math.min(1, costPerServingCents / maxBudgetPerServingCents));
}

/** 1 when actual equals target, linearly down to 0 at 100% deviation. */
export function closeness(actual: number, target: number): number {
  if (target <= 0) return 0.5;
  return Math.max(0, 1 - Math.abs(actual - target) / target);
}

/**
 * Per-serving nutrition fit against the user's daily goals (split across
 * mealsPerDay). Falls back to healthScore/100 when no goals are set, and to
 * a neutral 0.5 when nutrition is unknown.
 */
export function nutritionFit(
  nutrition: NutritionPerServing | null,
  goals: NutritionGoals | null,
  mealsPerDay = 3,
): number {
  if (!nutrition) return 0.5;
  const meals = Math.max(1, mealsPerDay);
  const parts: number[] = [];
  if (goals && typeof goals.dailyCalories === 'number' && goals.dailyCalories > 0) {
    parts.push(closeness(nutrition.calories, goals.dailyCalories / meals));
  }
  if (goals && typeof goals.dailyProteinG === 'number' && goals.dailyProteinG > 0) {
    parts.push(closeness(nutrition.proteinG, goals.dailyProteinG / meals));
  }
  if (parts.length > 0) {
    return clamp01(parts.reduce((a, b) => a + b, 0) / parts.length);
  }
  return clamp01(nutrition.healthScore / 100);
}

export interface RecommendationScoreInput {
  pantryCoverage: number;
  costPerServingCents: number;
  maxBudgetPerServingCents?: number;
  nutrition: NutritionPerServing | null;
  goals: NutritionGoals | null;
  mealsPerDay?: number;
}

export function computeRecommendationScore(input: RecommendationScoreInput): number {
  const coverage = clamp01(input.pantryCoverage);
  const budget = budgetFit(
    input.costPerServingCents,
    input.maxBudgetPerServingCents ?? DEFAULT_MAX_BUDGET_PER_SERVING_CENTS,
  );
  const nutrition = nutritionFit(input.nutrition, input.goals, input.mealsPerDay ?? 3);
  const score = coverage * 0.5 + budget * 0.3 + nutrition * 0.2;
  return Math.round(score * 10_000) / 10_000;
}
