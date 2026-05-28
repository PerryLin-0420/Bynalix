/** Pearson correlation and influence ranking for body recorder statistics. */

import { format } from "date-fns";

export interface DailyRecord {
  date: string;           // YYYY-MM-DD
  weight_kg?: number;
  calories_kcal?: number;
  protein_g?: number;
  carb_g?: number;
  fat_g?: number;
  water_ml?: number;
  exercise_count?: number;      // number of cardio sessions
  exercise_min?: number;        // total cardio minutes
  exercise_kcal?: number;       // total cardio calories burned
  strength_volume_kg?: number;  // Σ(weight_kg × reps) across all strength sets
}

export type Factor =
  | 'calories_kcal'
  | 'protein_g'
  | 'carb_g'
  | 'fat_g'
  | 'water_ml'
  | 'exercise_count'
  | 'exercise_min'
  | 'exercise_kcal'
  | 'strength_volume_kg';

/** Unified data-volume thresholds shared by basic and advanced stats. */
export const RELIABILITY_THRESHOLDS = {
  /** Below this: do not compute, show progress hint. */
  MIN_PAIRS: 7,
  /** Below this but ≥ MIN_PAIRS: compute but mark as low reliability. */
  LOW_PAIRS: 14,
  /** ≥ this: full reliability. */
  HIGH_PAIRS: 30,
} as const;

export type Reliability = 'high' | 'medium' | 'low' | 'insufficient';

export function getReliability(n: number): Reliability {
  if (n >= RELIABILITY_THRESHOLDS.HIGH_PAIRS) return 'high';
  if (n >= RELIABILITY_THRESHOLDS.LOW_PAIRS)  return 'medium';
  if (n >= RELIABILITY_THRESHOLDS.MIN_PAIRS)  return 'low';
  return 'insufficient';
}

export interface CorrelationResult {
  factor: Factor;
  label: string;
  r: number;           // Pearson r, -1 to 1
  direction: 'positive' | 'negative';
  sampleSize: number;
  reliability: Reliability;
}

export const FACTOR_LABELS: Record<Factor, string> = {
  calories_kcal:      '每日熱量',
  protein_g:          '蛋白質攝取',
  carb_g:             '碳水攝取',
  fat_g:              '脂肪攝取',
  water_ml:           '飲水量',
  exercise_count:     '有氧次數',
  exercise_min:       '有氧時長',
  exercise_kcal:      '運動消耗',
  strength_volume_kg: '重訓總量',
};

export const FACTOR_LABELS_EN: Record<Factor, string> = {
  calories_kcal:      'Daily calories',
  protein_g:          'Protein intake',
  carb_g:             'Carb intake',
  fat_g:              'Fat intake',
  water_ml:           'Water intake',
  exercise_count:     'Cardio sessions',
  exercise_min:       'Cardio duration',
  exercise_kcal:      'Exercise calories',
  strength_volume_kg: 'Strength volume',
};

/** Pure Pearson r over two equal-length arrays. */
export function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    sx  += dx * dx;
    sy  += dy * dy;
  }
  const denom = Math.sqrt(sx * sy);
  return denom === 0 ? 0 : num / denom;
}

// ── Date-series helpers ──────────────────────────────────────────────────────

/** Build a consecutive YYYY-MM-DD array between from..to inclusive. */
export function buildDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const d   = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    dates.push(format(d, "yyyy-MM-dd"));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

interface InterpPoint { value: number; interpolated: boolean }

/** Linear interpolation over a date-keyed map; flags interpolated points. */
export function linearInterpolate(
  dataMap: Map<string, number>,
  allDates: string[],
): Map<string, InterpPoint> {
  const result = new Map<string, InterpPoint>();
  const known  = [...dataMap.keys()].sort();
  if (known.length === 0) return result;

  for (const date of allDates) {
    if (dataMap.has(date)) {
      result.set(date, { value: dataMap.get(date)!, interpolated: false });
      continue;
    }
    let prev: string | undefined;
    let next: string | undefined;
    for (const kd of known) {
      if (kd < date) prev = kd;
      else if (!next && kd > date) { next = kd; break; }
    }
    if (prev && next) {
      const pv = dataMap.get(prev)!;
      const nv = dataMap.get(next)!;
      const pt = new Date(prev).getTime();
      const nt = new Date(next).getTime();
      const dt = new Date(date).getTime();
      const t  = (dt - pt) / (nt - pt);
      result.set(date, { value: pv + t * (nv - pv), interpolated: true });
    } else if (prev) {
      result.set(date, { value: dataMap.get(prev)!, interpolated: true });
    } else if (next) {
      result.set(date, { value: dataMap.get(next)!, interpolated: true });
    }
  }
  return result;
}

