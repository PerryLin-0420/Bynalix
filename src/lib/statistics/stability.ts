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

export interface StabilityMetricMeta {
  labelZh: string; labelEn: string; unit: string;
  /**
   * The day-to-day jump (stdev of consecutive-day differences, in the
   * metric's own unit) that is still physically ordinary for it. Wobble
   * within this band scores 100; it is the yardstick the score is built on.
   */
  tolerance: number;
  /** Why this band counts as stable — shown in the guide card. */
  whyZh: string; whyEn: string;
}

/**
 * The seven axes of the stability star chart, in display order.
 *
 * Each tolerance is set from what the quantity physically does on its own,
 * not from anyone's logged data, so a score means the same thing for every
 * user and never drifts with their history.
 */
export const STABILITY_METRICS: Record<StabilityMetric, StabilityMetricMeta> = {
  weight_kg:   { labelZh: "體重",   labelEn: "Weight",   unit: "kg",   tolerance: 0.5,
    whyZh: "水分、肝醣與腸胃內容物本來就會讓體重每天起伏約 0.5 kg",
    whyEn: "water, glycogen and gut contents alone move weight about 0.5 kg a day" },
  calories:    { labelZh: "熱量",   labelEn: "Calories", unit: "kcal", tolerance: 300,
    whyZh: "約一份點心，也接近食物熱量估算本身的誤差",
    whyEn: "about one snack, and close to the error of food calorie estimates" },
  protein_g:   { labelZh: "蛋白質", labelEn: "Protein",  unit: "g",    tolerance: 25,
    whyZh: "約一份蛋白質來源（半塊雞胸、一杯豆漿加一顆蛋）",
    whyEn: "about one protein serving (half a chicken breast, or milk and an egg)" },
  carb_g:      { labelZh: "碳水",   labelEn: "Carbs",    unit: "g",    tolerance: 50,
    whyZh: "約大半碗飯",
    whyEn: "about two-thirds of a bowl of rice" },
  fat_g:       { labelZh: "脂肪",   labelEn: "Fat",      unit: "g",    tolerance: 15,
    whyZh: "約一湯匙油",
    whyEn: "about one tablespoon of oil" },
  water_ml:    { labelZh: "飲水",   labelEn: "Water",    unit: "ml",   tolerance: 500,
    whyZh: "約兩杯水，天氣與活動量本來就會造成這個差距",
    whyEn: "about two glasses — weather and activity alone account for that" },
  sleep_hours: { labelZh: "睡眠",   labelEn: "Sleep",    unit: "h",    tolerance: 0.75,
    whyZh: "45 分鐘內的夜間差異，一般仍視為作息規律",
    whyEn: "night-to-night differences within 45 minutes still count as a regular schedule" },
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

export interface StabilityResult {
  metric: StabilityMetric;
  /** % of days in range that carry a logged value for this metric. */
  density: number;
  /** Logged days used. */
  n: number;
  /** Consecutive-day difference pairs the volatility figure is built from. */
  nDiffs: number;
  /** Mean of the logged values. */
  mean: number | null;
  /** Population stdev of day-over-day differences — absolute volatility. */
  volatility: number | null;
  /** volatility / the metric's tolerance — how many tolerance bands the wobble spans. */
  ratio: number | null;
  /** 0–100, 100 = wobble within the metric's tolerance. Null when density is too low. */
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

/**
 * volatility/tolerance → 0–100. Anything within the tolerance band is full
 * marks — that wobble is the quantity's own physics, not behaviour — and the
 * score halves for every further band past it: 1× → 100, 2× → 50, 3× → 25.
 */
function ratioToScore(ratio: number): number {
  const score = 100 * Math.pow(2, -Math.max(0, ratio - 1));
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
      volatility: null, ratio: null, score: null,
      reliability, insufficient: true,
    };
  }

  const volatility = pstdev(diffs);
  const ratio = volatility / STABILITY_METRICS[metric].tolerance;

  return {
    metric, density, n, nDiffs,
    mean: mean(values.map(r => r.v)), volatility, ratio, score: ratioToScore(ratio),
    reliability, insufficient: false,
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
