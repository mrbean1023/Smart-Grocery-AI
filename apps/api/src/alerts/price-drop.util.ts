/** Pure price-drop detection math (unit-testable). */

export const DEFAULT_PRICE_DROP_THRESHOLD_PCT = 10;

export interface PriceDropEvaluation {
  triggered: boolean;
  /** Why it triggered: hit the user's target price, or dropped >= threshold%. */
  reason: 'target' | 'threshold' | null;
  /** Percentage drop vs the 7-day-ago price (0 when unknown or risen). */
  dropPct: number;
}

export function evaluatePriceDrop(
  latestCents: number,
  weekAgoCents: number | null,
  targetPriceCents: number | null,
  thresholdPct: number = DEFAULT_PRICE_DROP_THRESHOLD_PCT,
): PriceDropEvaluation {
  const dropPct =
    weekAgoCents !== null && weekAgoCents > 0
      ? Math.max(0, ((weekAgoCents - latestCents) / weekAgoCents) * 100)
      : 0;

  if (targetPriceCents !== null && targetPriceCents > 0 && latestCents <= targetPriceCents) {
    return { triggered: true, reason: 'target', dropPct };
  }
  if (thresholdPct > 0 && dropPct >= thresholdPct) {
    return { triggered: true, reason: 'threshold', dropPct };
  }
  return { triggered: false, reason: null, dropPct };
}