interface WeightChangePoint { value: number; interpolatedCount: number }

/**
 * N-day rolling weight change indexed by date.
 *
 * Sparse weight logs are linearly interpolated across the date range so a user
 * weighing themselves three times a week still produces enough paired points
 * after MIN_PAIRS days — instead of needing 5+ weeks under the old "index by
 * weight rows" logic.
 */
function rollingWeightChange(
  records: DailyRecord[],
  windowDays = 3,
): Map<string, WeightChangePoint> {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return new Map();

  const allDates  = buildDateRange(sorted[0].date, sorted[sorted.length - 1].date);
  const weightMap = new Map(
    records.filter(r => r.weight_kg != null).map(r => [r.date, r.weight_kg!])
  );
  if (weightMap.size === 0) return new Map();

  const interp = linearInterpolate(weightMap, allDates);

  const result = new Map<string, WeightChangePoint>();
  for (let i = windowDays; i < allDates.length; i++) {
    const currWindow = allDates.slice(i - windowDays + 1, i + 1);
    const prevWindow = allDates.slice(i - windowDays, i);
    const currVals = currWindow.map(d => interp.get(d)).filter(Boolean) as InterpPoint[];
    const prevVals = prevWindow.map(d => interp.get(d)).filter(Boolean) as InterpPoint[];
    if (currVals.length === 0 || prevVals.length === 0) continue;

    const avgCurr = currVals.reduce((s, v) => s + v.value, 0) / currVals.length;
    const avgPrev = prevVals.reduce((s, v) => s + v.value, 0) / prevVals.length;
    const interpCount = [...currVals, ...prevVals].filter(v => v.interpolated).length;

    result.set(allDates[i], { value: avgCurr - avgPrev, interpolatedCount: interpCount });
  }
  return result;
}

/**
 * Pearson correlation between each factor and rolling weight change.
 *
 * Returns the top N results sorted by |r|, or null if even the interpolated
 * weight series can't reach MIN_PAIRS days.
 *
 * The `minRecords` parameter is preserved for backward compatibility but
 * RELIABILITY_THRESHOLDS now drives the actual gating; callers should ignore it.
 */
export function computeInfluenceRanking(
  records: DailyRecord[],
  factors: Factor[] = Object.keys(FACTOR_LABELS) as Factor[],
  topN = 9,
  _minRecords?: number,
): CorrelationResult[] | null {
  void _minRecords;
  const weightChanges = rollingWeightChange(records);
  if (weightChanges.size < RELIABILITY_THRESHOLDS.MIN_PAIRS) return null;

  const recByDate = new Map(records.map(r => [r.date, r]));
  const results: CorrelationResult[] = [];

  for (const factor of factors) {
    const pairs: [number, number][] = [];
    let totalInterp = 0;
    for (const [date, wChange] of weightChanges) {
      const rec = recByDate.get(date);
      if (!rec) continue;
      const val = rec[factor];
      if (val == null) continue;
      pairs.push([val, wChange.value]);
      totalInterp += wChange.interpolatedCount;
    }
    if (pairs.length < RELIABILITY_THRESHOLDS.MIN_PAIRS) continue;

    const xArr = pairs.map(p => p[0]);
    const yArr = pairs.map(p => p[1]);
    const r = pearson(xArr, yArr);

    // 6 = two 3-day windows (prev + current) per data point
    const interpRatio = totalInterp / (pairs.length * 6);
    const base = getReliability(pairs.length);
    const reliability: Reliability =
      interpRatio > 0.5 && base === 'high'   ? 'medium'
      : interpRatio > 0.5 && base === 'medium' ? 'low'
      : base;

    results.push({
      factor,
      label: FACTOR_LABELS[factor],
      r,
      direction: r >= 0 ? 'positive' : 'negative',
      sampleSize: pairs.length,
      reliability,
    });
  }

  return results
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, topN);
}

