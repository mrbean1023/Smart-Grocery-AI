import { buildPlanSlots, MEAL_TYPES_BY_COUNT, PERIOD_DAYS, type CandidateRecipe } from './plan-builder';
import { isRecipeAllowed, filterRecipesByDiet } from '../recommendations/diet-filter';

const candidate = (over: Partial<CandidateRecipe> & { id: string }): CandidateRecipe => ({
  title: over.id,
  caloriesPerServing: 500,
  proteinPerServing: 25,
  costPerServingCents: 300,
  baseScore: 0.5,
  ...over,
});

describe('dietary filter logic', () => {
  const chickenRice = {
    tags: ['rice', 'hawker'],
    ingredients: [
      { name: 'chicken thigh', category: 'MEAT' },
      { name: 'jasmine rice', category: 'GRAINS' },
    ],
  };
  const tofuStirFry = {
    tags: ['quick'],
    ingredients: [
      { name: 'firm tofu', category: 'TOFU_SOY' },
      { name: 'broccoli', category: 'PRODUCE' },
    ],
  };
  const baconPasta = {
    tags: ['pasta'],
    ingredients: [
      { name: 'bacon', category: 'MEAT' },
      { name: 'spaghetti', category: 'NOODLES_PASTA' },
    ],
  };
  const beeHoon = {
    tags: ['noodles'],
    ingredients: [
      { name: 'rice vermicelli', category: 'NOODLES_PASTA' },
      { name: 'egg', category: 'EGGS' },
    ],
  };

  it('vegetarian forbids MEAT/SEAFOOD categories', () => {
    expect(isRecipeAllowed(chickenRice, ['vegetarian'])).toBe(false);
    expect(isRecipeAllowed(tofuStirFry, ['vegetarian'])).toBe(true);
  });

  it('halal forbids pork/lard/bacon by ingredient name', () => {
    expect(isRecipeAllowed(baconPasta, ['halal'])).toBe(false);
    expect(isRecipeAllowed(chickenRice, ['halal'])).toBe(true);
  });

  it('gluten-free forbids wheat noodles but allows rice noodles (tag exception)', () => {
    expect(isRecipeAllowed(baconPasta, ['gluten-free'])).toBe(false);
    // tagged "noodles" but every noodle ingredient is rice-based
    expect(isRecipeAllowed(beeHoon, ['gluten-free'])).toBe(true);
  });

  it('vegan forbids dairy/eggs but allows plant milks', () => {
    expect(isRecipeAllowed(beeHoon, ['vegan'])).toBe(false); // egg
    expect(
      isRecipeAllowed(
        { tags: [], ingredients: [{ name: 'coconut milk', category: 'CANNED' }] },
        ['vegan'],
      ),
    ).toBe(true);
    expect(
      isRecipeAllowed({ tags: [], ingredients: [{ name: 'fresh milk', category: 'DAIRY' }] }, [
        'vegan',
      ]),
    ).toBe(false);
  });

  it('applies every restriction in the list and ignores unknown ones', () => {
    expect(isRecipeAllowed(tofuStirFry, ['vegetarian', 'halal', 'keto-carnivore'])).toBe(true);
    expect(isRecipeAllowed(chickenRice, ['halal', 'vegetarian'])).toBe(false);
    expect(filterRecipesByDiet([chickenRice, tofuStirFry, baconPasta], ['vegetarian'])).toEqual([
      tofuStirFry,
    ]);
  });

  it('soft preferences never exclude recipes', () => {
    expect(isRecipeAllowed(chickenRice, ['low-sodium', 'diabetic-friendly'])).toBe(true);
  });
});

