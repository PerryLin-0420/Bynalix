/**
 * Relationship emergence: which pairwise correlations in the Patterns
 * network are new, not just present.
 *
 * The correlation network (`computeCorrelationNetwork`) answers "what's
 * related right now" over one fixed range. It cannot say whether a given
 * edge is a relationship that has always held — like weight and calories,
 * which move together for as long as anyone has logged both — or one that
 * only started holding partway through the record. Both look identical as
 * a single snapshot; only watching the same pair across a widening-to-
 * narrowing sequence of windows — the window end pinned to the latest
 * logged day, the start walking forward one step per frame — tells them
 * apart.
 *
 * This module builds that sequence for the *whole* network, then reports
 * only the pairs that are both:
 * - newly emerged: the correlation is reliably stronger since some date
 *   than it was before that date (a before/since split test, corrected for
 *   the search — see `emergedNetworkLinks`);
 * - not already persistent: a pair that holds up across the entire run,
 *   old data included, is excluded — that is the "long-term stable"
 *   category `persistentNetworkLinks` identifies, and it is a different
 *   story from "this just started".
 *
 * Emerged pairs are then grouped by hub variable — the node with the most
 * newly-emerged connections — so a card can show one variable's shifting
 * web of relationships as a small multi-line chart (r per window, one line
 * per neighbour) instead of a flat list.
 */

import { format, parseISO, subDays } from "date-fns";
import {
  computeCorrelationNetwork, correlationDifferenceP, pairCorrelationIn, prepareSeries,
  NET_VARS, type NetEdge, type NetVar, type PairCorrelation,
} from "./network";
import { RELIABILITY_THRESHOLDS, type Reliability } from "./pearson";
import type { DailyStatsRecord } from "@/types";

export const EMERGENCE_STEP_OPTIONS = [1, 2, 3, 7, 14] as const;

/**
 * Shortest window worth analysing. Below the network's own sample-size gate
 * no edge can qualify, so a shorter window is guaranteed to add nothing.
 * One extra day on top because differencing costs the first day of the window.
 */
export const WINDOW_MIN_DAYS = RELIABILITY_THRESHOLDS.LOW_PAIRS + 1; // 15

/**
 * Upper bound on frames a window sequence produces; the step widens
 * automatically rather than exceeding it (see `planWindows`).
 */
export const WINDOW_MAX_FRAMES = 365;

/**
 * Default ceiling on the total days analysed across a whole run when a
 * caller doesn't supply its own (see `planWindows`'s `workBudget` and
 * `workFor` below for what "total days analysed" means).
 */
