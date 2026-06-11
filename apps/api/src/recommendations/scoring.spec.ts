import {
  budgetFit,
  closeness,
  computeRecommendationScore,
  DEFAULT_MAX_BUDGET_PER_SERVING_CENTS,
  nutritionFit,
} from './scoring';
import { estimateRecipeCost } from './recipe-cost.util';

describe('budgetFit', () => {
  it('is 1 at zero cost and 0 at/above the cap', () => {
    expect(budgetFit(0, 800)).toBe(1);
    expect(budgetFit(800, 800)).toBe(0);
    expect(budgetFit(1600, 800)).toBe(0);
  });

  it('is linear in between and uses the default cap', () => {
    expect(budgetFit(400, 800)).toBeCloseTo(0.5);
    expect(budgetFit(DEFAULT_MAX_BUDGET_PER_SERVING_CENTS / 4)).toBeCloseTo(0.75);
  });
});

describe('nutritionFit', () => {
  it('is neutral 0.5 with no nutrition data', () => {
    expect(nutritionFit(null, { dailyCalories: 2000 })).toBe(0.5);
  });

  it('uses healthScore when no goals are set', () => {
    expect(nutritionFit({ calories: 500, proteinG: 20, healthScore: 80 }, null)).toBeCloseTo(0.8);
    expect(nutritionFit({ calories: 500, proteinG: 20, healthScore: 80 }, {})).toBeCloseTo(0.8);
  });

  it('scores closeness to per-meal calorie/protein targets', () => {
    const nutrition = { calories: 600, proteinG: 40, healthScore: 50 };
    // targets: 1800/3 = 600 kcal, 120/3 = 40 g — perfect fit
    expect(nutritionFit(nutrition, { dailyCalories: 1800, dailyProteinG: 120 }, 3)).toBeCloseTo(1);
    // calories exactly on target, protein 50% off -> (1 + 0.5)/2
    expect(nutritionFit(nutrition, { dailyCalories: 1800, dailyProteinG: 240 }, 3)).toBeCloseTo(0.75);
  });

  it('closeness degrades linearly and floors at 0', () => {
    expect(closeness(100, 100)).toBe(1);
    expect(closeness(150, 100)).toBeCloseTo(0.5);
    expect(closeness(300, 100)).toBe(0);
  });
});

describe('computeRecommendationScore', () => {
  it('applies the 0.5 / 0.3 / 0.2 weighting', () => {
    const score = computeRecommendationScore({
      pantryCoverage: 1,
      costPerServingCents: 0,
      maxBudgetPerServingCents: 800,
      nutrition: { calories: 500, proteinG: 25, healthScore: 100 },
      goals: null,
    });
    expect(score).toBeCloseTo(1);

    const half = computeRecommendationScore({
      pantryCoverage: 0.5, // 0.25
      costPerServingCents: 400, // budgetFit 0.5 -> 0.15
      maxBudgetPerServingCents: 800,
      nutrition: { calories: 0, proteinG: 0, healthScore: 50 }, // 0.5 -> 0.1
      goals: null,
    });
    expect(half).toBeCloseTo(0.5);
  });

  it('clamps out-of-range coverage', () => {
    const score = computeRecommendationScore({
      pantryCoverage: 4,
      costPerServingCents: 10_000,
      maxBudgetPerServingCents: 800,
      nutrition: null,
      goals: null,
    });
    // coverage clamped to 1 (0.5) + budget 0 + neutral nutrition 0.5 (0.1)
    expect(score).toBeCloseTo(0.6);
  });

  it('ranks cheaper, better-stocked recipes higher', () => {
    const stocked = computeRecommendationScore({
      pantryCoverage: 0.9,
      costPerServingCents: 200,
      nutrition: null,
      goals: null,
    });
    const expensive = computeRecommendationScore({
      pantryCoverage: 0.1,
      costPerServingCents: 900,
      nutrition: null,
      goals: null,
    });
    expect(stocked).toBeGreaterThan(expensive);
  });
});

describe('estimateRecipeCost', () => {
  const costs = new Map([
    ['ing-1', { ingredientId: 'ing-1', minPriceCents: 500, minPerKgCents: 1000 }],
    ['ing-2', { ingredientId: 'ing-2', minPriceCents: 300, minPerKgCents: null }],
  ]);

  it('uses per-kg price x grams when available', () => {
    const est = estimateRecipeCost(
      [{ ingredientId: 'ing-1', normalizedQtyG: 250, optional: false }],
      costs,
    );
    expect(est.totalCents).toBe(250); // 1000 c/kg x 0.25 kg
    expect(est.coverage).toBe(1);
  });

  it('falls back to one pack price without grams data', () => {
    const est = estimateRecipeCost(
      [{ ingredientId: 'ing-2', normalizedQtyG: null, optional: false }],
      costs,
    );
    expect(est.totalCents).toBe(300);
  });

  it('tracks coverage for unmatched ingredients and skips optional ones', () => {
    const est = estimateRecipeCost(
      [
        { ingredientId: 'ing-1', normalizedQtyG: 100, optional: false },
        { ingredientId: 'ing-x', normalizedQtyG: 100, optional: false }, // no price
        { ingredientId: null, normalizedQtyG: 50, optional: false }, // unlinked
        { ingredientId: 'ing-2', normalizedQtyG: null, optional: true }, // optional ignored
      ],
      costs,
    );
    expect(est.totalCents).toBe(100);
    expect(est.ingredientCount).toBe(3);
    expect(est.matchedCount).toBe(1);
    expect(est.coverage).toBeCloseTo(1 / 3);
  });
});
