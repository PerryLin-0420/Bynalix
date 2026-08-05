/**
 * Pairwise correlation network + weekday-effect pattern discovery.
 *
 * Methodology notes:
 * - Correlations run on FIRST DIFFERENCES (day-over-day change), not raw
 *   levels: daily series are autocorrelated, and two slowly-trending series
 *   correlate spuriously. Differencing removes the shared-trend artifact.
 * - Spearman (rank) correlation instead of Pearson: robust to outliers
 *   (one 3000-kcal day won't dominate) and catches monotonic nonlinear links.
 * - Every edge is gated on |r|, two-tailed p-value, and sample size, since
 *   testing ~50 pairs × lags guarantees false positives without a gate.
 */

import { format } from "date-fns";
import type { DailyStatsRecord } from "@/types";
import { RELIABILITY_THRESHOLDS, getReliability, type Reliability } from "./pearson";

// ── Variables in the network ─────────────────────────────────────────────────

export type NetVar =
  | "weight_kg" | "calories" | "protein_g" | "carb_g" | "fat_g"
  | "water_ml" | "exercise_min" | "exercise_kcal" | "strength_volume_kg"
  | "sleep_hours" | "strength_freq_wk" | "cardio_freq_wk";

export type VarDomain = "body" | "diet" | "water" | "exercise" | "sleep";

export interface NetVarMeta { labelZh: string; labelEn: string; domain: VarDomain }

export const NET_VARS: Record<NetVar, NetVarMeta> = {
  weight_kg:          { labelZh: "體重",     labelEn: "Weight",       domain: "body" },
  calories:           { labelZh: "熱量",     labelEn: "Calories",     domain: "diet" },
  protein_g:          { labelZh: "蛋白質",   labelEn: "Protein",      domain: "diet" },
  carb_g:             { labelZh: "碳水",     labelEn: "Carbs",        domain: "diet" },
  fat_g:              { labelZh: "脂肪",     labelEn: "Fat",          domain: "diet" },
  water_ml:           { labelZh: "飲水",     labelEn: "Water",        domain: "water" },
  exercise_min:       { labelZh: "運動時長", labelEn: "Exercise min", domain: "exercise" },
  exercise_kcal:      { labelZh: "運動消耗", labelEn: "Exercise kcal", domain: "exercise" },
  strength_volume_kg: { labelZh: "重訓總量", labelEn: "Strength vol.", domain: "exercise" },
  sleep_hours:        { labelZh: "睡眠時數", labelEn: "Sleep hours",  domain: "sleep" },
  strength_freq_wk:   { labelZh: "重訓頻率", labelEn: "Strength freq", domain: "exercise" },
  cardio_freq_wk:     { labelZh: "有氧頻率", labelEn: "Cardio freq",  domain: "exercise" },
};

export const DOMAIN_COLORS: Record<VarDomain, string> = {
  body:     "#10b981", // emerald
  diet:     "#fb923c", // orange
  water:    "#38bdf8", // sky
  exercise: "#a78bfa", // violet
  sleep:    "#c084fc", // purple
};

// ── Core statistics ──────────────────────────────────────────────────────────

/** Average-tie ranks for Spearman. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k][1]] = avgRank;
    i = j + 1;
  }
  return out;
}

function pearsonRaw(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; sx += dx * dx; sy += dy * dy;
  }
  const den = Math.sqrt(sx * sy);
  return den === 0 ? 0 : num / den;
}

/** Spearman rank correlation. */
export function spearman(x: number[], y: number[]): number {
  return pearsonRaw(ranks(x), ranks(y));
}

// Regularized incomplete beta via continued fraction (Lentz), for Student-t CDF.
function betacf(a: number, b: number, x: number): number {
  const EPS = 3e-8, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function lnGamma(z: number): number {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
  const t = z + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Two-tailed p-value for a correlation r with sample size n (t-test, df=n-2). */
export function pValueForR(r: number, n: number): number {
  if (n < 3) return 1;
  const df = n - 2;
  const absR = Math.min(Math.abs(r), 0.999999);
  const t = absR * Math.sqrt(df / (1 - absR * absR));
  // Two-tailed: P(|T| > t) = I_{df/(df+t²)}(df/2, 1/2)
  return ibeta(df / 2, 0.5, df / (df + t * t));
}

// ── Series construction ──────────────────────────────────────────────────────

/** Consecutive-day first differences: only dates whose previous day also has data. */
function firstDifference(map: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [date, v] of map) {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    const pv = map.get(format(prev, "yyyy-MM-dd"));
    if (pv != null) out.set(date, v - pv);
  }
  return out;
}

/** Extract a date→value map for one variable from the daily records. */
function seriesOf(recs: DailyStatsRecord[], v: NetVar): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of recs) {
    const val = (r as any)[v] as number | null | undefined;
    if (val != null) m.set(r.date, val);
  }
  return m;
}

