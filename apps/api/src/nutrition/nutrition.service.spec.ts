import { computeHealthScore, NutritionService } from './nutrition.service';
import type { PrismaService } from '../prisma/prisma.service';

interface MockPrisma {
  recipe: { findUnique: jest.Mock };
  recipeNutrition: { upsert: jest.Mock };
}

function buildMockPrisma(recipe: unknown): MockPrisma {
  return {
    recipe: { findUnique: jest.fn().mockResolvedValue(recipe) },
    recipeNutrition: { upsert: jest.fn().mockResolvedValue({}) },
  };
}

function ingredientRow(
  qtyG: number | null,
  per100g: Partial<{
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fibreG: number;
    sodiumMg: number;
    sugarG: number;
  }> | null,
): Record<string, unknown> {
  return {
    normalizedQtyG: qtyG,
    ingredient: per100g
      ? {
          nutrition: {
            calories: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            fibreG: 0,
            sodiumMg: 0,
            sugarG: 0,
            ...per100g,
          },
        }
      : null,
  };
}

describe('computeHealthScore', () => {
  it('returns the baseline 70 for an all-zero serving', () => {
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, sugarG: 0,
      }),
    ).toBe(70);
  });

  it('caps the protein bonus at +20', () => {
    const score = computeHealthScore({
      calories: 0, proteinG: 100, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, sugarG: 0,
    });
    expect(score).toBe(90);
  });

  it('caps the fibre bonus at +10', () => {
    const score = computeHealthScore({
      calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 20, sodiumMg: 0, sugarG: 0,
    });
    expect(score).toBe(80);
  });

  it('applies the sodium penalty (sodiumMg / 80, capped at 25)', () => {
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 800, sugarG: 0,
      }),
    ).toBe(60); // 70 - 800/80 = 60
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 10000, sugarG: 0,
      }),
    ).toBe(45); // penalty capped at 25
  });

  it('only penalises sugar above 10g, scaled by 1.5 and capped at 15', () => {
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, sugarG: 10,
      }),
    ).toBe(70);
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, sugarG: 14,
      }),
    ).toBe(64); // 70 - (14-10)*1.5
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, sugarG: 100,
      }),
    ).toBe(55); // capped at 15
  });

  it('only penalises fat above 25g, capped at 15', () => {
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 25, fibreG: 0, sodiumMg: 0, sugarG: 0,
      }),
    ).toBe(70);
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 30, fibreG: 0, sodiumMg: 0, sugarG: 0,
      }),
    ).toBe(65);
    expect(
      computeHealthScore({
        calories: 0, proteinG: 0, carbsG: 0, fatG: 100, fibreG: 0, sodiumMg: 0, sugarG: 0,
      }),
    ).toBe(55);
  });

  it('clamps to the 0-100 range and rounds to 1dp', () => {
    const max = computeHealthScore({
      calories: 0, proteinG: 100, carbsG: 0, fatG: 0, fibreG: 50, sodiumMg: 0, sugarG: 0,
    });
    expect(max).toBe(100);
    const fractional = computeHealthScore({
      calories: 0, proteinG: 1.5, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, sugarG: 0,
    });
    expect(fractional).toBe(70.8); // 70 + 0.75 → 70.8
  });
});

describe('NutritionService.computeRecipeNutrition', () => {
  it('sums per-100g nutrition weighted by grams and divides by servings', async () => {
    // Fabricated recipe: 2 servings
    //  - 500g chicken breast: 165 kcal / 31 protein / 3.6 fat / 74mg sodium per 100g
    //  - 200g jasmine rice:   130 kcal / 2.7 protein / 28.2 carbs / 0.4 fibre per 100g
    //  - 30g unknown sauce: no nutrition row (skipped, hurts coverage only)
    const recipe = {
      id: 'recipe-1',
      servings: 2,
      ingredients: [
        ingredientRow(500, { calories: 165, proteinG: 31, fatG: 3.6, sodiumMg: 74 }),
        ingredientRow(200, { calories: 130, proteinG: 2.7, carbsG: 28.2, fibreG: 0.4 }),
        ingredientRow(30, null),
        ingredientRow(null, { calories: 999 }), // no quantity → ignored entirely
      ],
    };
    const prisma = buildMockPrisma(recipe);
    const service = new NutritionService(prisma as unknown as PrismaService);

    await service.computeRecipeNutrition('recipe-1');

    expect(prisma.recipeNutrition.upsert).toHaveBeenCalledTimes(1);
    const args = prisma.recipeNutrition.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ recipeId: 'recipe-1' });

    // totals: calories 165*5 + 130*2 = 1085 → 542.5/serving
    expect(args.create.calories).toBe(542.5);
    // protein 31*5 + 2.7*2 = 160.4 → 80.2/serving
    expect(args.create.proteinG).toBe(80.2);
    // carbs 28.2*2 = 56.4 → 28.2/serving
    expect(args.create.carbsG).toBe(28.2);
    // fat 3.6*5 = 18 → 9/serving
    expect(args.create.fatG).toBe(9);
    // fibre 0.4*2 = 0.8 → 0.4/serving
    expect(args.create.fibreG).toBe(0.4);
    // sodium 74*5 = 370 → 185/serving
    expect(args.create.sodiumMg).toBe(185);

    // health score: 70 + min(20, 80.2*0.5)=20 + min(10, 0.4*2)=0.8
    //               - min(25, 185/80)=2.3125 - 0 - 0 = 88.4875 → 88.5
    expect(args.create.healthScore).toBe(88.5);
    expect(args.update.healthScore).toBe(88.5);
  });

  it('warns but still upserts when coverage is below 30% of mass', async () => {
    const recipe = {
      id: 'recipe-2',
      servings: 1,
      ingredients: [
        ingredientRow(100, { calories: 50 }), // covered
        ingredientRow(900, null), // uncovered → coverage 10%
      ],
    };
    const prisma = buildMockPrisma(recipe);
    const service = new NutritionService(prisma as unknown as PrismaService);
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await service.computeRecipeNutrition('recipe-2');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('coverage 10%'));
    expect(prisma.recipeNutrition.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.recipeNutrition.upsert.mock.calls[0][0].create.calories).toBe(50);
  });

  it('does nothing when the recipe does not exist', async () => {
    const prisma = buildMockPrisma(null);
    const service = new NutritionService(prisma as unknown as PrismaService);
    await service.computeRecipeNutrition('missing');
    expect(prisma.recipeNutrition.upsert).not.toHaveBeenCalled();
  });
});
