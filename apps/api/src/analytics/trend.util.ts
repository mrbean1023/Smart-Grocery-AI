/** Pure trend-assembly helpers for the analytics summary (unit-testable). */

export interface SpendTrendRow {
  month: string; // 'YYYY-MM'
  totalCents: number;
  savedCents: number;
}

export interface InflationRow {
  month: string; // 'YYYY-MM'
  indexValue: number; // first month normalized to 100
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last n month keys ending with the current month, ascending. */
export function lastNMonthKeys(n: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(monthKey(d));
  }
  return keys;
}

export interface SpendableBasket {
  updatedAt: Date;
  totalCents: number;
  deliveryCents: number;
  savingsCents: number;
}

/** Group purchased baskets into the last 6 calendar months (zero-filled). */
export function buildSpendTrend(
  baskets: SpendableBasket[],
  now: Date = new Date(),
  months = 6,
): SpendTrendRow[] {
  const keys = lastNMonthKeys(months, now);
  const byMonth = new Map<string, SpendTrendRow>(
    keys.map((k) => [k, { month: k, totalCents: 0, savedCents: 0 }]),
  );
  for (const b of baskets) {
    const key = monthKey(b.updatedAt);
    const row = byMonth.get(key);
    if (!row) continue; // outside the window
    row.totalCents += b.totalCents + b.deliveryCents;
    row.savedCents += b.savingsCents;
  }
  return keys.map((k) => byMonth.get(k)!);
}

export interface MonthlyAvgRow {
  month: string; // 'YYYY-MM'
  avgPerKgCents: number;
}

/**
 * Normalize monthly average price-per-kg rows to an index where the first
 * (oldest) month = 100. Rows must be unique per month; output is ascending.
 */
export function buildInflationTrend(rows: MonthlyAvgRow[]): InflationRow[] {
  const sorted = [...rows]
    .filter((r) => r.avgPerKgCents > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (sorted.length === 0) return [];
  const base = sorted[0].avgPerKgCents;
  return sorted.map((r) => ({
    month: r.month,
    indexValue: Math.round((r.avgPerKgCents / base) * 100 * 10) / 10,
  }));
}
