import {
  clamp,
  forecastConfidence,
  linearRegression,
  median,
  priceDirection,
  weightedPromoLikelihood,
} from './forecasting.math';

describe('forecasting.math', () => {
  describe('linearRegression', () => {
    it('fits a perfect upward line with r2 = 1', () => {
      const points = [0, 1, 2, 3, 4].map((x) => ({ x, y: 100 + 5 * x }));
      const { slope, intercept, r2 } = linearRegression(points);
      expect(slope).toBeCloseTo(5, 10);
      expect(intercept).toBeCloseTo(100, 10);
      expect(r2).toBeCloseTo(1, 10);
    });

    it('fits a perfect downward line', () => {
      const points = [0, 1, 2, 3].map((x) => ({ x, y: 200 - 3 * x }));
      const { slope, intercept, r2 } = linearRegression(points);
      expect(slope).toBeCloseTo(-3, 10);
      expect(intercept).toBeCloseTo(200, 10);
      expect(r2).toBeCloseTo(1, 10);
    });

    it('handles a flat series with r2 = 1 and slope 0', () => {
      const points = [0, 1, 2, 3].map((x) => ({ x, y: 150 }));
      const { slope, intercept, r2 } = linearRegression(points);
      expect(slope).toBe(0);
      expect(intercept).toBe(150);
      expect(r2).toBe(1);
    });

    it('returns lower r2 for noisy data', () => {
      const points = [
        { x: 0, y: 100 },
        { x: 1, y: 140 },
        { x: 2, y: 90 },
        { x: 3, y: 130 },
        { x: 4, y: 95 },
      ];
      const { r2 } = linearRegression(points);
      expect(r2).toBeGreaterThanOrEqual(0);
      expect(r2).toBeLessThan(0.5);
    });

    it('is deterministic (same input, same output)', () => {
      const points = [
        { x: 0, y: 100 },
        { x: 7, y: 104 },
        { x: 14, y: 99 },
        { x: 21, y: 110 },
      ];
      expect(linearRegression(points)).toEqual(linearRegression(points));
    });

    it('handles degenerate inputs safely', () => {
      expect(linearRegression([])).toEqual({ slope: 0, intercept: 0, r2: 0 });
      expect(linearRegression([{ x: 5, y: 42 }])).toEqual({ slope: 0, intercept: 42, r2: 0 });
      // identical x values: zero variance in x
      const sameX = linearRegression([
        { x: 1, y: 10 },
        { x: 1, y: 20 },
      ]);
      expect(sameX.slope).toBe(0);
      expect(sameX.intercept).toBe(15);
    });
  });

  describe('median', () => {
    it('returns the middle value for odd counts', () => {
      expect(median([5, 1, 9])).toBe(5);
    });
    it('averages the middle two for even counts', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });
    it('returns 0 for empty input', () => {
      expect(median([])).toBe(0);
    });
    it('does not mutate the input', () => {
      const input = [3, 1, 2];
      median(input);
      expect(input).toEqual([3, 1, 2]);
    });
  });

  describe('clamp', () => {
    it('clamps below, inside and above the range', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('weightedPromoLikelihood', () => {
    it('returns 0 with no rows', () => {
      expect(weightedPromoLikelihood([])).toBe(0);
    });

    it('computes a simple unweighted share', () => {
      const rows = [
        { isPromo: true, recent: false },
        { isPromo: false, recent: false },
        { isPromo: false, recent: false },
        { isPromo: false, recent: false },
      ];
      expect(weightedPromoLikelihood(rows)).toBeCloseTo(0.25, 10);
    });

    it('weights recent promo observations x2', () => {
      const rows = [
        { isPromo: true, recent: true }, // weight 2
        { isPromo: false, recent: false }, // weight 1
        { isPromo: false, recent: false }, // weight 1
      ];
      // 2 / 4 = 0.5 (vs 1/3 unweighted)
      expect(weightedPromoLikelihood(rows)).toBeCloseTo(0.5, 10);
    });
  });

  describe('priceDirection', () => {
    it('is STABLE within +/- 2%', () => {
      expect(priceDirection(1000, 1019)).toBe('STABLE');
      expect(priceDirection(1000, 981)).toBe('STABLE');
    });
    it('is UP above +2%', () => {
      expect(priceDirection(1000, 1021)).toBe('UP');
    });
    it('is DOWN below -2%', () => {
      expect(priceDirection(1000, 979)).toBe('DOWN');
    });
    it('is STABLE for non-positive current price', () => {
      expect(priceDirection(0, 500)).toBe('STABLE');
    });
  });

  describe('forecastConfidence', () => {
    it('grows with point count and fit quality', () => {
      expect(forecastConfidence(10, 0)).toBeCloseTo(0.4, 10);
      expect(forecastConfidence(20, 0.5)).toBeCloseTo(0.7, 10);
    });
    it('caps at 0.9', () => {
      expect(forecastConfidence(365, 1)).toBe(0.9);
    });
  });
});
