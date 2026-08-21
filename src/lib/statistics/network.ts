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

import type { DailyStatsRecord } from "@/types";
import { RELIABILITY_THRESHOLDS, getReliability, type Reliability } from "./pearson";

// ── Variables in the network ─────────────────────────────────────────────────

export type NetVar =
  | "weight_kg" | "calories" | "protein_g" | "carb_g" | "fat_g"
  | "water_ml" | "exercise_min" | "exercise_kcal" | "strength_volume_kg"
  | "sleep_hours" | "strength_freq_wk" | "cardio_freq_wk"
  | "last_meal_hour" | "exercise_hour" | "wake_hour";

export type VarDomain = "body" | "diet" | "water" | "exercise" | "sleep" | "time";

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
  last_meal_hour:     { labelZh: "最晚進食", labelEn: "Last meal",    domain: "time" },
  exercise_hour:      { labelZh: "運動時段", labelEn: "Workout time", domain: "time" },
  wake_hour:          { labelZh: "起床時間", labelEn: "Wake time",    domain: "time" },
};

export const DOMAIN_COLORS: Record<VarDomain, string> = {
  body:     "#10b981", // emerald
  diet:     "#fb923c", // orange
  water:    "#38bdf8", // sky
  exercise: "#a78bfa", // violet
  sleep:    "#c084fc", // purple
  time:     "#f59e0b", // amber
};

// ── Core statistics ──────────────────────────────────────────────────────────

/**
 * Scratch space for the rank computation.
 *
 * A network runs tens of thousands of Spearman correlations (every variable
 * pair, at every lag), and the timeline multiplies that by its frame count.
 * Ranking allocated an array of [value, index] tuples per call, which made
 * garbage collection — not the statistics — the dominant cost. The buffers are
 * allocated once per network and reused for every correlation in it.
 */
interface RankScratch {
  order: Int32Array;
  rx: Float64Array;
  ry: Float64Array;
}

function makeRankScratch(capacity: number): RankScratch {
  return {
    order: new Int32Array(capacity),
    rx: new Float64Array(capacity),
    ry: new Float64Array(capacity),
  };
}

/** Average-tie ranks of `xs[0..n)`, written into `out`. */
function ranksInto(xs: ArrayLike<number>, n: number, out: Float64Array, order: Int32Array): void {
  const idx = order.subarray(0, n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => xs[a] - xs[b]);
  let i = 0;
  while (i < n) {
    let j = i;
    const v = xs[idx[i]];
    while (j + 1 < n && xs[idx[j + 1]] === v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]] = avgRank;
    i = j + 1;
  }
}

/** Pearson r over the first `n` entries of two buffers. */
function pearsonBuf(x: ArrayLike<number>, y: ArrayLike<number>, n: number): number {
  if (n < 2) return 0;
  let sxv = 0, syv = 0;
  for (let i = 0; i < n; i++) { sxv += x[i]; syv += y[i]; }
  const mx = sxv / n, my = syv / n;
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; sx += dx * dx; sy += dy * dy;
  }
  const den = Math.sqrt(sx * sy);
  return den === 0 ? 0 : num / den;
}

/** Spearman over the first `n` entries of two buffers, using shared scratch. */
function spearmanBuf(
  x: ArrayLike<number>, y: ArrayLike<number>, n: number, scratch: RankScratch,
): number {
  if (n < 2) return 0;
  ranksInto(x, n, scratch.rx, scratch.order);
  ranksInto(y, n, scratch.ry, scratch.order);
  return pearsonBuf(scratch.rx, scratch.ry, n);
}

