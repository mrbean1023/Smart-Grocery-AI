import type { MealType } from '@smart-grocery/shared';

/**
 * Deterministic greedy meal-plan builder (pure, unit-testable).
 *
 * For every day it fills mealsPerDay slots, picking per slot the candidate
 * with the highest utility = baseScore + calorieFit − repeatPenalty, subject
 * to the total budget. Calorie fit targets the remaining daily calories
 * spread over the remaining slots, steering each day toward
 * targetCalories ± 15%. Repeats within 3 days are penalized unless the
 * candidate pool is too small to allow variety.
 */

export interface CandidateRecipe {
  id: string;
  title: string;
  caloriesPerServing: number;
  proteinPerServing: number;
  costPerServingCents: number;
  /** Pre-computed goal-fit score (nutrition + cost), higher is better. */
  baseScore: number;
}

export interface BuildPlanOptions {
  days: number;
  mealsPerDay: number;
  targetCalories: number | null;
  budgetCents: number | null;
  startDate: Date;
}

export interface PlannedSlot {
  date: Date;
  mealType: MealType;
  recipeId: string;
  servings: number;
  costCents: number;
  calories: number;
}

export interface BuiltPlan {
  slots: PlannedSlot[];
  totalCostCents: number;
  warnings: string[];
}

export const MEAL_TYPES_BY_COUNT: Record<number, MealType[]> = {
  1: ['DINNER'],
  2: ['LUNCH', 'DINNER'],
  3: ['BREAKFAST', 'LUNCH', 'DINNER'],
  4: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'],
};

export const PERIOD_DAYS: Record<'DAILY' | 'WEEKLY' | 'MONTHLY', number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 28,
};

const REPEAT_WINDOW_DAYS = 3;
const REPEAT_PENALTY = 0.75;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function calorieFit(calories: number, target: number | null): number {
  if (target === null || target <= 0) return 0.5;
  return Math.max(0, 1 - Math.abs(calories - target) / target);
}

export function buildPlanSlots(candidates: CandidateRecipe[], opts: BuildPlanOptions): BuiltPlan {
  const warnings: string[] = [];
  const slots: PlannedSlot[] = [];
  if (candidates.length === 0) {
    return { slots, totalCostCents: 0, warnings: ['No candidate recipes available'] };
  }

  const mealsPerDay = Math.min(4, Math.max(1, opts.mealsPerDay));
  const mealTypes = MEAL_TYPES_BY_COUNT[mealsPerDay];
  // With a tiny pool variety is impossible — drop the repeat penalty entirely.
  const smallPool = candidates.length < mealTypes.length * 2;

  const totalSlots = opts.days * mealTypes.length;
  const minCostCents = Math.min(...candidates.map((c) => c.costPerServingCents));
  let slotsFilled = 0;
  let totalCostCents = 0;
  const lastUsedDay = new Map<string, number>();

  for (let day = 0; day < opts.days; day++) {
    let dayCalories = 0;
    for (let m = 0; m < mealTypes.length; m++) {
      const slotsLeft = mealTypes.length - m;
      const perSlotTarget =
        opts.targetCalories !== null
          ? Math.max(0, opts.targetCalories - dayCalories) / slotsLeft
          : null;

      // A candidate is affordable only if, after picking it, the remaining
      // slots can still be filled at the cheapest available cost without
      // exceeding the total budget. This keeps the plan within budget
      // whenever a within-budget plan exists at all.
      const remainingAfterThis = totalSlots - slotsFilled - 1;
      const affordable =
        opts.budgetCents !== null
          ? candidates.filter(
              (c) =>
                totalCostCents + c.costPerServingCents + remainingAfterThis * minCostCents <=
                opts.budgetCents!,
            )
          : candidates;

      let pool = affordable;
      if (pool.length === 0) {
        // Nothing fits the remaining budget — take the cheapest option and
        // flag the overrun rather than leaving the slot empty.
        const cheapest = [...candidates].sort(
          (a, b) => a.costPerServingCents - b.costPerServingCents,
        )[0];
        pool = [cheapest];
        warnings.push(
          `Budget exceeded on day ${day + 1} (${mealTypes[m]}); picked cheapest available recipe`,
        );
      }

      let best: CandidateRecipe = pool[0];
      let bestUtility = -Infinity;
      for (const c of pool) {
        const last = lastUsedDay.get(c.id);
        const repeatPenalty =
          !smallPool && last !== undefined && day - last < REPEAT_WINDOW_DAYS ? REPEAT_PENALTY : 0;
        const utility = c.baseScore + calorieFit(c.caloriesPerServing, perSlotTarget) - repeatPenalty;
        if (utility > bestUtility) {
          bestUtility = utility;
          best = c;
        }
      }

      slots.push({
        date: addDays(opts.startDate, day),
        mealType: mealTypes[m],
        recipeId: best.id,
        servings: 1,
        costCents: best.costPerServingCents,
        calories: best.caloriesPerServing,
      });
      totalCostCents += best.costPerServingCents;
      dayCalories += best.caloriesPerServing;
      lastUsedDay.set(best.id, day);
      slotsFilled += 1;
    }

    if (opts.targetCalories !== null && opts.targetCalories > 0) {
      const deviation = Math.abs(dayCalories - opts.targetCalories) / opts.targetCalories;
      if (deviation > 0.15) {
        warnings.push(
          `Day ${day + 1} calories (${Math.round(dayCalories)}) deviate ${Math.round(deviation * 100)}% from target`,
        );
      }
    }
  }

  return { slots, totalCostCents, warnings };
}
