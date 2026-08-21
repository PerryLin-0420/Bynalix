/**
 * Timeline slideshow: the correlation network as a function of how far back
 * the analysis window reaches.
 *
 * The end of the window is pinned (usually "today"), and the start walks
 * forward one step at a time: [A, end], [A+step, end], [A+2·step, end] …
 * Each window is a full re-run of `computeCorrelationNetwork`, so playing the
 * frames in order shows which relationships only exist because of old data,
 * which ones survive as the window tightens onto recent behaviour, and which
 * only emerge once the distant past drops out.
 *
 * Frames are always built oldest-window-first so frame 0 is the widest view
 * and the last frame is the tightest. Every frame carries its delta against
 * the frame before it, so the player can name what changed without recomputing.
 */

import { computeCorrelationNetwork, type CorrelationNetwork, type NetEdge, type NetVar } from "./network";
import { RELIABILITY_THRESHOLDS } from "./pearson";
import type { DailyStatsRecord } from "@/types";

/**
 * Shortest window worth drawing. Below the network's own sample-size gate no
 * edge can qualify, so a shorter window is guaranteed to render an empty ring.
 * One extra day on top because differencing costs the first day of the window.
 */
export const TIMELINE_MIN_WINDOW = RELIABILITY_THRESHOLDS.LOW_PAIRS + 1; // 15

/**
 * Upper bound on frames; the step widens automatically rather than exceeding it.
 * A year of daily frames is the point where the build stops feeling responsive
 * even with the chunked loop, and where consecutive frames stop looking
 * different from one another.
 */
export const TIMELINE_MAX_FRAMES = 365;

/**
 * Ceiling on the total days analysed across a whole run (see `workFor`).
 * Sized so a year of history at a one-day step still builds, while a multi-year
 * history widens its step instead of running for minutes.
 */
export const TIMELINE_WORK_BUDGET = 25_000;

export const TIMELINE_STEP_OPTIONS = [1, 2, 3, 7, 14] as const;

/** Playback duration presets, in seconds for the whole run. */
export const TIMELINE_DURATION_OPTIONS = [5, 10, 20, 40] as const;

// ── Frame types ──────────────────────────────────────────────────────────────

export interface FrameStats {
  edgeCount:   number;
  /** Mean |r| across the frame's edges; 0 when there are none. */
  meanAbsR:    number;
  strongCount: number;  // |r| ≥ 0.5
  posCount:    number;
  negCount:    number;
  laggedCount: number;
  /** Variables carrying at least one edge. */
  linkedNodes: number;
}

export interface EdgeChange {
  key:      string;
  edge:     NetEdge;
  prevR:    number;
  deltaR:   number;
  /** The correlation changed sign between the two frames. */
  flipped:  boolean;
  prevLag:  number;
  /** Same pair, but the lead/lag reading changed. */
  lagShift: boolean;
}

export interface FrameDelta {
  appeared:  NetEdge[];
  vanished:  NetEdge[];
  /** Edges present in both frames, strongest absolute move first. */
  moved:     EdgeChange[];
  edgeCountDelta: number;
  meanAbsRDelta:  number;
  /** appeared + vanished — how much of the graph was rewritten this step. */
  churn:     number;
}

export interface TimelineFrame {
  index:   number;
  from:    string;
  to:      string;
  days:    number;
  network: CorrelationNetwork;
  stats:   FrameStats;
  /** Change against the previous frame; null on frame 0. */
  delta:   FrameDelta | null;
}

export interface TimelineOptions {
  /** Window start of the first (widest) frame. */
  startDate:  string;
  /** Pinned window end, shared by every frame. */
  endDate:    string;
  /** Days the start advances per frame; widened if the frame count would overflow. */
  stepDays?:  number;
  minWindow?: number;
  maxFrames?: number;
}