/**
 * Training frequency as a trailing 7-day count of training days — a
 * "sessions per week" figure evaluated at daily resolution, so it slots into
 * the same differencing/correlation machinery as every other variable.
 *
 * A day with no logged session counts as a non-training day rather than as
 * missing data: for frequency, "nothing logged" is the signal. The first six
 * days of the range are skipped since their window is not yet a full week.
 *
 * Returns an empty map when the user never trained in the range, so the
 * variable drops out of the graph entirely instead of showing up as a flat
 * zero line with no possible relationships.
 */
function weeklyFrequency(
  recs: DailyStatsRecord[],
  field: "cardio_count" | "strength_count",
): Map<string, number> {
  const sorted = [...recs].sort((a, b) => a.date.localeCompare(b.date));
  const trained = sorted.map(r => (((r as any)[field] as number | null) ?? 0) > 0 ? 1 : 0);
  if (!trained.some(Boolean)) return new Map();

  const out = new Map<string, number>();
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += trained[i];
    if (i >= 7) sum -= trained[i - 7];
    if (i >= 6) out.set(sorted[i].date, sum);
  }
  return out;
}

/** Variables computed from the records rather than read off a single column. */
const DERIVED_SERIES: Partial<Record<NetVar, (recs: DailyStatsRecord[]) => Map<string, number>>> = {
  strength_freq_wk: recs => weeklyFrequency(recs, "strength_count"),
  cardio_freq_wk:   recs => weeklyFrequency(recs, "cardio_count"),
};

/** Align two date-keyed maps into paired arrays, with a lag applied to `a`
 *  (lag = k means a's value k days earlier vs b's value today). */
function alignPairs(
  a: Map<string, number>, b: Map<string, number>, lag: number,
): { x: number[]; y: number[]; dates: string[] } {
  const x: number[] = [], y: number[] = [], dates: string[] = [];
  for (const [date, bv] of b) {
    let key = date;
    if (lag > 0) {
      const d = new Date(date);
      d.setDate(d.getDate() - lag);
      key = format(d, "yyyy-MM-dd");
    }
    const av = a.get(key);
    if (av != null) { x.push(av); y.push(bv); dates.push(date); }
  }
  return { x, y, dates };
}

// ── Network computation ──────────────────────────────────────────────────────

export interface NetNode {
  id: NetVar;
  labelZh: string;
  labelEn: string;
  domain: VarDomain;
  density: number;   // % of range days with data
  degree: number;    // number of qualifying edges
}

export interface NetEdge {
  source: NetVar;    // when lag > 0: source leads target by `lag` days
  target: NetVar;
  r: number;
  n: number;
  p: number;
  lag: number;       // 0 = same-day (undirected)
  reliability: Reliability;
  /** Aligned differenced pairs for the scatter detail view. */
  pairs: { x: number; y: number; date: string }[];
}

export interface CorrelationNetwork {
  nodes: NetNode[];
  edges: NetEdge[];
}

export interface NetworkOptions {
  minAbsR?: number;   // default 0.3
  maxP?: number;      // default 0.05
  minN?: number;      // default LOW_PAIRS (14)
  maxLag?: number;    // default 3 (phase-2 directed edges); 0 disables lag search
}

/**
 * Build the full pairwise correlation network over first-differenced series.
 * For each pair, same-day Spearman is computed first; lags 1..maxLag are then
 * tried in both directions, and a lagged edge replaces the same-day edge only
 * when it clearly beats it (|r| + 0.05). One edge max per variable pair.
 */
