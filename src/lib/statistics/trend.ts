/** Linear regression trend for any time-series numeric metric. */

import { RELIABILITY_THRESHOLDS, getReliability, type Reliability } from "./pearson";

export interface TrendResult {
  /** kg/day, or any unit/day. */
  slopePerDay: number;
  /** Convenience: slope × 7. */
  slopePerWeek: number;
  /** R², 0–1, higher = more linear. */
  r2: number;
  reliability: Reliability;
  sampleSize: number;
}

/**
 * Ordinary least-squares linear regression of value vs. day index.
 * Returns null if fewer than MIN_PAIRS distinct points are provided.
 */
export function linearTrend(
  points: { date: string; value: number }[],
): TrendResult | null {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  if (n < RELIABILITY_THRESHOLDS.MIN_PAIRS) return null;

  const t0 = new Date(sorted[0].date).getTime();
  const xs = sorted.map(p => (new Date(p.date).getTime() - t0) / 86400000);
  const ys = sorted.map(p => p.value);

  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0, denX = 0;
  for (let i = 0; i < n; i++) {
    num  += (xs[i] - mx) * (ys[i] - my);
    denX += (xs[i] - mx) ** 2;
  }
  const slope = denX === 0 ? 0 : num / denX;

  const yPred = xs.map(x => my + slope * (x - mx));
  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - yPred[i]) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    slopePerDay:  slope,
    slopePerWeek: slope * 7,
    r2,
    reliability: getReliability(n),
    sampleSize: n,
  };
}