const WINDOW_WORK_BUDGET = 60_000;

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
 * How many frames a shrinking-window configuration produces, and the step
 * needed to keep the build within budget. Pure, so a setup UI can show the
 * count — and any widening — before committing to a build. Shared by every
 * feature that scores a "widest history down to the tightest recent window"
 * sequence (currently just Patterns' relationship-emergence scan).
 */
export function planWindows(
  totalDays: number,
  stepDays: number,
  minWindow = WINDOW_MIN_DAYS,
  maxFrames = WINDOW_MAX_FRAMES,
  workBudget = WINDOW_WORK_BUDGET,
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
 * Shortest stretch the before/since split test will score on either side of a
 * candidate onset date. Sized so that a side at real logging density still
 * clears `minSide` differenced pairs: at ~70% density 45 days yields ~32,
 * just over the 30-pair floor. Below this a "split" is two samples too small
 * to disagree about anything.
 */
export const EMERGENCE_MIN_PERIOD_DAYS = 45;

/**
 * Shortest record on which a split test can be attempted at all: both sides
 * need `EMERGENCE_MIN_PERIOD_DAYS`, so a narrower record offers zero candidate
 * onset dates and the scan returns nothing no matter what the data says. That
 * is "nothing testable", not "nothing found" — a difference callers must show,
 * because the two read as opposite conclusions.
 */
export const EMERGENCE_MIN_DAYS = EMERGENCE_MIN_PERIOD_DAYS * 2;

/**
 * Lower than a goal-scored scan would need: a frame here re-runs the full
 * pairwise network (~90 pairs) instead of one variable against a fixed goal
 * (~13), so it costs roughly 7x as much per frame. This keeps a build's
 * wall-clock time in the same ballpark.
 */
export const EMERGENCE_WORK_BUDGET = 9_000;

// ── Frames ───────────────────────────────────────────────────────────────────

export interface NetworkFrame {
  index: number;
  from:  string;
  to:    string;
  days:  number;
  /** Every qualifying edge in the full pairwise network for this window. */
  edges: NetEdge[];
}

export interface NetworkTimelineOptions {
  startDate: string;
  endDate:   string;
  stepDays?:  number;
  minWindow?: number;
  maxFrames?: number;
  workBudget?: number;
}

export interface NetworkTimelineResult {
  frames: NetworkFrame[];
  effectiveStep: number;
  stepWidened: boolean;
}

/**
 * Build every frame of the full-network shrinking-window sequence: a chunked,
 * cancellable, oldest-window-first loop (see `planWindows`) that scores the
 * whole pairwise network per frame instead of one goal variable.
 */
export async function buildNetworkTimeline(
  recs: DailyStatsRecord[],
  opts: NetworkTimelineOptions,
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
): Promise<NetworkTimelineResult> {
  const minWindow = opts.minWindow ?? WINDOW_MIN_DAYS;
  const maxFrames = opts.maxFrames ?? WINDOW_MAX_FRAMES;
  const workBudget = opts.workBudget ?? EMERGENCE_WORK_BUDGET;

  const inRange = recs
    .filter(r => r.date >= opts.startDate && r.date <= opts.endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const { frameCount, effectiveStep, stepWidened } =
    planWindows(inRange.length, opts.stepDays ?? 1, minWindow, maxFrames, workBudget);
  if (frameCount <= 0) return { frames: [], effectiveStep, stepWidened };

  const frames: NetworkFrame[] = [];
  const to = inRange[inRange.length - 1].date;
  let chunkStart = Date.now();

  for (let i = 0; i < frameCount; i++) {
    if (shouldAbort?.()) break;
    const offset = i * effectiveStep;
    const window = inRange.slice(offset);
    const { edges } = computeCorrelationNetwork(window, window.length, { keepPairs: false });
    frames.push({ index: i, from: window[0].date, to, days: window.length, edges });

    onProgress?.(i + 1, frameCount);
    if (Date.now() - chunkStart > 40) {
      await new Promise(resolve => setTimeout(resolve, 0));
      chunkStart = Date.now();
    }
  }

  return { frames, effectiveStep, stepWidened };
}

// ── Pair tracking ──────────────────────────────────────────────────────────

/** Identity of a variable pair, independent of edge direction. */
function pairKey(a: NetVar, b: NetVar): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function keyToPair(key: string): [NetVar, NetVar] {
  const [a, b] = key.split("|") as [NetVar, NetVar];
  return [a, b];
}

interface PairTrack {
  key: string;
  a: NetVar;
  b: NetVar;
  /** r per frame; null where the pair did not qualify as an edge that frame. */
  rs: (number | null)[];
  presence: number;
}

function pairTracks(frames: NetworkFrame[]): PairTrack[] {
  if (!frames.length) return [];
  const tracks = new Map<string, PairTrack>();
  frames.forEach((f, i) => {
    for (const e of f.edges) {
      const key = pairKey(e.source, e.target);
      let track = tracks.get(key);
      if (!track) {
        const [a, b] = keyToPair(key);
        track = { key, a, b, rs: new Array(frames.length).fill(null), presence: 0 };
        tracks.set(key, track);
      }
      track.rs[i] = e.r;
    }
  });
  for (const track of tracks.values()) {
    track.presence = track.rs.filter(r => r != null).length / frames.length;
  }
  return [...tracks.values()];
}

/** The directed form (source/target/lag) a pair took most often across the frames it qualified in. */
function dominantForm(frames: NetworkFrame[], key: string): { source: NetVar; target: NetVar; lag: number } | null {
  const counts = new Map<string, { form: { source: NetVar; target: NetVar; lag: number }; n: number }>();
  for (const f of frames) {
    for (const e of f.edges) {
      if (pairKey(e.source, e.target) !== key) continue;
      const id = `${e.source}>${e.target}@${e.lag}`;
      const hit = counts.get(id);
      if (hit) hit.n++;
      else counts.set(id, { form: { source: e.source, target: e.target, lag: e.lag }, n: 1 });
    }
  }
  let best: { form: { source: NetVar; target: NetVar; lag: number }; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.form ?? null;
}

// ── Long-term (persistent) pairs ─────────────────────────────────────────────

export interface PersistentPairLink {
  key: string;
  a: NetVar;
  b: NetVar;
  lag: number;
  r: number;   // over the entire available history (frame 0's edge)
  n: number;
  p: number;
  presence: number;
  reliability: Reliability;
}

/**
 * Pairs whose correlation holds up no matter how the window is sized —
 * including the tightest, most recent slice: present using the entire
 * history (frame 0), present in most frames overall, and present in most of
 * the *recent* frames specifically (a floor separate from the overall one,
 * since the narrowest frames sit right at the sample-size minimum and one
 * noisy frame there should not flip the answer).
 */
export function persistentNetworkLinks(
  frames: NetworkFrame[],
  opts: { minPresence?: number; minRecentPresence?: number; recentDays?: number } = {},
): PersistentPairLink[] {
  const minPresence       = opts.minPresence       ?? 0.85;
  const minRecentPresence = opts.minRecentPresence ?? 0.7;
  const recentDays        = opts.recentDays        ?? RELIABILITY_THRESHOLDS.HIGH_PAIRS;
  if (frames.length === 0) return [];

  const first = frames[0];
  const recentBand = frames.filter(f => f.days <= recentDays);
  const recent = recentBand.length > 0 ? recentBand : [frames[frames.length - 1]];

  const out: PersistentPairLink[] = [];
  for (const edge of first.edges) {
    const key = pairKey(edge.source, edge.target);
    const overallHeld = frames.reduce((n, f) => n + (f.edges.some(e => pairKey(e.source, e.target) === key) ? 1 : 0), 0);
    const presence = overallHeld / frames.length;
    if (presence < minPresence) continue;

    const recentHeld = recent.reduce((n, f) => n + (f.edges.some(e => pairKey(e.source, e.target) === key) ? 1 : 0), 0);
    if (recentHeld / recent.length < minRecentPresence) continue;

    const [a, b] = keyToPair(key);
    out.push({
      key, a, b, lag: edge.lag,
      r: edge.r, n: edge.n, p: edge.p, presence,
      reliability: edge.reliability,
    });
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// ── Newly-emerged pairs ───────────────────────────────────────────────────────

export interface EmergedPairLink {
  key: string;
  a: NetVar;
  b: NetVar;
  lag: number;
  source: NetVar;
  target: NetVar;
  /** Holds from this date through to the pinned end; the split's onset. */
  date: string;
  frameIndex: number;
  sinceDays:  number;
  beforeDays: number;
  since:  PairCorrelation;
  before: PairCorrelation;
  pAdjusted: number;
  tests: number;
  /** r per frame across the whole run, for the trajectory line chart. */
  trajectory: (number | null)[];
}

export interface EmergenceOptions {
  minAbsR?: number;
  maxP?: number;
  minSide?: number;
  minPeriodDays?: number;
  minContrast?: number;
  maxCandidates?: number;
}

const EMERGENCE_DEFAULTS = {
  minAbsR:       0.3,
  // A search this wide (~90 candidate pairs) needs a strict bar: the nominal
  // Bonferroni bound under-covers here — real daily health data is not
  // perfectly i.i.d. (residual autocorrelation, derived rolling-window
  // variables), which biases the underlying Fisher z test slightly
  // anti-conservative in the tail. Tightened until repeated runs on
  // pure-noise records kept a false "emerged" finding to roughly one run in
  // twenty, down from one in three at the network's usual 0.03 edge bar.
  maxP:          0.0001,
  minSide:       RELIABILITY_THRESHOLDS.HIGH_PAIRS,
  minPeriodDays: EMERGENCE_MIN_PERIOD_DAYS,
  minContrast:   0.25,
  // ~90 candidate pairs means candidates per pair are trimmed to keep the
  // correction from erasing every moderate-strength effect, rather than
  // trying every frame the way a single-variable scan could afford to.
  maxCandidates: 12,
} as const;

/** Split dates to try: frame starts that leave a real period on both sides. */
function splitCandidates(frames: NetworkFrame[], minPeriodDays: number, maxCandidates: number): NetworkFrame[] {
  const total = frames[0]?.days ?? 0;
  const usable = frames.filter(f => f.days >= minPeriodDays && total - f.days >= minPeriodDays);
  if (usable.length <= maxCandidates) return usable;
  const stride = usable.length / maxCandidates;
  return Array.from({ length: maxCandidates }, (_, i) => usable[Math.floor(i * stride)]);
}

/**
 * How many candidate onset dates a built frame sequence actually offers.
 *
 * Zero means `emergedNetworkLinks` never ran a single test on these frames —
 * the record is too short (or too gappy) for both sides of any split to reach
 * `EMERGENCE_MIN_PERIOD_DAYS`. Reporting that as "no relationship changed"
 * would be a finding the scan never made.
 */
export function splitCandidateCount(
  frames: NetworkFrame[],
  minPeriodDays = EMERGENCE_MIN_PERIOD_DAYS,
): number {
  return splitCandidates(frames, minPeriodDays, Number.MAX_SAFE_INTEGER).length;
}

/**
 * Every pair in the network whose correlation turned on partway through the
 * record and still holds as of the latest data — excluding pairs already
 * reported as long-term (`persistentNetworkLinks`), since those do not need a
 * turning point.
 *
 * For each pair, the correlation on everything since a candidate date is
 * tested against everything before it (Fisher's r-to-z on the difference),
 * and the date where they disagree most sharply — with "since" the stronger
 * side — is kept. p is Bonferroni-corrected against every pair/date
 * combination tried.
 */
export async function emergedNetworkLinks(
  recs: DailyStatsRecord[],
  frames: NetworkFrame[],
  opts: EmergenceOptions = {},
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
): Promise<EmergedPairLink[]> {
  const o = { ...EMERGENCE_DEFAULTS, ...opts };
  if (frames.length < 3) return [];

  const prep = prepareSeries(recs);
  if (!prep) return [];

  const rangeStart = frames[0].from;
  const rangeEnd   = frames[0].to;
  const candidates = splitCandidates(frames, o.minPeriodDays, o.maxCandidates);
  const tracks = pairTracks(frames);
  if (candidates.length === 0 || tracks.length === 0) return [];

  const persistent = new Set(persistentNetworkLinks(frames).map(l => l.key));
  const pairs = tracks.filter(t => !persistent.has(t.key));

  const tests = pairs.length * candidates.length;
  const results: EmergedPairLink[] = [];
  let chunkStart = Date.now();

  for (let ti = 0; ti < pairs.length; ti++) {
    if (shouldAbort?.()) break;
    const track = pairs[ti];
    const form = dominantForm(frames, track.key);
    if (!form) { onProgress?.(ti + 1, pairs.length); continue; }

    let best: EmergedPairLink | null = null;
    for (const frame of candidates) {
      const since  = pairCorrelationIn(prep, form.source, form.target, form.lag, frame.from, rangeEnd);
      const before = pairCorrelationIn(prep, form.source, form.target, form.lag,
        rangeStart, format(subDays(parseISO(frame.from), 1), "yyyy-MM-dd"));
      if (!since || !before) continue;
      if (since.n < o.minSide || before.n < o.minSide) continue;

      const contrast = Math.abs(since.r) - Math.abs(before.r);
      if (contrast <= 0) continue;
      if (Math.abs(since.r) < o.minAbsR) continue;
      if (contrast < o.minContrast) continue;

      const pAdjusted = Math.min(1,
        correlationDifferenceP(since.r, since.n, before.r, before.n) * tests);
      if (pAdjusted > o.maxP) continue;
      if (best && pAdjusted >= best.pAdjusted) continue; // sharpest split wins

      best = {
        key: track.key, a: track.a, b: track.b, lag: form.lag,
        source: form.source, target: form.target,
        date: frame.from, frameIndex: frame.index,
        sinceDays: frame.days, beforeDays: frames[0].days - frame.days,
        since, before, pAdjusted, tests,
        trajectory: track.rs,
      };
    }
    if (best) results.push(best);

    onProgress?.(ti + 1, pairs.length);
    if (Date.now() - chunkStart > 40) {
      await new Promise(resolve => setTimeout(resolve, 0));
      chunkStart = Date.now();
    }
  }

  return results.sort((a, b) => a.pAdjusted - b.pAdjusted);
}

// ── Grouping into hub cards ───────────────────────────────────────────────────

export interface EmergenceCard {
  hub: NetVar;
  links: EmergedPairLink[];
}

/**
 * Group newly-emerged pairs by hub variable — the node with the most
 * emerged connections — so each card tells one variable's story: "since
 * roughly this point, it started moving with these other things too."
 *
 * A variable below `minDegree` connections doesn't get a card of its own: one
 * new relationship is a single-row fact (already visible as a plain entry),
 * not a pattern worth a multi-line chart. A pair can appear on two cards (once
 * per side) when both ends independently qualify as hubs — that overlap is
 * meaningful, not a bug: it says the same shift touched both variables' wider
 * web of relationships, not just this one link between them.
 */
export function groupEmergedByHub(links: EmergedPairLink[], minDegree = 2): EmergenceCard[] {
  const byNode = new Map<NetVar, EmergedPairLink[]>();
  for (const link of links) {
    for (const node of [link.a, link.b] as const) {
      const arr = byNode.get(node);
      if (arr) arr.push(link); else byNode.set(node, [link]);
    }
  }
  return [...byNode.entries()]
    .filter(([, ls]) => ls.length >= minDegree)
    .map(([hub, ls]) => ({
      hub,
      links: [...ls].sort((a, b) => Math.abs(b.since.r) - Math.abs(a.since.r)),
    }))
    .sort((a, b) => b.links.length - a.links.length || Math.abs(b.links[0].since.r) - Math.abs(a.links[0].since.r));
}

export { NET_VARS };