describe('buildPlanSlots', () => {
  const start = new Date('2026-06-15T00:00:00Z');

  it('fills period x mealsPerDay slots with the right meal types', () => {
    const candidates = [
      candidate({ id: 'a' }),
      candidate({ id: 'b' }),
      candidate({ id: 'c' }),
      candidate({ id: 'd' }),
      candidate({ id: 'e' }),
      candidate({ id: 'f' }),
    ];
    const built = buildPlanSlots(candidates, {
      days: PERIOD_DAYS.WEEKLY,
      mealsPerDay: 3,
      targetCalories: null,
      budgetCents: null,
      startDate: start,
    });
    expect(built.slots).toHaveLength(21);
    expect(built.slots.slice(0, 3).map((s) => s.mealType)).toEqual(MEAL_TYPES_BY_COUNT[3]);
    expect(built.slots[0].date.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(built.slots[20].date.toISOString().slice(0, 10)).toBe('2026-06-21');
  });

  it('keeps each day within +/-15% of target calories when recipes allow it', () => {
    const candidates = [
      candidate({ id: 'light', caloriesPerServing: 350 }),
      candidate({ id: 'medium', caloriesPerServing: 500 }),
      candidate({ id: 'heavy', caloriesPerServing: 800 }),
      candidate({ id: 'light2', caloriesPerServing: 400 }),
      candidate({ id: 'medium2', caloriesPerServing: 550 }),
      candidate({ id: 'heavy2', caloriesPerServing: 750 }),
    ];
    const target = 1500;
    const built = buildPlanSlots(candidates, {
      days: 7,
      mealsPerDay: 3,
      targetCalories: target,
      budgetCents: null,
      startDate: start,
    });
    for (let day = 0; day < 7; day++) {
      const dayCalories = built.slots
        .filter((s) => s.date.getUTCDate() === 15 + day)
        .reduce((sum, s) => sum + s.calories, 0);
      expect(dayCalories).toBeGreaterThanOrEqual(target * 0.85);
      expect(dayCalories).toBeLessThanOrEqual(target * 1.15);
    }
  });

  it('stays within the total budget when affordable recipes exist', () => {
    const candidates = [
      candidate({ id: 'cheap1', costPerServingCents: 100 }),
      candidate({ id: 'cheap2', costPerServingCents: 150 }),
      candidate({ id: 'pricey', costPerServingCents: 2000, baseScore: 5 }),
      candidate({ id: 'cheap3', costPerServingCents: 120 }),
      candidate({ id: 'cheap4', costPerServingCents: 130 }),
      candidate({ id: 'cheap5', costPerServingCents: 140 }),
    ];
    const budget = 3500;
    const built = buildPlanSlots(candidates, {
      days: 7,
      mealsPerDay: 3,
      targetCalories: null,
      budgetCents: budget,
      startDate: start,
    });
    expect(built.totalCostCents).toBeLessThanOrEqual(budget);
    expect(built.slots).toHaveLength(21);
    expect(built.totalCostCents).toBe(built.slots.reduce((s, x) => s + x.costCents, 0));
  });

  it('penalizes repeats within 3 days when the pool is large enough', () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      candidate({ id: `r${i}`, baseScore: 0.5 + i * 0.001 }),
    );
    const built = buildPlanSlots(candidates, {
      days: 2,
      mealsPerDay: 3,
      targetCalories: null,
      budgetCents: null,
      startDate: start,
    });
    const used = built.slots.map((s) => s.recipeId);
    // 6 slots over 2 days, 8 distinct recipes — no recipe should repeat
    expect(new Set(used).size).toBe(used.length);
  });

  it('allows repeats when the recipe pool is small', () => {
    const candidates = [candidate({ id: 'only1' }), candidate({ id: 'only2' })];
    const built = buildPlanSlots(candidates, {
      days: 3,
      mealsPerDay: 3,
      targetCalories: null,
      budgetCents: null,
      startDate: start,
    });
    expect(built.slots).toHaveLength(9);
    expect(built.slots.every((s) => ['only1', 'only2'].includes(s.recipeId))).toBe(true);
  });

  it('returns a warning and no slots with an empty pool', () => {
    const built = buildPlanSlots([], {
      days: 7,
      mealsPerDay: 3,
      targetCalories: 2000,
      budgetCents: null,
      startDate: start,
    });
    expect(built.slots).toHaveLength(0);
    expect(built.warnings.length).toBeGreaterThan(0);
  });
});
