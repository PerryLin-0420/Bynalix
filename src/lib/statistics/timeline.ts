/**
 * Timeline: what a shrinking analysis window says about your goal.
 *
 * The end of the window is pinned (the latest logged day), and the start
 * walks forward one step at a time: [A, end], [A+step, end], [A+2·step, end]
 * … down to the shortest window a correlation can stand on. Each window is
 * scored against the goal variable only (see `computeGoalLinks`), not the
 * full pairwise network — the network is still what powers the statistics,
 * it just never reaches the screen as a diagram.
 *
 * Two questions come out of the run:
 * - Which factors affect the goal no matter how far back the window reaches,
 *   including the tightest, most recent one? → `persistentGoalLinks`
 * - Which factors only started affecting the goal partway through the
 *   record, and still do as of the latest data? → `emergedGoalLinks`
 *
 * Frames are always built oldest-window-first, so frame 0 is the widest view
 * (the entire available history) and the last frame is the tightest.
 */

import { format, parseISO, subDays, addDays, differenceInCalendarDays } from "date-fns";
import {
  computeGoalLinks, correlationDifferenceP, pairCorrelationIn, prepareSeries,
  spearman, pValueForR, NET_VARS,
  type GoalEdge, type NetVar, type PairCorrelation, type PreparedSeries,
} from "./network";
import { RELIABILITY_THRESHOLDS, getReliability, type Reliability } from "./pearson";
import type { DailyStatsRecord } from "@/types";

/** Which side of the goal variable a link is good news for. */
export type GoalDirection = "up" | "down";

/**
 * Shortest window worth analysing. Below the network's own sample-size gate
 * no link can qualify, so a shorter window is guaranteed to add nothing.
 * One extra day on top because differencing costs the first day of the window.
 */
export const TIMELINE_MIN_WINDOW = RELIABILITY_THRESHOLDS.LOW_PAIRS + 1; // 15

/**
 * Upper bound on frames; the step widens automatically rather than exceeding
 * it. Frames are cheap here (one variable vs. the goal, not the full pairwise
 * network), but a multi-year daily scan is still more granularity than the
 * result changes at.
 */
export const TIMELINE_MAX_FRAMES = 365;

/**
 * Ceiling on the total days analysed across a whole run (see `workFor`).
 * Sized so a couple of years of history at a one-day step still builds
 * promptly, while a much longer history widens its step instead.
 */
export const TIMELINE_WORK_BUDGET = 60_000;

export const TIMELINE_STEP_OPTIONS = [1, 2, 3, 7, 14] as const;

// ── Frames ───────────────────────────────────────────────────────────────────

export interface GoalFrame {
  index: number;
  from:  string;
  to:    string;
  days:  number;
  /** Links against the goal that qualified for this window, strongest first. */
  edges: GoalEdge[];
}

export interface TimelineOptions {
  /** Window start of the first (widest) frame. */
  startDate: string;
  /** Pinned window end, shared by every frame. */
  endDate:   string;
  /** The variable every frame's links are measured against. */
  goalVar:   NetVar;
  /** Days the start advances per frame; widened if the frame count would overflow. */
  stepDays?:  number;
  minWindow?: number;
  maxFrames?: number;
}

export interface TimelineResult {
  frames: GoalFrame[];
  /** The step actually used — larger than requested when frames were capped. */
  effectiveStep: number;
  /** True when `effectiveStep` had to exceed the requested step. */
  stepWidened: boolean;
}

/** Frames a step produces over a given span. */
function frameCountFor(span: number, step: number): number {
  return Math.floor(span / step) + 1;
}

/**
 * Total days analysed across every frame — the honest cost measure.
 *
 * A frame's cost is roughly linear in its window length, and the windows here
 * run from the whole history down to two weeks, so frame count alone badly
 * under-states the work: doubling the range doubles the frames *and* the size
 * of each one. Summing the windows is what keeps a multi-year history from
 * quietly turning into a build an order of magnitude longer than a one-year one.
 */
