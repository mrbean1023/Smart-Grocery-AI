import { computeCoverageGrams, daysUntilExpiry } from './pantry.util';

describe('pantry coverage computation', () => {
  it('converts mass units to grams', () => {
    const map = computeCoverageGrams([
      { ingredientId: 'rice', quantity: 2, unit: 'kg', ingredient: { density: null, gramsPerPiece: null } },
      { ingredientId: 'rice', quantity: 500, unit: 'g', ingredient: { density: null, gramsPerPiece: null } },
    ]);
    expect(map.get('rice')).toBe(2500);
  });

  it('converts volume via density and falls back to 1 g/ml', () => {
    const map = computeCoverageGrams([
      // 1 L of oil at 0.92 g/ml = 920 g
      { ingredientId: 'oil', quantity: 1, unit: 'l', ingredient: { density: 0.92, gramsPerPiece: null } },
      // 250 ml unknown density -> 250 g
      { ingredientId: 'stock', quantity: 250, unit: 'ml', ingredient: { density: null, gramsPerPiece: null } },
    ]);
    expect(map.get('oil')).toBeCloseTo(920);
    expect(map.get('stock')).toBe(250);
  });

  it('converts pieces via gramsPerPiece and skips unweighable pieces', () => {
    const map = computeCoverageGrams([
      { ingredientId: 'egg', quantity: 6, unit: 'piece', ingredient: { density: null, gramsPerPiece: 55 } },
      { ingredientId: 'mystery', quantity: 3, unit: 'piece', ingredient: { density: null, gramsPerPiece: null } },
    ]);
    expect(map.get('egg')).toBe(330);
    expect(map.has('mystery')).toBe(false);
  });

  it('ignores items without an ingredient link', () => {
    const map = computeCoverageGrams([
      { ingredientId: null, quantity: 100, unit: 'g', ingredient: null },
    ]);
    expect(map.size).toBe(0);
  });
});

describe('daysUntilExpiry', () => {
  const now = new Date('2026-06-11T00:00:00Z');

  it('returns null without a date', () => {
    expect(daysUntilExpiry(null, now)).toBeNull();
  });

  it('rounds up partial days', () => {
    expect(daysUntilExpiry(new Date('2026-06-13T12:00:00Z'), now)).toBe(3);
    expect(daysUntilExpiry(new Date('2026-06-12T00:00:00Z'), now)).toBe(1);
  });

  it('is negative when already expired', () => {
    expect(daysUntilExpiry(new Date('2026-06-09T00:00:00Z'), now)).toBeLessThan(0);
  });
});