export interface TimelineResult {
  frames: TimelineFrame[];
  /** The step actually used — larger than requested when frames were capped. */
  effectiveStep: number;
  /** True when `effectiveStep` had to exceed the requested step. */
  stepWidened: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Identity of a variable pair, independent of edge direction: a lagged edge can
 * point either way and still be the same relationship. Direction changes are
 * reported as `lagShift` on a surviving edge rather than as a remove + add.
 */
export function edgeKey(e: { source: NetVar; target: NetVar }): string {
  return e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
}

function frameStats(net: CorrelationNetwork): FrameStats {
  const { edges } = net;
  const linked = new Set<NetVar>();
  let sumAbs = 0, strong = 0, pos = 0, neg = 0, lagged = 0;
  for (const e of edges) {
    sumAbs += Math.abs(e.r);
    if (Math.abs(e.r) >= 0.5) strong++;
    if (e.r >= 0) pos++; else neg++;
    if (e.lag > 0) lagged++;
    linked.add(e.source); linked.add(e.target);
  }
  return {
    edgeCount:   edges.length,
    meanAbsR:    edges.length ? sumAbs / edges.length : 0,
    strongCount: strong,
    posCount:    pos,
    negCount:    neg,
    laggedCount: lagged,
    linkedNodes: linked.size,
  };
}

/** Difference two frames' networks, keyed on the variable pair. */
export function diffNetworks(
  prev: CorrelationNetwork, prevStats: FrameStats,
  next: CorrelationNetwork, nextStats: FrameStats,
): FrameDelta {
  const prevMap = new Map(prev.edges.map(e => [edgeKey(e), e] as const));
  const nextMap = new Map(next.edges.map(e => [edgeKey(e), e] as const));

  const appeared: NetEdge[] = [];
  const moved: EdgeChange[] = [];
  for (const [key, e] of nextMap) {
    const before = prevMap.get(key);
    if (!before) { appeared.push(e); continue; }
    moved.push({
      key, edge: e,
      prevR:    before.r,
      deltaR:   e.r - before.r,
      flipped:  Math.sign(e.r) !== Math.sign(before.r),
      prevLag:  before.lag,
      lagShift: before.lag !== e.lag || before.source !== e.source,
    });
  }
  const vanished = [...prevMap].filter(([key]) => !nextMap.has(key)).map(([, e]) => e);

  moved.sort((a, b) => Math.abs(b.deltaR) - Math.abs(a.deltaR));

  return {
    appeared, vanished, moved,
    edgeCountDelta: nextStats.edgeCount - prevStats.edgeCount,
    meanAbsRDelta:  nextStats.meanAbsR  - prevStats.meanAbsR,
    churn:          appeared.length + vanished.length,
  };
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
 * of each one. Summing the windows is what keeps a two-year history from
 * quietly turning into a build an order of magnitude longer than a one-year one.
 */
function workFor(totalDays: number, span: number, step: number): number {
  const frames = frameCountFor(span, step);
  return frames * totalDays - step * (frames * (frames - 1)) / 2;
}

/**
 * How many frames a configuration produces, and the step needed to keep the
 * build within budget. Pure, so the setup UI can show the count — and any
 * widening — before committing to a build that takes seconds.
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

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Build every frame of the slideshow from one contiguous run of daily records.
 *
 * `recs` must cover [startDate, endDate] with one entry per day (which is what
 * `getDailyStatsRecords` returns), so a frame's window is a plain suffix of the
 * array and no re-querying is needed.
 *
 * Each frame is a fresh network computation, which is the expensive part; the
 * loop hands control back to the browser between chunks so the progress bar
 * paints and the cancel button stays responsive. `shouldAbort` is polled at the
 * same points — an aborted build resolves with the frames completed so far.
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

  const frames: TimelineFrame[] = [];
  const to = inRange[inRange.length - 1].date;
  let chunkStart = Date.now();

  for (let i = 0; i < frameCount; i++) {
    if (shouldAbort?.()) break;
    const offset = i * effectiveStep;
    const window = inRange.slice(offset);
    // The scatter payload is per-edge and never opened from the slideshow, so
    // it is skipped: over a hundred frames it would dominate the memory use.
    const network = computeCorrelationNetwork(window, window.length, { keepPairs: false });
    const stats   = frameStats(network);
    const prev    = frames[i - 1];
    frames.push({
      index: i,
      from:  window[0].date,
      to,
      days:  window.length,
      network,
      stats,
      delta: prev ? diffNetworks(prev.network, prev.stats, network, stats) : null,
    });

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

// ── Cross-frame series ───────────────────────────────────────────────────────

export interface TimelineSeriesPoint {
  index:     number;
  from:      string;
  days:      number;
  edgeCount: number;
  meanAbsR:  number;
  churn:     number;
}

/** Per-frame summary series for the trend chart under the player. */
export function timelineSeries(frames: TimelineFrame[]): TimelineSeriesPoint[] {
  return frames.map(f => ({
    index:     f.index,
    from:      f.from,
    days:      f.days,
    edgeCount: f.stats.edgeCount,
    meanAbsR:  Math.round(f.stats.meanAbsR * 1000) / 1000,
    churn:     f.delta?.churn ?? 0,
  }));
}

export interface EdgeTrack {
  key:      string;
  source:   NetVar;
  target:   NetVar;
  /** r per frame; null where the pair did not qualify in that frame. */
  rs:       (number | null)[];
  /** Fraction of frames the pair held an edge in, 0–1. */
  presence: number;
  /** Mean r over the frames where it existed. */
  meanR:    number;
}

/**
 * One row per variable pair that qualified in at least one frame, tracking its
 * r across the whole timeline. A pair present in every frame is a relationship
 * that does not depend on where the window starts; a pair present in only the
 * early (widest) frames lived in the old data.
 *
 * Sorted by presence, then by strength, so the most durable links come first.
 */
export function edgeTracks(frames: TimelineFrame[]): EdgeTrack[] {
  if (!frames.length) return [];
  const tracks = new Map<string, EdgeTrack>();
  frames.forEach((f, i) => {
    for (const e of f.network.edges) {
      const key = edgeKey(e);
      let track = tracks.get(key);
      if (!track) {
        const [source, target] = key.split("|") as [NetVar, NetVar];
        track = { key, source, target, rs: new Array(frames.length).fill(null), presence: 0, meanR: 0 };
        tracks.set(key, track);
      }
      track.rs[i] = e.r;
    }
  });
  for (const track of tracks.values()) {
    const seen = track.rs.filter((r): r is number => r != null);
    track.presence = seen.length / frames.length;
    track.meanR    = seen.reduce((s, r) => s + r, 0) / seen.length;
  }
  return [...tracks.values()].sort((a, b) =>
    b.presence - a.presence || Math.abs(b.meanR) - Math.abs(a.meanR));
}