function workFor(totalDays: number, span: number, step: number): number {
  const frames = frameCountFor(span, step);
  return frames * totalDays - step * (frames * (frames - 1)) / 2;
}

/**
 * How many frames a configuration produces, and the step needed to keep the
 * build within budget. Pure, so the setup UI can show the count — and any
 * widening — before committing to a build.
 */
export function planTimeline(
  totalDays: number,
  stepDays: number,
  minWindow = TIMELINE_MIN_WINDOW,
  maxFrames = TIMELINE_MAX_FRAMES,
  workBudget = TIMELINE_WORK_BUDGET,
): { frameCount: number; effectiveStep: number; stepWidened: boolean } {
  const span = totalDays - minWindow;                 // days the start can advance
  const step = Math.max(1, Math.floor(stepDays));
  if (span < 0) return { frameCount: 0, effectiveStep: step, stepWidened: false };

  let eff = step;
  if (frameCountFor(span, eff) > maxFrames) eff = step * Math.ceil(frameCountFor(span, step) / maxFrames);
  while (eff < span && workFor(totalDays, span, eff) > workBudget) eff++;

  return {
    frameCount:    frameCountFor(span, eff),
    effectiveStep: eff,
    stepWidened:   eff !== step,
  };
}

/**
 * Build every frame from one contiguous run of daily records.
 *
 * `recs` must cover [startDate, endDate] with one entry per day (which is
 * what `getDailyStatsRecords` returns), so a frame's window is a plain suffix
 * of the array and no re-querying is needed. The loop hands control back to
 * the browser between chunks so a progress bar can paint and a cancel button
 * stays responsive; `shouldAbort` is polled at the same points.
 */
