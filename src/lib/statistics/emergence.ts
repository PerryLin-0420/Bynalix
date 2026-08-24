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
 * narrowing sequence of windows (the same "shrinking window" idea the
 * Timeline tab uses, but scored against every pair here, not one goal
 * variable) tells them apart.
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
import { planTimeline, TIMELINE_MIN_WINDOW, TIMELINE_MAX_FRAMES } from "./timeline";
import type { DailyStatsRecord } from "@/types";

export { TIMELINE_MIN_WINDOW, TIMELINE_MAX_FRAMES, planTimeline };
export const EMERGENCE_STEP_OPTIONS = [1, 2, 3, 7, 14] as const;

/**
 * Lower than the Timeline tab's budget: a frame here re-runs the full
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
 * Build every frame of the full-network shrinking-window sequence. Mirrors
 * `buildTimeline` in timeline.ts — same chunked, cancellable, oldest-window-
 * first loop — but scores the whole pairwise network per frame instead of one
 * goal variable.
 */
export async function buildNetworkTimeline(
  recs: DailyStatsRecord[],
  opts: NetworkTimelineOptions,
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
): Promise<NetworkTimelineResult> {
  const minWindow = opts.minWindow ?? TIMELINE_MIN_WINDOW;
  const maxFrames = opts.maxFrames ?? TIMELINE_MAX_FRAMES;
  const workBudget = opts.workBudget ?? EMERGENCE_WORK_BUDGET;

  const inRange = recs
    .filter(r => r.date >= opts.startDate && r.date <= opts.endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const { frameCount, effectiveStep, stepWidened } =
    planTimeline(inRange.length, opts.stepDays ?? 1, minWindow, maxFrames, workBudget);
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
 * including the tightest, most recent slice. Same method as the Timeline
 * tab's `persistentGoalLinks`, generalised from "vs one goal variable" to
 * "every pair in the network": present using the entire history (frame 0),
 * present in most frames overall, and present in most of the *recent* frames
 * specifically (a floor separate from the overall one, since the narrowest
 * frames sit right at the sample-size minimum and one noisy frame there
 * should not flip the answer).
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
  // Stricter than the Timeline goal-only scan's 0.03: this searches ~7x as
  // many pairs (~90 vs ~13), and empirically the nominal Bonferroni bound
  // under-covers here — real daily health data is not perfectly i.i.d.
  // (residual autocorrelation, derived rolling-window variables), which
  // biases the underlying Fisher z test slightly anti-conservative in the
  // tail. Tightened until repeated runs on pure-noise records kept a false
  // "emerged" finding to roughly one run in twenty, down from one in three.
  maxP:          0.0001,
  minSide:       RELIABILITY_THRESHOLDS.HIGH_PAIRS,
  minPeriodDays: 45,
  minContrast:   0.25,
  // A full-network search has ~90 candidate pairs instead of the Timeline
  // goal-only scan's ~13, so candidates per pair are trimmed further to keep
  // the correction from erasing every moderate-strength effect — same
  // trade-off `emergedGoalLinks` makes, just tuned for a bigger family.
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
 * Every pair in the network whose correlation turned on partway through the
 * record and still holds as of the latest data — excluding pairs already
 * reported as long-term (`persistentNetworkLinks`), since those do not need a
 * turning point.
 *
 * Same before/since split-test method as the Timeline tab's
 * `emergedGoalLinks`, generalised to run over every pair instead of one goal
 * variable: for each pair, the correlation on everything since a candidate
 * date is tested against everything before it (Fisher's r-to-z on the
 * difference), and the date where they disagree most sharply — with "since"
 * the stronger side — is kept. p is Bonferroni-corrected against every
 * pair/date combination tried.
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
