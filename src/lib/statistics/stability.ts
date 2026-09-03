/**
 * Stability: how consistent your day-to-day numbers are, not how they
 * correlate with anything else.
 *
 * Every other stats tab asks "what moves with what". This asks a different,
 * simpler question about seven core metrics on their own — weight, calories,
 * the three macros, water, sleep — read as a signal and scored on how much
 * it wobbles day to day, independent of any long-running trend it might be
 * riding on (a steady cut's weight loss is not "instability").
 *
 * The volatility measure reuses the network's own detrending technique
 * (`network.ts`'s day-over-day first differences) rather than raw variance
 * around the mean, for the same reason it's used there: a slowly trending
 * series has large variance-around-mean but can still be perfectly smooth
 * day to day, and it's the day-to-day wobble a "stability" reading should
 * capture, not the trend.
 */

import { differenceInCalendarDays, parseISO } from "date-fns";
import { RELIABILITY_THRESHOLDS, getReliability, type Reliability } from "./pearson";
import type { DailyStatsRecord } from "@/types";

export type StabilityMetric =
  | "weight_kg" | "calories" | "protein_g" | "carb_g" | "fat_g" | "water_ml" | "sleep_hours";

export interface StabilityMetricMeta { labelZh: string; labelEn: string; unit: string }

/** The seven axes of the stability star chart, in display order. */
export const STABILITY_METRICS: Record<StabilityMetric, StabilityMetricMeta> = {
  weight_kg:   { labelZh: "體重",   labelEn: "Weight",   unit: "kg" },
  calories:    { labelZh: "熱量",   labelEn: "Calories", unit: "kcal" },
  protein_g:   { labelZh: "蛋白質", labelEn: "Protein",  unit: "g" },
  carb_g:      { labelZh: "碳水",   labelEn: "Carbs",    unit: "g" },
  fat_g:       { labelZh: "脂肪",   labelEn: "Fat",      unit: "g" },
  water_ml:    { labelZh: "飲水",   labelEn: "Water",    unit: "ml" },
  sleep_hours: { labelZh: "睡眠",   labelEn: "Sleep",    unit: "h" },
};

export const STABILITY_METRIC_ORDER = Object.keys(STABILITY_METRICS) as StabilityMetric[];

/**
 * Below this share of the range's days actually logged, a metric is reported
 * as "insufficient" rather than scored — same 50% floor the rest of the
 * stats pages already draw the density red/amber/green line at (see
 * `densityColor` in Statistics.tsx), so the same number means the same thing
 * everywhere in the app.
 */
export const STABILITY_MIN_DENSITY = 50;

/**
 * A day-over-day difference series this thin can't say anything about
 * volatility even if density happens to clear the floor above (density
 * counts logged days; this counts *consecutive* logged pairs, which gaps can
 * starve independently) — same sample-size floor Pearson/Advanced use for
 * "insufficient" everywhere else.
 */
export const STABILITY_MIN_DIFFS = RELIABILITY_THRESHOLDS.MIN_PAIRS;

/**
 * The relative day-to-day volatility (see `StabilityResult.cv`) at which a
 * metric scores 50 — the score halves every time volatility doubles past
 * this point, and approaches 100 as volatility approaches zero. Tuned by
 * running this over a real multi-month export: a physically slow-moving
 * metric like weight naturally lands relative volatility two orders of
 * magnitude below one logged by daily choice (calories, macros, water,
 * sleep), which cluster around 0.45–0.70. 0.5 keeps that real-world cluster
 * spread through the middle of the scale rather than bunched at either end.
 */
export const STABILITY_REFERENCE_CV = 0.5;

export interface StabilityResult {
  metric: StabilityMetric;
  /** % of days in range that carry a logged value for this metric. */
  density: number;
  /** Logged days used. */
  n: number;
  /** Consecutive-day difference pairs the volatility figure is built from. */
  nDiffs: number;
  /** Mean of the logged values — the "typical level" `cv` is relative to. */
  mean: number | null;
  /** Population stdev of day-over-day differences — absolute volatility. */
  volatility: number | null;
  /** volatility / mean — the scale-free figure the score is computed from. */
  cv: number | null;
  /** 0–100, 100 = no day-to-day wobble at all. Null when density is too low. */
  score: number | null;
  /** Reliability of the underlying diff count, same tiers as the rest of the app. */
  reliability: Reliability;
  /** Below STABILITY_MIN_DENSITY — score withheld, render as a density wedge instead. */
  insufficient: boolean;
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function pstdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
}

/** volatility/mean → 0–100, halving every STABILITY_REFERENCE_CV of relative volatility. */
function cvToScore(cv: number): number {
  const score = 100 * Math.exp(-Math.LN2 * (cv / STABILITY_REFERENCE_CV));
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Stability of one metric over [startDate, endDate]. `recs` need not be
 * pre-filtered to the range or gap-free — both are handled here, and a
 * missing day simply breaks that one adjacency rather than being treated as
 * a zero or interpolated.
 */
export function computeStability(
  recs: DailyStatsRecord[],
  metric: StabilityMetric,
  startDate: string,
  endDate: string,
): StabilityResult {
  const totalDays = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
  const inRange = recs
    .filter(r => r.date >= startDate && r.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const values = inRange
    .map(r => ({ date: r.date, v: r[metric] }))
    .filter((r): r is { date: string; v: number } => r.v != null);
  const n = values.length;
  const density = totalDays > 0 ? Math.round((n / totalDays) * 100) : 0;

  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (differenceInCalendarDays(parseISO(values[i].date), parseISO(values[i - 1].date)) === 1) {
      diffs.push(values[i].v - values[i - 1].v);
    }
  }
  const nDiffs = diffs.length;
  const reliability = getReliability(nDiffs);

  const insufficient = density < STABILITY_MIN_DENSITY || nDiffs < STABILITY_MIN_DIFFS;
  if (insufficient) {
    return {
      metric, density, n, nDiffs,
      mean: n > 0 ? mean(values.map(r => r.v)) : null,
      volatility: null, cv: null, score: null,
      reliability, insufficient: true,
    };
  }

  const levelMean = mean(values.map(r => r.v));
  const volatility = pstdev(diffs);
  const cv = levelMean > 0 ? volatility / levelMean : null;
  const score = cv != null ? cvToScore(cv) : null;

  return {
    metric, density, n, nDiffs,
    mean: levelMean, volatility, cv, score,
    reliability, insufficient: score == null,
  };
}

/** All seven axes at once, in `STABILITY_METRIC_ORDER`. */
export function computeStabilityChart(
  recs: DailyStatsRecord[],
  startDate: string,
  endDate: string,
): StabilityResult[] {
  return STABILITY_METRIC_ORDER.map(metric => computeStability(recs, metric, startDate, endDate));
}