/** Spearman rank correlation. */
export function spearman(x: number[], y: number[]): number {
  return spearmanBuf(x, y, Math.min(x.length, y.length), makeRankScratch(Math.min(x.length, y.length)));
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

/**
 * Days since 1970-01-01 for a "YYYY-MM-DD" string (Hinnant's civil algorithm).
 *
 * Differencing and lagging are both "step back k days", which used to mean
 * constructing a Date, mutating it and re-formatting it for every value of
 * every variable at every lag. Turning each date into an integer once makes
 * those steps plain subtraction — which is what made the timeline's hundreds
 * of network builds affordable.
 */
function dayNumber(iso: string): number {
  const yRaw = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  const y   = yRaw - (m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;                                        // [0, 399]
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * A date-keyed series as one slot per calendar day of the range, missing days
 * held as NaN. Indexing by day means "yesterday" is `i - 1` whether or not
 * yesterday was logged, so gaps stay gaps instead of silently closing up.
 */
function toDense(series: Map<string, number>, dayIndex: Map<string, number>, span: number): Float64Array {
  const out = new Float64Array(span).fill(NaN);
  for (const [date, v] of series) {
    const i = dayIndex.get(date);
    if (i !== undefined) out[i] = v;
  }
  return out;
}

/** Consecutive-day first differences: only days whose previous day also has data. */
function denseDifference(raw: Float64Array): Float64Array {
  const out = new Float64Array(raw.length).fill(NaN);
  for (let i = 1; i < raw.length; i++) {
    const v = raw[i], prev = raw[i - 1];
    // NaN fails self-comparison, which is the cheapest "has a value" test.
    if (v === v && prev === prev) out[i] = v - prev;
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

/** Max qualifying edges kept per time-domain node (clutter control). */
const TIME_EDGE_QUOTA = 3;

/** Variables computed from the records rather than read off a single column. */
const DERIVED_SERIES: Partial<Record<NetVar, (recs: DailyStatsRecord[]) => Map<string, number>>> = {
  strength_freq_wk: recs => weeklyFrequency(recs, "strength_count"),
  cardio_freq_wk:   recs => weeklyFrequency(recs, "cardio_count"),
};

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
  /**
   * Keep each edge's aligned scatter points. Default true. The timeline builds
   * hundreds of networks and never opens a scatter, so it turns this off and
   * keeps only the edge statistics.
   */
  keepPairs?: boolean;
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
  const keepPairs = opts.keepPairs ?? true;

  const vars = Object.keys(NET_VARS) as NetVar[];
  if (recs.length === 0) return { nodes: [], edges: [] };

  // ── Calendar-day index ─────────────────────────────────────────────────────
  // One slot per day between the first and last record, so a missing day is an
  // empty slot rather than a shorter array: differencing and lagging are then
  // index arithmetic that cannot accidentally pair non-adjacent days.
  const dayIndex = new Map<string, number>();
  let minDay = Infinity, maxDay = -Infinity;
  for (const r of recs) {
    const dn = dayNumber(r.date);
    if (dn < minDay) minDay = dn;
    if (dn > maxDay) maxDay = dn;
  }
  const span = maxDay - minDay + 1;
  const dateAt = new Array<string>(span);
  for (const r of recs) {
    const i = dayNumber(r.date) - minDay;
    dayIndex.set(r.date, i);
    dateAt[i] = r.date;
  }

  const diff   = new Map<NetVar, Float64Array>();
  const logged = new Map<NetVar, number>();   // days with a value, for density
  for (const v of vars) {
    const raw = DERIVED_SERIES[v]?.(recs) ?? seriesOf(recs, v);
    logged.set(v, raw.size);
    diff.set(v, denseDifference(toDense(raw, dayIndex, span)));
  }

  // ── Pair evaluation ────────────────────────────────────────────────────────
  // Buffers are filled by `align` and consumed immediately, so one set is
  // shared by every evaluation instead of allocating per candidate.
  const xBuf = new Float64Array(span);
  const yBuf = new Float64Array(span);
  const dayBuf = new Int32Array(span);
  const scratch = makeRankScratch(span);

  /** Pair up `a` shifted `lag` days back against `b`; returns the pair count. */
  const align = (a: NetVar, b: NetVar, lag: number): number => {
    const da = diff.get(a)!, db = diff.get(b)!;
    let k = 0;
    for (let i = lag; i < span; i++) {
      const av = da[i - lag], bv = db[i];
      if (av === av && bv === bv) { xBuf[k] = av; yBuf[k] = bv; dayBuf[k] = i; k++; }
    }
    return k;
  };

  interface Candidate { r: number; n: number; source: NetVar; target: NetVar; lag: number }

  const evaluate = (a: NetVar, b: NetVar, lag: number): Candidate | null => {
    const n = align(a, b, lag);
    if (n < minN) return null;
    return { r: spearmanBuf(xBuf, yBuf, n, scratch), n, source: a, target: b, lag };
  };

  /** Re-run the winning alignment to materialise its scatter points. */
  const pairsOf = (c: Candidate): { x: number; y: number; date: string }[] => {
    const n = align(c.source, c.target, c.lag);
    const out = new Array<{ x: number; y: number; date: string }>(n);
    for (let i = 0; i < n; i++) out[i] = { x: xBuf[i], y: yBuf[i], date: dateAt[dayBuf[i]] };
    return out;
  };

  const edges: NetEdge[] = [];
  for (let i = 0; i < vars.length; i++) {
    for (let j = i + 1; j < vars.length; j++) {
      const a = vars[i], b = vars[j];
      // Time↔time pairs are trivially coupled (late wake → late meals) and
      // only add clutter — never draw them.
      if (NET_VARS[a].domain === "time" && NET_VARS[b].domain === "time") continue;
      const same = evaluate(a, b, 0);
      // Best lagged option in either direction
      let bestLagged: Candidate | null = null;
      for (let lag = 1; lag <= maxLag; lag++) {
        for (const [src, tgt] of [[a, b], [b, a]] as [NetVar, NetVar][]) {
          const res = evaluate(src, tgt, lag);
          if (res && (!bestLagged || Math.abs(res.r) > Math.abs(bestLagged.r))) bestLagged = res;
        }
      }
      const laggedWins = bestLagged &&
        Math.abs(bestLagged.r) > (same ? Math.abs(same.r) : 0) + 0.05;
      const pick = laggedWins ? bestLagged! : same;
      if (!pick) continue;
      if (Math.abs(pick.r) < minAbsR || pick.n < minN) continue;
      // The p-value's continued fraction is the most expensive thing here, so
      // it is computed for the one candidate that survived, not for all of them.
      const p = pValueForR(pick.r, pick.n);
      if (p > maxP) continue;
      edges.push({
        source: pick.source, target: pick.target,
        r: pick.r, n: pick.n, p, lag: pick.lag,
        reliability: getReliability(pick.n),
        pairs: keepPairs ? pairsOf(pick) : [],
      });
    }
  }

  // Per-time-node quota: keep only the strongest TIME_EDGE_QUOTA edges of each
  // time-domain variable so a single clock variable can't fan out everywhere.
  const quotaUsed = new Map<NetVar, number>();
  const keptEdges = [...edges]
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .filter(e => {
      const timeEnds = [e.source, e.target].filter(v => NET_VARS[v].domain === "time");
      if (timeEnds.length === 0) return true;
      if (timeEnds.some(v => (quotaUsed.get(v) ?? 0) >= TIME_EDGE_QUOTA)) return false;
      for (const v of timeEnds) quotaUsed.set(v, (quotaUsed.get(v) ?? 0) + 1);
      return true;
    });

  const degree = new Map<NetVar, number>();
  for (const e of keptEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const nodes: NetNode[] = vars.map(v => ({
    id: v,
    labelZh: NET_VARS[v].labelZh,
    labelEn: NET_VARS[v].labelEn,
    domain: NET_VARS[v].domain,
    density: rangeDays > 0 ? Math.round((logged.get(v)! / rangeDays) * 100) : 0,
    degree: degree.get(v) ?? 0,
  })).filter(n =>
    // Time nodes are "discovery nodes": rendered only when they found something.
    // Other variables show whenever they have any data in range.
    NET_VARS[n.id].domain === "time" ? n.degree > 0 : n.density > 0);

  return { nodes, edges: keptEdges };
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