export function computeCorrelationNetwork(
  recs: DailyStatsRecord[],
  rangeDays: number,
  opts: NetworkOptions = {},
): CorrelationNetwork {
  const minAbsR = opts.minAbsR ?? 0.3;
  const maxP    = opts.maxP    ?? 0.05;
  const minN    = opts.minN    ?? RELIABILITY_THRESHOLDS.LOW_PAIRS;
  const maxLag  = opts.maxLag  ?? 3;

  const vars = Object.keys(NET_VARS) as NetVar[];
  const raw  = new Map(vars.map(v => [v, DERIVED_SERIES[v]?.(recs) ?? seriesOf(recs, v)]));
  const diff = new Map(vars.map(v => [v, firstDifference(raw.get(v)!)]));

  const evaluate = (a: NetVar, b: NetVar, lag: number) => {
    const { x, y, dates } = alignPairs(diff.get(a)!, diff.get(b)!, lag);
    if (x.length < minN) return null;
    const r = spearman(x, y);
    const p = pValueForR(r, x.length);
    return { r, p, n: x.length, pairs: dates.map((d, i) => ({ x: x[i], y: y[i], date: d })) };
  };

  const edges: NetEdge[] = [];
  for (let i = 0; i < vars.length; i++) {
    for (let j = i + 1; j < vars.length; j++) {
      const a = vars[i], b = vars[j];
      const same = evaluate(a, b, 0);
      // Best lagged option in either direction
      let bestLagged: { res: NonNullable<ReturnType<typeof evaluate>>; src: NetVar; tgt: NetVar; lag: number } | null = null;
      for (let lag = 1; lag <= maxLag; lag++) {
        for (const [src, tgt] of [[a, b], [b, a]] as [NetVar, NetVar][]) {
          const res = evaluate(src, tgt, lag);
          if (res && (!bestLagged || Math.abs(res.r) > Math.abs(bestLagged.res.r))) {
            bestLagged = { res, src, tgt, lag };
          }
        }
      }
      const laggedWins = bestLagged &&
        Math.abs(bestLagged.res.r) > (same ? Math.abs(same.r) : 0) + 0.05;
      const pick = laggedWins
        ? { ...bestLagged!.res, source: bestLagged!.src, target: bestLagged!.tgt, lag: bestLagged!.lag }
        : same ? { ...same, source: a, target: b, lag: 0 } : null;
      if (!pick) continue;
      if (Math.abs(pick.r) < minAbsR || pick.p > maxP || pick.n < minN) continue;
      edges.push({
        source: pick.source, target: pick.target,
        r: pick.r, n: pick.n, p: pick.p, lag: pick.lag,
        reliability: getReliability(pick.n),
        pairs: pick.pairs,
      });
    }
  }

  const degree = new Map<NetVar, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const nodes: NetNode[] = vars.map(v => ({
    id: v,
    labelZh: NET_VARS[v].labelZh,
    labelEn: NET_VARS[v].labelEn,
    domain: NET_VARS[v].domain,
    density: rangeDays > 0 ? Math.round((raw.get(v)!.size / rangeDays) * 100) : 0,
    degree: degree.get(v) ?? 0,
  })).filter(n => n.density > 0); // hide variables never logged in range

  return { nodes, edges };
}

// ── Weekday-effect patterns (Phase 3) ────────────────────────────────────────

export interface WeekdayPattern {
  variable: NetVar;
  weekendMean: number;
  weekdayMean: number;
  diff: number;        // weekend − weekday
  relPct: number;      // diff / weekdayMean × 100 (0 when weekdayMean is 0)
  p: number;           // Welch's t-test, two-tailed
  nWeekend: number;
  nWeekday: number;
}

/** Welch's t-test two-tailed p-value. */
function welchP(a: number[], b: number[]): number {
  const n1 = a.length, n2 = b.length;
  if (n1 < 2 || n2 < 2) return 1;
  const m1 = a.reduce((s, v) => s + v, 0) / n1;
  const m2 = b.reduce((s, v) => s + v, 0) / n2;
  const v1 = a.reduce((s, v) => s + (v - m1) ** 2, 0) / (n1 - 1);
  const v2 = b.reduce((s, v) => s + (v - m2) ** 2, 0) / (n2 - 1);
  const se2 = v1 / n1 + v2 / n2;
  if (se2 === 0) return 1;
  const t = Math.abs(m1 - m2) / Math.sqrt(se2);
  // Welch–Satterthwaite df
  const df = se2 ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  if (!isFinite(df) || df < 1) return 1;
  return ibeta(df / 2, 0.5, df / (df + t * t));
}

/**
 * Weekend (Sat/Sun) vs weekday comparison per variable.
 * Returns significant patterns (p < maxP, both groups ≥ minPerGroup),
 * sorted by |relative effect| descending.
 */
export function computeWeekdayPatterns(
  recs: DailyStatsRecord[],
  opts: { maxP?: number; minPerGroup?: number } = {},
): WeekdayPattern[] {
  const maxP        = opts.maxP        ?? 0.05;
  const minPerGroup = opts.minPerGroup ?? 4;
  const out: WeekdayPattern[] = [];

  for (const v of Object.keys(NET_VARS) as NetVar[]) {
    // Derived variables are trailing 7-day windows, so every day's value already
    // spans a full week — a weekend-vs-weekday split of them means nothing.
    if (DERIVED_SERIES[v]) continue;
    const weekend: number[] = [], weekday: number[] = [];
    for (const r of recs) {
      const val = (r as any)[v] as number | null | undefined;
      if (val == null) continue;
      const dow = new Date(r.date).getDay();
      (dow === 0 || dow === 6 ? weekend : weekday).push(val);
    }
    if (weekend.length < minPerGroup || weekday.length < minPerGroup) continue;
    const wm = weekend.reduce((s, x) => s + x, 0) / weekend.length;
    const dm = weekday.reduce((s, x) => s + x, 0) / weekday.length;
    const p  = welchP(weekend, weekday);
    if (p > maxP) continue;
    out.push({
      variable: v,
      weekendMean: wm, weekdayMean: dm,
      diff: wm - dm,
      relPct: dm !== 0 ? ((wm - dm) / Math.abs(dm)) * 100 : 0,
      p,
      nWeekend: weekend.length, nWeekday: weekday.length,
    });
  }
  return out.sort((a, b) => Math.abs(b.relPct) - Math.abs(a.relPct));
}