/**
 * For cut mode: factors negatively correlated with weight change are beneficial
 * (eating less = losing weight). Positive r factors increase weight.
 *
 * For bulk mode: factors positively correlated are beneficial.
 */
export type GoalMode = 'cut' | 'bulk' | 'maintain';

export function rankingInsight(result: CorrelationResult, goalMode: GoalMode, lang: 'zh' | 'en' = 'zh'): string {
  const { label, factor, r, direction } = result;
  const displayLabel = lang === 'en' ? FACTOR_LABELS_EN[factor] : label;

  if (lang === 'en') {
    const strength = Math.abs(r) > 0.5 ? 'strong' : Math.abs(r) > 0.3 ? 'moderate' : 'mild';
    if (goalMode === 'cut') {
      return direction === 'negative'
        ? `${displayLabel} shows a ${strength} positive link with weight loss (more = helps cut)`
        : `${displayLabel} shows a ${strength} positive link with weight gain (monitor intake)`;
    }
    if (goalMode === 'bulk') {
      return direction === 'positive'
        ? `${displayLabel} shows a ${strength} positive link with weight gain (supports bulk)`
        : `${displayLabel} correlates with weight loss (may hinder bulk)`;
    }
    return `${displayLabel} correlation with weight change: ${r.toFixed(2)}`;
  }

  const strong = Math.abs(r) > 0.5 ? '強' : Math.abs(r) > 0.3 ? '中等' : '輕微';
  if (goalMode === 'cut') {
    return direction === 'negative'
      ? `${displayLabel} 與體重下降呈${strong}正向關係（多攝取有助減重）`
      : `${displayLabel} 與體重上升呈${strong}正向關係（需注意控制）`;
  }
  if (goalMode === 'bulk') {
    return direction === 'positive'
      ? `${displayLabel} 與體重增加呈${strong}正向關係（有助增肌增重）`
      : `${displayLabel} 與體重下降相關（可能影響增重效果）`;
  }
  return `${displayLabel} 與體重變化的相關係數為 ${r.toFixed(2)}`;
}

// ── Lag correlation ─────────────────────────────────────────────────────────

export interface LagResult {
  lag: number;        // days the factor leads the target
  r: number;
  sampleSize: number;
}

/**
 * Correlation between a factor and the target at multiple lag offsets.
 * `lag = 2` means "factor value 2 days before today" vs "today's target".
 */
export function lagCorrelation(
  factor: Map<string, number>,
  target: Map<string, number>,
  maxLag = 7,
): LagResult[] {
  const results: LagResult[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    const pairs: [number, number][] = [];
    for (const [date, targetVal] of target) {
      const lagDate = new Date(date);
      lagDate.setDate(lagDate.getDate() - lag);
      const factorVal = factor.get(format(lagDate, "yyyy-MM-dd"));
      if (factorVal == null) continue;
      pairs.push([factorVal, targetVal]);
    }
    if (pairs.length < RELIABILITY_THRESHOLDS.MIN_PAIRS) continue;
    results.push({
      lag,
      r: pearson(pairs.map(p => p[0]), pairs.map(p => p[1])),
      sampleSize: pairs.length,
    });
  }
  return results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

export function bestLag(results: LagResult[]): LagResult | null {
  return results.length > 0 ? results[0] : null;
}

// ── Day-of-week pattern ─────────────────────────────────────────────────────

export interface DayOfWeekPattern {
  dayOfWeek: number;   // 0 = Sun .. 6 = Sat
  label: string;
  avg: number;
  count: number;
}

const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export function dayOfWeekPattern(
  points: { date: string; value: number }[],
  lang: 'zh' | 'en' = 'zh',
): DayOfWeekPattern[] {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const { date, value } of points) {
    const dow = new Date(date).getDay();
    buckets[dow].push(value);
  }
  return buckets.map((vals, dow) => ({
    dayOfWeek: dow,
    label: (lang === 'zh' ? DOW_ZH : DOW_EN)[dow],
    avg: vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0,
    count: vals.length,
  }));
}
