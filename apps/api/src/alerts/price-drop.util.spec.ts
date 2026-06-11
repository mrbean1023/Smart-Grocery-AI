import { evaluatePriceDrop, DEFAULT_PRICE_DROP_THRESHOLD_PCT } from './price-drop.util';

describe('evaluatePriceDrop', () => {
  it('triggers on target price hit (at or below)', () => {
    expect(evaluatePriceDrop(500, null, 500, 10)).toEqual({
      triggered: true,
      reason: 'target',
      dropPct: 0,
    });
    expect(evaluatePriceDrop(499, null, 500, 10).triggered).toBe(true);
    expect(evaluatePriceDrop(501, null, 500, 10).triggered).toBe(false);
  });

  it('triggers when the 7-day drop meets the threshold', () => {
    // 1000 -> 890 = 11% drop
    const result = evaluatePriceDrop(890, 1000, null, 10);
    expect(result.triggered).toBe(true);
    expect(result.reason).toBe('threshold');
    expect(result.dropPct).toBeCloseTo(11);
  });

  it('does not trigger below the threshold', () => {
    // 1000 -> 950 = 5% drop
    const result = evaluatePriceDrop(950, 1000, null, 10);
    expect(result.triggered).toBe(false);
    expect(result.dropPct).toBeCloseTo(5);
  });

  it('exactly-at-threshold drop triggers', () => {
    expect(evaluatePriceDrop(900, 1000, null, 10).triggered).toBe(true);
  });

  it('price rises never produce a positive dropPct', () => {
    const result = evaluatePriceDrop(1100, 1000, null, 10);
    expect(result.triggered).toBe(false);
    expect(result.dropPct).toBe(0);
  });

  it('handles missing 7-day-ago price (no baseline, target only)', () => {
    expect(evaluatePriceDrop(800, null, null, 10).triggered).toBe(false);
    expect(evaluatePriceDrop(800, null, 900, 10).triggered).toBe(true);
  });

  it('prefers target reason when both conditions hold', () => {
    const result = evaluatePriceDrop(500, 1000, 600, 10);
    expect(result.reason).toBe('target');
    expect(result.dropPct).toBeCloseTo(50);
  });

  it('uses the default 10% threshold', () => {
    expect(DEFAULT_PRICE_DROP_THRESHOLD_PCT).toBe(10);
    expect(evaluatePriceDrop(890, 1000, null).triggered).toBe(true);
    expect(evaluatePriceDrop(950, 1000, null).triggered).toBe(false);
  });
});
