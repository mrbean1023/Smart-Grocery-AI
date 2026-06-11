/** Pure, deterministic regression helpers for price forecasting. */

export interface RegressionPoint {
  x: number;
  y: number;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

/**
 * Ordinary least squares linear regression with coefficient of
 * determination (r²). For fewer than 2 points (or zero x-variance) returns a
 * flat line through the mean with r² = 0.
 */
export function linearRegression(points: RegressionPoint[]): RegressionResult {
  const n = points.length;
  if (n === 0) {
    return { slope: 0, intercept: 0, r2: 0 };
  }
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  if (n === 1) {
    return { slope: 0, intercept: meanY, r2: 0 };
  }

  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }
  if (ssXX === 0) {
    return { slope: 0, intercept: meanY, r2: 0 };
  }

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  let r2 = 0;
  if (ssYY > 0) {
    let ssRes = 0;
    for (const p of points) {
      const predicted = intercept + slope * p.x;
      ssRes += (p.y - predicted) ** 2;
    }
    r2 = Math.max(0, Math.min(1, 1 - ssRes / ssYY));
  } else {
    // Perfectly flat series is perfectly explained by a flat line.
    r2 = 1;
  }
  return { slope, intercept, r2 };
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Promo likelihood: share of promo observations, with recent observations
 * weighted x2.
 */
export function weightedPromoLikelihood(rows: Array<{ isPromo: boolean; recent: boolean }>): number {
  if (rows.length === 0) {
    return 0;
  }
  let weighted = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const weight = row.recent ? 2 : 1;
    totalWeight += weight;
    if (row.isPromo) {
      weighted += weight;
    }
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

export type PriceDirection = 'UP' | 'DOWN' | 'STABLE';

/** Direction is UP/DOWN only when the move exceeds 2% of the current price. */
export function priceDirection(currentCents: number, predictedCents: number): PriceDirection {
  if (currentCents <= 0) {
    return 'STABLE';
  }
  const delta = predictedCents - currentCents;
  if (Math.abs(delta) > 0.02 * currentCents) {
    return delta > 0 ? 'UP' : 'DOWN';
  }
  return 'STABLE';
}

/** confidence = min(0.9, 0.3 + points/100 + r2 * 0.4) */
export function forecastConfidence(points: number, r2: number): number {
  return Math.min(0.9, 0.3 + points / 100 + r2 * 0.4);
}
