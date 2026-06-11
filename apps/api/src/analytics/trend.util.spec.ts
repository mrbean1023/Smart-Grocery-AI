import {
  buildInflationTrend,
  buildSpendTrend,
  lastNMonthKeys,
  monthKey,
} from './trend.util';

describe('monthKey / lastNMonthKeys', () => {
  it('formats YYYY-MM with zero padding', () => {
    expect(monthKey(new Date('2026-06-11T00:00:00Z'))).toBe('2026-06');
    expect(monthKey(new Date('2026-01-31T23:59:59Z'))).toBe('2026-01');
  });

  it('produces the last n months ascending, crossing year boundaries', () => {
    const keys = lastNMonthKeys(6, new Date('2026-02-15T00:00:00Z'));
    expect(keys).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('buildSpendTrend', () => {
  const now = new Date('2026-06-11T00:00:00Z');

  it('zero-fills months with no purchases', () => {
    const trend = buildSpendTrend([], now);
    expect(trend).toHaveLength(6);
    expect(trend[0].month).toBe('2026-01');
    expect(trend[5]).toEqual({ month: '2026-06', totalCents: 0, savedCents: 0 });
  });

  it('sums basket totals + delivery and savings per month', () => {
    const trend = buildSpendTrend(
      [
        { updatedAt: new Date('2026-06-02T10:00:00Z'), totalCents: 5000, deliveryCents: 399, savingsCents: 700 },
        { updatedAt: new Date('2026-06-20T10:00:00Z'), totalCents: 3000, deliveryCents: 0, savingsCents: 300 },
        { updatedAt: new Date('2026-04-10T10:00:00Z'), totalCents: 8000, deliveryCents: 600, savingsCents: 1200 },
      ],
      now,
    );
    const june = trend.find((t) => t.month === '2026-06')!;
    expect(june.totalCents).toBe(8399);
    expect(june.savedCents).toBe(1000);
    const april = trend.find((t) => t.month === '2026-04')!;
    expect(april.totalCents).toBe(8600);
    expect(april.savedCents).toBe(1200);
    const may = trend.find((t) => t.month === '2026-05')!;
    expect(may.totalCents).toBe(0);
  });

  it('ignores baskets outside the 6-month window', () => {
    const trend = buildSpendTrend(
      [{ updatedAt: new Date('2025-11-01T00:00:00Z'), totalCents: 9999, deliveryCents: 0, savingsCents: 0 }],
      now,
    );
    expect(trend.every((t) => t.totalCents === 0)).toBe(true);
  });
});

describe('buildInflationTrend', () => {
  it('normalizes the first month to 100', () => {
    const trend = buildInflationTrend([
      { month: '2025-07', avgPerKgCents: 800 },
      { month: '2025-08', avgPerKgCents: 840 },
      { month: '2025-09', avgPerKgCents: 880 },
    ]);
    expect(trend).toEqual([
      { month: '2025-07', indexValue: 100 },
      { month: '2025-08', indexValue: 105 },
      { month: '2025-09', indexValue: 110 },
    ]);
  });

  it('sorts unsorted input and handles deflation', () => {
    const trend = buildInflationTrend([
      { month: '2026-02', avgPerKgCents: 760 },
      { month: '2026-01', avgPerKgCents: 800 },
    ]);
    expect(trend[0]).toEqual({ month: '2026-01', indexValue: 100 });
    expect(trend[1]).toEqual({ month: '2026-02', indexValue: 95 });
  });

  it('drops non-positive averages and handles empty input', () => {
    expect(buildInflationTrend([])).toEqual([]);
    const trend = buildInflationTrend([
      { month: '2026-01', avgPerKgCents: 0 },
      { month: '2026-02', avgPerKgCents: 500 },
    ]);
    expect(trend).toEqual([{ month: '2026-02', indexValue: 100 }]);
  });

  it('rounds index values to one decimal', () => {
    const trend = buildInflationTrend([
      { month: '2026-01', avgPerKgCents: 900 },
      { month: '2026-02', avgPerKgCents: 930 },
    ]);
    expect(trend[1].indexValue).toBeCloseTo(103.3, 5);
  });
});
