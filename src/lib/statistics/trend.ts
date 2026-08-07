/**
 * Least-squares trend fitting for the history charts.
 *
 * Two things matter for a trend line over self-logged data:
 *
 * 1. Gaps must not distort the slope. X is the day offset from the first point,
 *    never the array index, so a week with nothing logged leaves a real week-
 *    wide hole in the fit instead of silently compressing the time axis.
 * 2. A missing day is not a zero. Charts that render unlogged days as 0 (food,
 *    water) must map those to null before fitting — nobody eats 0 kcal, and
 *    feeding those zeros in would drag the line down toward whatever fraction
 *    of days went unlogged.
 */

const DAY_MS = 86_400_000;

export interface TrendFit {
  /** Change in the value per day. */
  slopePerDay: number;
  /** Fitted value at the first point's date. */
  intercept: number;
  /** Number of points the fit actually used. */
  n: number;
  /** Fitted value for a date, extrapolated across gaps. */
  at: (date: string) => number;
}

const dayOffset = (from: string, to: string) =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);

/**
 * Fit a straight line through the points that have a value.
 *
 * Returns null when there is too little to say anything: fewer than
 * `minPoints` real observations, or every observation on the same day (no
 * spread in x, so the slope is undefined rather than zero).
 */
export function linearFit(
  points: { date: string; value: number | null }[],
  minPoints = 7,
): TrendFit | null {
  if (points.length === 0) return null;
  const base = points[0].date;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of points) {
    if (p.value == null || !Number.isFinite(p.value)) continue;
    xs.push(dayOffset(base, p.date));
    ys.push(p.value);
  }
  const n = xs.length;
  if (n < minPoints) return null;

  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  if (den === 0) return null; // every observation on one day

  const slopePerDay = num / den;
  const intercept = my - slopePerDay * mx;
  return {
    slopePerDay,
    intercept,
    n,
    at: (date: string) => intercept + slopePerDay * dayOffset(base, date),
  };
}

/**
 * Attach a `trend` field to chart rows so Recharts can draw the fitted line as
 * an ordinary series. Rows keep their original fields; `trend` is null when
 * there is no usable fit, which renders as no line at all.
 */
export function withTrend<T extends { date: string }>(
  rows: T[],
  value: (row: T) => number | null,
  minPoints = 7,
): { rows: (T & { trend: number | null })[]; fit: TrendFit | null } {
  const fit = linearFit(rows.map(r => ({ date: r.date, value: value(r) })), minPoints);
  return {
    rows: rows.map(r => ({ ...r, trend: fit ? Math.round(fit.at(r.date) * 100) / 100 : null })),
    fit,
  };
}

/** Slope expressed per week, which reads better than per day for these ranges. */
export function slopePerWeek(fit: TrendFit): number {
  return fit.slopePerDay * 7;
}

/** "+0.2" / "-0.15" style signed number, trimmed to a sensible precision. */
export function fmtSlope(perWeek: number, digits = 2): string {
  const rounded = Math.abs(perWeek) >= 100
    ? Math.round(perWeek)
    : Math.round(perWeek * 10 ** digits) / 10 ** digits;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}