export async function buildTimeline(
  recs: DailyStatsRecord[],
  opts: TimelineOptions,
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
): Promise<TimelineResult> {
  const minWindow = opts.minWindow ?? TIMELINE_MIN_WINDOW;
  const maxFrames = opts.maxFrames ?? TIMELINE_MAX_FRAMES;

  const inRange = recs
    .filter(r => r.date >= opts.startDate && r.date <= opts.endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const { frameCount, effectiveStep, stepWidened } =
    planTimeline(inRange.length, opts.stepDays ?? 1, minWindow, maxFrames);
  if (frameCount <= 0) return { frames: [], effectiveStep, stepWidened };

  const frames: GoalFrame[] = [];
  const to = inRange[inRange.length - 1].date;
  let chunkStart = Date.now();

  for (let i = 0; i < frameCount; i++) {
    if (shouldAbort?.()) break;
    const offset = i * effectiveStep;
    const window = inRange.slice(offset);
    const edges  = computeGoalLinks(window, opts.goalVar);
    frames.push({ index: i, from: window[0].date, to, days: window.length, edges });

    onProgress?.(i + 1, frameCount);
    // Yield on a time budget rather than a fixed frame count: window sizes vary
    // by an order of magnitude across a long timeline, so a fixed count either
    // stalls the first frames or yields pointlessly on the last ones.
    if (Date.now() - chunkStart > 40) {
      await new Promise(resolve => setTimeout(resolve, 0));
      chunkStart = Date.now();
    }
  }

  return { frames, effectiveStep, stepWidened };
}

// ── Split-date search machinery (shared by persistent & emerged) ─────────────

/** Split dates to try: frame starts that leave a real period on both sides. */
function splitCandidates(frames: GoalFrame[], minPeriodDays: number, maxCandidates: number): GoalFrame[] {
  const total = frames[0]?.days ?? 0;
  const usable = frames.filter(f =>
    f.days >= minPeriodDays && total - f.days >= minPeriodDays);
  if (usable.length <= maxCandidates) return usable;
  const stride = usable.length / maxCandidates;
  return Array.from({ length: maxCandidates }, (_, i) => usable[Math.floor(i * stride)]);
}

/** The lag a factor qualified under most often across the frames it appeared in. */
function dominantLag(frames: GoalFrame[], factor: NetVar): number | null {
  const counts = new Map<number, number>();
  for (const f of frames) {
    const e = f.edges.find(e => e.factor === factor);
    if (e) counts.set(e.lag, (counts.get(e.lag) ?? 0) + 1);
  }
  let bestLag: number | null = null, bestN = 0;
  for (const [lag, n] of counts) if (n > bestN) { bestLag = lag; bestN = n; }
  return bestLag;
}

// ── Long-term links ────────────────────────────────────────────────────────

export interface PersistentGoalLink {
  factor: NetVar;
  lag:    number;
  direction: "positive" | "negative";
  r: number;    // over the entire available history (frame 0's edge)
  n: number;
  p: number;
  /** Fraction of frames the link held in across the whole run. */
  presence: number;
  reliability: Reliability;
}

/**
 * Factors whose link to the goal holds up no matter how the window is sized —
 * including recently, using only the newer stretch of the record — so the
 * effect is not an artefact of old data and has not gone away since.
 *
 * A factor qualifies only if it clears the edge bar using the *entire*
 * history (frame 0) AND holds in most of the frames overall AND holds in most
 * of the *recent* frames specifically (windows no wider than `recentDays`).
 * The last two are deliberately separate checks, not one: gating on the single
 * narrowest frame alone was tried first and rejected — at the very bottom of
 * the range (barely more than the sample-size floor) one noisy day is enough
 * to flip whether a real, stable relationship happens to clear the bar in
 * that one frame, which let a single false negative there hide an otherwise
 * rock-solid link. Requiring most of a whole band of "recent" frames survives
 * that kind of single-frame noise while still meaning "holds now", not just
 * "held on average across the whole run".
 */
export function persistentGoalLinks(
  frames: GoalFrame[],
  goalDir: GoalDirection,
  opts: { minPresence?: number; minRecentPresence?: number; recentDays?: number } = {},
): PersistentGoalLink[] {
  const minPresence       = opts.minPresence       ?? 0.85;
  // Lower bar than the overall one: the recent band's frames sit right at the
  // sample-size floor, so even a genuinely stable link naturally clears the
  // edge bar less consistently there than it does across the whole run — this
  // check only needs to confirm "still roughly true now", not re-prove the
  // same confidence a much larger sample gives the overall figure.
  const minRecentPresence = opts.minRecentPresence ?? 0.7;
  const recentDays        = opts.recentDays        ?? RELIABILITY_THRESHOLDS.HIGH_PAIRS;
  if (frames.length === 0) return [];

  const first = frames[0];
  // The narrow end of the run: every frame no wider than `recentDays`, or — if
  // the whole run never gets that tight — just the single narrowest frame.
  const recentBand = frames.filter(f => f.days <= recentDays);
  const recent = recentBand.length > 0 ? recentBand : [frames[frames.length - 1]];

  const out: PersistentGoalLink[] = [];
  for (const edge of first.edges) {
    const overallHeld = frames.reduce((n, f) => n + (f.edges.some(e => e.factor === edge.factor) ? 1 : 0), 0);
    const presence = overallHeld / frames.length;
    if (presence < minPresence) continue;

    const recentHeld = recent.reduce((n, f) => n + (f.edges.some(e => e.factor === edge.factor) ? 1 : 0), 0);
    if (recentHeld / recent.length < minRecentPresence) continue;

    const positive = goalDir === "up" ? edge.r > 0 : edge.r < 0;
    out.push({
      factor: edge.factor, lag: edge.lag,
      direction: positive ? "positive" : "negative",
      r: edge.r, n: edge.n, p: edge.p, presence,
      reliability: edge.reliability,
    });
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// ── Newly-emerged links ───────────────────────────────────────────────────────

export interface EmergedGoalLink {
  factor: NetVar;
  lag:    number;
  direction: "positive" | "negative";
  /** Holds from this date through to the pinned end; the split's onset. */
  date:  string;
  frameIndex: number;
  sinceDays:  number;
  beforeDays: number;
  since:  PairCorrelation;
  before: PairCorrelation;
  /** p for the two periods differing, corrected for the whole search. */
  pAdjusted: number;
  /** Split tests the correction accounts for. */
  tests: number;
}

export interface EmergedOptions {
  /** Smallest |r| the "since" period must reach — the network's own edge bar. */
  minAbsR?: number;
  /**
   * Largest p the difference between the two periods may have *after*
   * correcting for the search. Every factor is tried against every candidate
   * split and the best is kept, so an uncorrected threshold would be met by
   * chance many times over. Bonferroni against the number of splits evaluated
   * is the blunt but honest correction.
   */
  maxP?: number;
  /** Pairs each side needs. */
  minSide?: number;
  /** Days each side needs; a split with a fortnight on one side means nothing. */
  minPeriodDays?: number;
  /** How far apart the two sides must be before it counts as newly emerged. */
  minContrast?: number;
  /** Cap on split dates tried per factor; spread evenly over the run. */
  maxCandidates?: number;
}

const EMERGED_DEFAULTS = {
  minAbsR:       0.3,
  maxP:          0.03,
  minSide:       RELIABILITY_THRESHOLDS.HIGH_PAIRS,
  // A "since" period right at the sample-size floor is exactly where a
  // correlation spikes on nothing but noise — measured false-positive rate on
  // pure-noise records dropped from ~8% to 0% moving this from 30 to 45 days.
  minPeriodDays: 45,
  minContrast:   0.25,
  // Restricting the search to the goal variable already cuts the factor count
  // from ~90 pairs (the full network) to ~13, so the Bonferroni correction
  // below has far fewer tests to answer for than the general-purpose version
  // this was adapted from. Candidates are trimmed too — a coarser date grid
  // spread across the run answers "roughly when" just as well as a daily one
  // while keeping the correction from erasing real, moderate-strength effects.
  maxCandidates: 20,
} as const;

/**
 * Factors whose link to the goal turned on partway through the record and
 * still holds as of the latest data — the counterpart to `persistentGoalLinks`.
 *
 * Every candidate date splits the record into "before" and "since"; the
 * correlation on each side is compared with Fisher's r-to-z, and the date
 * where they disagree most sharply — with "since" the stronger side — is kept.
 * A factor already reported as persistent is skipped: it does not need a
 * turning point because it never needed one.
 *
 * This catches what watching frames alone cannot: a link strong enough to
 * survive being diluted by the old data holds in *every* frame, old and new
 * alike, so it never visibly "appears" — only the before/since split reveals
 * when it actually started.
 */
export async function emergedGoalLinks(
  recs: DailyStatsRecord[],
  frames: GoalFrame[],
  goalVar: NetVar,
  goalDir: GoalDirection,
  opts: EmergedOptions = {},
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
): Promise<EmergedGoalLink[]> {
  const o = { ...EMERGED_DEFAULTS, ...opts };
  if (frames.length < 3) return [];

  const prep = prepareSeries(recs);
  if (!prep) return [];

  const rangeStart = frames[0].from;
  const rangeEnd   = frames[0].to;
  const candidates = splitCandidates(frames, o.minPeriodDays, o.maxCandidates);
  if (candidates.length === 0) return [];

  const persistent = new Set(persistentGoalLinks(frames, goalDir).map(l => l.factor));
  const factors = (Object.keys(NET_VARS) as NetVar[])
    .filter(v => v !== goalVar && !persistent.has(v));

  const tests = factors.length * candidates.length;
  const results: EmergedGoalLink[] = [];
  let chunkStart = Date.now();

  for (let fi = 0; fi < factors.length; fi++) {
    if (shouldAbort?.()) break;
    const factor = factors[fi];
    const lag = dominantLag(frames, factor);
    if (lag == null) { onProgress?.(fi + 1, factors.length); continue; }

    let best: EmergedGoalLink | null = null;
    for (const frame of candidates) {
      const since  = pairCorrelationIn(prep, factor, goalVar, lag, frame.from, rangeEnd);
      const before = pairCorrelationIn(prep, factor, goalVar, lag,
        rangeStart, format(subDays(parseISO(frame.from), 1), "yyyy-MM-dd"));
      if (!since || !before) continue;
      if (since.n < o.minSide || before.n < o.minSide) continue;

      // Only "emerged" (stronger in the recent period) matters here — a link
      // that used to hold and stopped is a different question this function
      // does not answer.
      const contrast = Math.abs(since.r) - Math.abs(before.r);
      if (contrast <= 0) continue;
      if (Math.abs(since.r) < o.minAbsR) continue;
      if (contrast < o.minContrast) continue;

      const pAdjusted = Math.min(1,
        correlationDifferenceP(since.r, since.n, before.r, before.n) * tests);
      if (pAdjusted > o.maxP) continue;
      // Sharpest split wins, not the earliest adequate one: a strong effect
      // still clears the bar on a candidate diluted by pre-onset noise, so
      // "first adequate" under-reports how recent the true onset is — measured
      // 60 days off on a seeded r≈1 effect. Scoring by the corrected p (which
      // already prices in both sample sizes) finds the true date instead.
      if (best && pAdjusted >= best.pAdjusted) continue;

      const positive = goalDir === "up" ? since.r > 0 : since.r < 0;
      best = {
        factor, lag, direction: positive ? "positive" : "negative",
        date: frame.from, frameIndex: frame.index,
        sinceDays: frame.days, beforeDays: frames[0].days - frame.days,
        since, before, pAdjusted, tests,
      };
    }
    if (best) results.push(best);

    onProgress?.(fi + 1, factors.length);
    if (Date.now() - chunkStart > 40) {
      await new Promise(resolve => setTimeout(resolve, 0));
      chunkStart = Date.now();
    }
  }

  return results.sort((a, b) => a.pAdjusted - b.pAdjusted);
}

// ── Across-the-run chart ──────────────────────────────────────────────────────

export interface GoalTrendPoint {
  index: number;
  from:  string;
  days:  number;
  positive: { factor: NetVar; r: number }[];
  negative: { factor: NetVar; r: number }[];
}

/**
 * Per-frame positive/negative factor counts for the "across the run" chart —
 * how the mix of goal-linked factors shifts as the window narrows from the
 * whole history down to the most recent stretch.
 */
export function goalTrendSeries(frames: GoalFrame[], goalDir: GoalDirection): GoalTrendPoint[] {
  return frames.map(f => {
    const positive: { factor: NetVar; r: number }[] = [];
    const negative: { factor: NetVar; r: number }[] = [];
    for (const e of f.edges) {
      const isPositive = goalDir === "up" ? e.r > 0 : e.r < 0;
      (isPositive ? positive : negative).push({ factor: e.factor, r: e.r });
    }
    return { index: f.index, from: f.from, days: f.days, positive, negative };
  });
}

// ── Trend: is a persistent link getting stronger or weaker? ──────────────────

/**
 * Simple centred moving average, skipping missing frames rather than treating
 * them as zero. This is the "low-pass filter" half of reading the r(t) series
 * as a signal: the raw trace is dominated by frame-to-frame sampling noise
 * (each frame is its own independent correlation, computed from a different-
 * sized slice of the record), and the smoothed trace is what a trend or a
 * regime boundary should be read against, not the raw wiggle.
 */
function smoothSeries(raw: (number | null)[], windowFrac = 0.08, minWindow = 3): (number | null)[] {
  const win = Math.max(minWindow, Math.round(raw.length * windowFrac));
  const half = Math.floor(win / 2);
  return raw.map((_, i) => {
    const lo = Math.max(0, i - half), hi = Math.min(raw.length - 1, i + half);
    let sum = 0, count = 0;
    for (let k = lo; k <= hi; k++) {
      const v = raw[k];
      if (v != null) { sum += v; count++; }
    }
    return count > 0 ? sum / count : null;
  });
}

export interface LinkTrend {
  factor: NetVar;
  direction: "strengthening" | "weakening" | "stable";
  /** Spearman correlation of r against frame position — the trend itself, not the link's own r. */
  trendR: number;
  trendP: number;
  n: number;
  /** r per frame, for the raw trace of the waveform chart. */
  raw: (number | null)[];
  /** Low-pass-filtered r per frame, for the waveform chart's trend trace. */
  smoothed: (number | null)[];
}

const TREND_MAX_P = 0.05;

/**
 * Whether each already-persistent link is getting stronger, weaker, or
 * holding steady — the question "is this link real" (`persistentGoalLinks`)
 * answered, but not "is it changing", which needs the whole frame sequence
 * read as a trajectory rather than compared at two endpoints.
 *
 * The trend itself is a Spearman correlation between frame position (0 =
 * widest/oldest-reaching window, last = narrowest/most-recent-only) and the
 * link's r in that frame — reusing the same rank-correlation machinery the
 * network itself is built on, just run one level up, on a correlation's own
 * trajectory instead of two raw variables. A positive trend means the link
 * reads stronger as the window narrows to recent-only data: the relationship
 * is trending toward the present, i.e. strengthening.
 */
/** A factor's raw and smoothed r trajectory across all frames, with no significance test — used to draw a waveform even for factors `linkTrends` isn't run on (e.g. emerged factors, tested separately by `emergedGoalLinks`). */
export function factorTrajectory(frames: GoalFrame[], factor: NetVar): { raw: (number | null)[]; smoothed: (number | null)[] } {
  const raw = frames.map(f => f.edges.find(e => e.factor === factor)?.r ?? null);
  return { raw, smoothed: smoothSeries(raw) };
}

export function linkTrends(frames: GoalFrame[], factors: NetVar[]): LinkTrend[] {
  if (frames.length < 8 || factors.length === 0) return [];
  const tests = factors.length;

  return factors.map(factor => {
    const raw = frames.map(f => f.edges.find(e => e.factor === factor)?.r ?? null);
    const xs: number[] = [], ys: number[] = [];
    raw.forEach((r, i) => { if (r != null) { xs.push(i); ys.push(r); } });
    const smoothed = smoothSeries(raw);

    if (xs.length < 8) return { factor, direction: "stable" as const, trendR: 0, trendP: 1, n: xs.length, raw, smoothed };

    const trendR = spearman(xs, ys);
    const trendP = Math.min(1, pValueForR(trendR, xs.length) * tests);
    const direction = trendP < TREND_MAX_P
      ? (trendR > 0 ? "strengthening" as const : "weakening" as const)
      : "stable" as const;
    return { factor, direction, trendR, trendP, n: xs.length, raw, smoothed };
  });
}

// ── Regimes: did an emerged link's "before" period itself have a turning point? ──

export interface RegimeSegment {
  from: string;
  to:   string;
  r:    number;
  n:    number;
  reliability: Reliability;
}

export interface RegimeOptions {
  minAbsR?: number;
  maxP?: number;
  minSide?: number;
  minPeriodDays?: number;
  minContrast?: number;
  maxCandidates?: number;
}

const REGIME_DEFAULTS = {
  // Looser than the primary emerged search: this only ever runs on factors
  // that already cleared that harder bar once, against a much smaller family.
  minAbsR:       0.25,
  maxP:          0.05,
  minSide:       RELIABILITY_THRESHOLDS.HIGH_PAIRS,
  minPeriodDays: 30,
  minContrast:   0.25,
  maxCandidates: 12,
} as const;

/** Candidate split dates spread evenly across [start,end], each leaving minPeriodDays on both sides. */
function dateCandidates(start: string, end: string, minPeriodDays: number, maxCandidates: number): string[] {
  const totalDays = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  const usable = totalDays - 2 * minPeriodDays;
  if (usable < 0) return [];
  const count = Math.min(maxCandidates, usable + 1);
  if (count <= 0) return [];
  const stride = count > 1 ? usable / (count - 1) : 0;
  const seen = new Set<string>();
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = format(addDays(parseISO(start), minPeriodDays + Math.round(i * stride)), "yyyy-MM-dd");
    if (!seen.has(d)) { seen.add(d); dates.push(d); }
  }
  return dates;
}

/**
 * Best two-sided split of [rangeStart, rangeEnd] — unlike the primary emerged
 * search, which side is stronger is not constrained, since this looks for any
 * regime change (including a fade, or a fade-then-return), not specifically
 * an onset.
 */
function findSplit(
  prep: PreparedSeries, factor: NetVar, goalVar: NetVar, lag: number,
  rangeStart: string, rangeEnd: string, tests: number,
  o: Required<RegimeOptions>,
): { date: string; left: PairCorrelation; right: PairCorrelation; pAdjusted: number } | null {
  const candidates = dateCandidates(rangeStart, rangeEnd, o.minPeriodDays, o.maxCandidates);
  let best: { date: string; left: PairCorrelation; right: PairCorrelation; pAdjusted: number } | null = null;
  for (const date of candidates) {
    const right = pairCorrelationIn(prep, factor, goalVar, lag, date, rangeEnd);
    const left  = pairCorrelationIn(prep, factor, goalVar, lag, rangeStart, format(subDays(parseISO(date), 1), "yyyy-MM-dd"));
    if (!left || !right) continue;
    if (left.n < o.minSide || right.n < o.minSide) continue;
    if (Math.abs(left.r) < o.minAbsR && Math.abs(right.r) < o.minAbsR) continue;
    if (Math.abs(Math.abs(right.r) - Math.abs(left.r)) < o.minContrast) continue;

    const pAdjusted = Math.min(1, correlationDifferenceP(right.r, right.n, left.r, left.n) * tests);
    if (pAdjusted > o.maxP) continue;
    if (best && pAdjusted >= best.pAdjusted) continue;
    best = { date, left, right, pAdjusted };
  }
  return best;
}

/**
 * Enriches each `emergedGoalLinks` result with a possible earlier regime: a
 * second, direction-agnostic split search within its "before" period. Most
 * factors stay two segments — a single onset, which is already what
 * `emergedGoalLinks` reports. Occasionally the older data itself contains a
 * detectable transition: a link that was moderate, went quiet, then
 * re-emerged, rather than a clean "on since one date" — that shows up as a
 * third segment instead.
 *
 * Runs only on the (typically small) set of factors `emergedGoalLinks` already
 * found, so its own Bonferroni correction answers for that much smaller
 * family rather than every network variable; the primary search and its own
 * correction are untouched.
 */
export async function regimeGoalLinks(
  recs: DailyStatsRecord[],
  emerged: EmergedGoalLink[],
  goalVar: NetVar,
  rangeStart: string,
  rangeEnd: string,
  opts: RegimeOptions = {},
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
): Promise<Map<NetVar, RegimeSegment[]>> {
  const o = { ...REGIME_DEFAULTS, ...opts };
  const out = new Map<NetVar, RegimeSegment[]>();
  if (emerged.length === 0) return out;

  const prep = prepareSeries(recs);
  if (!prep) return out;

  const tests = emerged.length * o.maxCandidates;
  let chunkStart = Date.now();

  for (let i = 0; i < emerged.length; i++) {
    if (shouldAbort?.()) break;
    const link = emerged[i];
    const beforeEnd = format(subDays(parseISO(link.date), 1), "yyyy-MM-dd");
    const sinceSeg: RegimeSegment = { from: link.date, to: rangeEnd, r: link.since.r, n: link.since.n, reliability: getReliability(link.since.n) };

    const split = findSplit(prep, link.factor, goalVar, link.lag, rangeStart, beforeEnd, tests, o);
    out.set(link.factor, split
      ? [
        { from: rangeStart, to: format(subDays(parseISO(split.date), 1), "yyyy-MM-dd"), r: split.left.r, n: split.left.n, reliability: getReliability(split.left.n) },
        { from: split.date, to: beforeEnd, r: split.right.r, n: split.right.n, reliability: getReliability(split.right.n) },
        sinceSeg,
      ]
      : [
        { from: rangeStart, to: beforeEnd, r: link.before.r, n: link.before.n, reliability: getReliability(link.before.n) },
        sinceSeg,
      ]);

    onProgress?.(i + 1, emerged.length);
    if (Date.now() - chunkStart > 40) {
      await new Promise(resolve => setTimeout(resolve, 0));
      chunkStart = Date.now();
    }
  }

  return out;
}
