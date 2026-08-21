import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { format, parseISO, differenceInCalendarDays, addDays } from "date-fns";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, CalendarDays, Film, X,
} from "lucide-react";
import { clsx } from "clsx";
import { CorrelationNetwork, unionRingOrder } from "./CorrelationNetwork";
import { MiniCalendar } from "@/components/common/MiniCalendar";
import { CardHeader } from "@/components/common/CardHeader";
import { NET_VARS, type NetEdge, type NetVar } from "@/lib/statistics/network";
import {
  buildTimeline, diffNetworks, planTimeline, timelineSeries, edgeTracks,
  TIMELINE_MIN_WINDOW, TIMELINE_STEP_OPTIONS, TIMELINE_DURATION_OPTIONS,
  type TimelineFrame, type EdgeTrack,
} from "@/lib/statistics/timeline";
import { getDailyStatsRecords, getDataDateBounds } from "@/lib/db/queries/stats";
import { logError } from "@/lib/error";

const POS_COLOR = "#10b981";
const NEG_COLOR = "#f43f5e";

/** Slowest sensible frame interval, so a long timeline never crawls. */
const MIN_FRAME_MS = 50;

/** Gained/lost links listed per frame before the rest are summarised as a count. */
const MAX_CHANGE_ROWS = 4;

// ── Small shared bits ────────────────────────────────────────────────────────

function SegButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={clsx("px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
      {children}
    </button>
  );
}

/** A signed number with the sign always shown, coloured by direction. */
function Delta({ value, digits = 0, goodUp = true }: {
  value: number; digits?: number; goodUp?: boolean;
}) {
  if (Math.abs(value) < (digits ? 10 ** -digits / 2 : 0.5)) {
    return <span className="text-10 text-gray-400">±0</span>;
  }
  const up = value > 0;
  return (
    <span className={clsx("text-10 font-mono font-bold",
      up === goodUp ? "text-emerald-600" : "text-rose-500")}>
      {up ? "+" : "−"}{Math.abs(value).toFixed(digits)}
    </span>
  );
}

function StatTile({ label, value, delta }: {
  label: string; value: string; delta?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-container-low)] px-2.5 py-2">
      <p className="text-9 text-[var(--text-on-surface-muted)] leading-none">{label}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-sm font-bold text-[var(--text-on-surface)] leading-none">{value}</span>
        {delta}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  userId: number;
  lang: string;
}

/**
 * The correlation network as a slideshow over window length.
 *
 * The window end is pinned to the last day that carries data; the start walks
 * forward one step per frame, so playing the frames back shows the graph the
 * data supports at every window from "everything ever logged" down to the most
 * recent couple of weeks. What survives to the end of the run is a relationship
 * that holds in current behaviour; what fades out early only ever lived in the
 * old data.
 */
export function TimelineSlideshow({ userId, lang }: Props) {
  const zh = lang === "zh";

  // ── Setup state ───────────────────────────────────────────────────────────
  const [bounds, setBounds]         = useState<{ first: string; last: string } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [startDate, setStartDate]   = useState<string | null>(null);
  const [showCal, setShowCal]       = useState(false);
  const [stepDays, setStepDays]     = useState<number>(1);
  const [durationSec, setDuration]  = useState<number>(10);

  // ── Build state ───────────────────────────────────────────────────────────
  const [frames, setFrames]       = useState<TimelineFrame[]>([]);
  const [ringOrder, setRingOrder] = useState<NetVar[]>([]);
  const [built, setBuilt]         = useState<{ start: string; end: string; step: number; widened: boolean } | null>(null);
  const [building, setBuilding]   = useState(false);
  const [progress, setProgress]   = useState({ done: 0, total: 0 });
  const abortRef = useRef(false);

  // ── Playback state ────────────────────────────────────────────────────────
  const [idx, setIdx]         = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop]       = useState(true);

  // ── Load the data bounds once ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await getDataDateBounds(userId);
        if (cancelled) return;
        setBounds(b);
        if (b) setStartDate(b.first);
      } catch (e) { logError("Timeline.loadBounds", e); }
      if (!cancelled) setMetaLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /**
   * Days the picker offers as a start: anywhere in the record that still leaves
   * a analysable window behind it. Beyond that a frame could never produce an
   * edge, so those days are simply not selectable.
   */
  const selectableDates = useMemo(() => {
    const out = new Set<string>();
    if (!bounds) return out;
    const last  = parseISO(bounds.last);
    const limit = differenceInCalendarDays(last, parseISO(bounds.first)) - (TIMELINE_MIN_WINDOW - 1);
    for (let k = 0; k <= limit; k++) out.add(format(addDays(parseISO(bounds.first), k), "yyyy-MM-dd"));
    return out;
  }, [bounds]);

  const totalDays = bounds && startDate
    ? differenceInCalendarDays(parseISO(bounds.last), parseISO(startDate)) + 1
    : 0;
  const plan = useMemo(
    () => planTimeline(totalDays, stepDays),
    [totalDays, stepDays]);

  /** The displayed run no longer matches what the setup card is configured for. */
  const stale = built != null && (
    built.start !== startDate ||
    built.end   !== bounds?.last ||
    built.step  !== plan.effectiveStep);

  const frameMs = frames.length
    ? Math.max(MIN_FRAME_MS, Math.round((durationSec * 1000) / frames.length))
    : 0;

  // ── Build ─────────────────────────────────────────────────────────────────
  const handleBuild = async () => {
    if (!bounds || !startDate || plan.frameCount <= 0) return;
    abortRef.current = false;
    setBuilding(true);
    setPlaying(false);
    setProgress({ done: 0, total: plan.frameCount });
    try {
      const recs = await getDailyStatsRecords(userId, 0, startDate, bounds.last);
      const res  = await buildTimeline(
        recs,
        { startDate, endDate: bounds.last, stepDays },
        (done, total) => setProgress({ done, total }),
        () => abortRef.current,
      );
      if (res.frames.length) {
        setFrames(res.frames);
        // One layout for the whole run: see `unionRingOrder`.
        setRingOrder(unionRingOrder(res.frames.map(f => f.network)));
        setBuilt({ start: startDate, end: bounds.last, step: res.effectiveStep, widened: res.stepWidened });
        setIdx(0);
      }
    } catch (e) { logError("Timeline.build", e); }
    setBuilding(false);
  };

  const cancelBuild = () => { abortRef.current = true; };

  // ── Playback ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => {
      setIdx(prev => {
        if (prev + 1 < frames.length) return prev + 1;
        return loop ? 0 : prev;
      });
    }, frameMs);
    return () => clearInterval(id);
  }, [playing, frames.length, frameMs, loop]);

  // Stop at the end when not looping. Kept out of the interval's state updater,
  // which React may run more than once per tick.
  useEffect(() => {
    if (playing && !loop && frames.length > 0 && idx >= frames.length - 1) setPlaying(false);
  }, [playing, loop, idx, frames.length]);

  const togglePlay = () => {
    if (!playing && !loop && idx >= frames.length - 1) setIdx(0);
    setPlaying(p => !p);
  };

  // ── Derived views ─────────────────────────────────────────────────────────
  const frame  = frames[idx] ?? null;
  const series = useMemo(() => timelineSeries(frames), [frames]);
  const tracks = useMemo(() => edgeTracks(frames), [frames]);

  /** Cumulative change: current frame measured against the widest one. */
  const vsFirst = useMemo(() => {
    if (frames.length < 2 || idx === 0) return null;
    const a = frames[0], b = frames[idx];
    return diffNetworks(a.network, a.stats, b.network, b.stats);
  }, [frames, idx]);

  /**
   * A high-churn frame can gain a dozen links at once. Listing them all would
   * change the card's height frame by frame, and a card that resizes under the
   * playhead makes the whole page jump mid-playback.
   */
  const hiddenChanges = frame?.delta
    ? Math.max(0, frame.delta.appeared.length - MAX_CHANGE_ROWS)
      + Math.max(0, frame.delta.vanished.length - MAX_CHANGE_ROWS)
    : 0;

  const varLabel  = (v: NetVar) => zh ? NET_VARS[v].labelZh : NET_VARS[v].labelEn;
  const edgeLabel = (e: NetEdge) => e.lag > 0
    ? `${varLabel(e.source)} →${e.lag}d ${varLabel(e.target)}`
    : `${varLabel(e.source)} ↔ ${varLabel(e.target)}`;
  const dayStr = (n: number) => zh ? `${n} 天` : `${n}d`;
  const md     = (d: string) => format(parseISO(d), "M/d");

  /**
   * Presence strips. Rebuilt only when the frames change — the playhead is an
   * overlay so scrubbing never re-renders a few thousand <rect>s.
   */
  const trackRows = useMemo(() => tracks.slice(0, 8).map((track: EdgeTrack) => ({
    track,
    rects: track.rs.map((r, i) => r == null ? null : (
      <rect key={i} x={i} y={0} width={1} height={10}
        fill={r >= 0 ? POS_COLOR : NEG_COLOR}
        opacity={0.35 + Math.min(Math.abs(r), 1) * 0.65} />
    )),
  })), [tracks]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (metaLoading) {
    return (
      <div className="card text-center py-10">
        <p className="text-sm text-[var(--text-on-surface-muted)]">{zh ? "載入中…" : "Loading…"}</p>
      </div>
    );
  }

  if (!bounds || selectableDates.size === 0) {
    return (
      <div className="card text-center py-10">
        <p className="text-sm text-[var(--text-on-surface-muted)]">
          {zh
            ? `記錄天數還不夠：時間線至少需要 ${TIMELINE_MIN_WINDOW} 天的區間`
            : `Not enough history: the timeline needs a window of at least ${TIMELINE_MIN_WINDOW} days`}
        </p>
        <p className="text-10 text-[var(--text-on-surface-muted)] mt-1">
          {zh ? "持續記錄以解鎖" : "Keep logging to unlock"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-form">

      {/* ── Setup ──────────────────────────────────────────────────────── */}
      <div className="card">
        <CardHeader mb="mb-3"
          title={<span className="flex items-center gap-micro.5">
            <Film size={14} className="text-[var(--text-accent)]" />
            {zh ? "時間線設定" : "Timeline setup"}
          </span>} />

        <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
          {zh
            ? "終點固定在最新一筆資料，起點逐步往前推：先看長區間的關係圖，再一張張縮短，看看哪些關聯撐得住。"
            : "The window end is pinned to your latest data and the start walks forward: the widest range first, then one shorter window per frame, so you can see which links hold up."}
        </p>

        {/* Range row */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setShowCal(v => !v)}
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--surface-container-low)] border border-[var(--surface-border)] text-left">
            <CalendarDays size={14} className="text-[var(--text-accent)] shrink-0" />
            <span className="min-w-0">
              <span className="block text-9 text-[var(--text-on-surface-muted)] leading-none">
                {zh ? "起點 A" : "Start A"}
              </span>
              <span className="block text-sm font-semibold text-[var(--text-on-surface)] leading-tight mt-0.5">
                {startDate ? format(parseISO(startDate), "yyyy/M/d") : "—"}
              </span>
            </span>
          </button>
          <span className="text-[var(--text-on-surface-muted)] text-sm">→</span>
          <div className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--surface-container-low)] border border-[var(--surface-border)]">
            <span className="block text-9 text-[var(--text-on-surface-muted)] leading-none">
              {zh ? "終點（最新資料）" : "End (latest data)"}
            </span>
            <span className="block text-sm font-semibold text-[var(--text-on-surface)] leading-tight mt-0.5">
              {format(parseISO(bounds.last), "yyyy/M/d")}
            </span>
          </div>
        </div>

        {showCal && (
          <div className="mb-3">
            <MiniCalendar
              activeDates={selectableDates}
              mode="single"
              selectedDate={startDate}
              onSelectDate={d => { setStartDate(d); setShowCal(false); }}
            />
            <p className="text-10 text-[var(--text-on-surface-muted)] mt-1.5">
              {zh
                ? `可選 ${md(bounds.first)} – ${md([...selectableDates].sort().slice(-1)[0])}：更晚的起點會讓區間短於 ${TIMELINE_MIN_WINDOW} 天，統計上無法成立`
                : `Selectable ${md(bounds.first)} – ${md([...selectableDates].sort().slice(-1)[0])}: a later start leaves a window under ${TIMELINE_MIN_WINDOW} days, which no statistic can carry`}
            </p>
          </div>
        )}

        {/* Step */}
        <p className="text-10 font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          {zh ? "每張間隔" : "Step per frame"}
        </p>
        <div className="flex gap-micro.5 flex-wrap mb-3">
          {TIMELINE_STEP_OPTIONS.map(s => (
            <SegButton key={s} active={stepDays === s} onClick={() => setStepDays(s)}>
              {zh ? `${s} 天` : `${s}d`}
            </SegButton>
          ))}
        </div>

        {/* Duration */}
        <p className="text-10 font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          {zh ? "播放長度" : "Playback length"}
        </p>
        <div className="flex gap-micro.5 flex-wrap mb-3">
          {TIMELINE_DURATION_OPTIONS.map(d => (
            <SegButton key={d} active={durationSec === d} onClick={() => setDuration(d)}>
              {zh ? `${d} 秒` : `${d}s`}
            </SegButton>
          ))}
        </div>

        {/* Plan summary */}
        <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
          {zh
            ? `區間 ${dayStr(totalDays)} · 共 ${plan.frameCount} 張 · 每張約 ${Math.max(MIN_FRAME_MS, Math.round(durationSec * 1000 / Math.max(1, plan.frameCount)))} ms`
            : `${dayStr(totalDays)} range · ${plan.frameCount} frames · ~${Math.max(MIN_FRAME_MS, Math.round(durationSec * 1000 / Math.max(1, plan.frameCount)))} ms each`}
          {plan.stepWidened && (
            <span className="text-amber-600">
              {zh
                ? ` · 區間偏長，間隔自動放寬為 ${plan.effectiveStep} 天`
                : ` · long range, step widened to ${plan.effectiveStep}d`}
            </span>
          )}
        </p>

        {/* The player keeps showing the previous run until a rebuild, so say so
            rather than letting the controls and the graph disagree silently. */}
        {stale && !building && (
          <p className="text-10 text-amber-600 mb-3">
            {zh
              ? "設定已變更，按下方按鈕重新產生時間線"
              : "Settings changed — rebuild to apply them"}
          </p>
        )}

        {building ? (
          <div className="space-y-2">
            <div className="h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
              <div className="h-full bg-[var(--color-secondary)] transition-all duration-150"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-10 text-[var(--text-on-surface-muted)]">
                {zh ? "計算中" : "Building"} {progress.done}/{progress.total}
              </p>
              <button onClick={cancelBuild}
                className="flex items-center gap-1 text-10 font-semibold text-rose-500 hover:text-rose-600">
                <X size={12} />{zh ? "取消" : "Cancel"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={handleBuild} disabled={plan.frameCount <= 0}
            className={clsx("w-full py-2.5 rounded-xl text-xs font-semibold transition-colors",
              plan.frameCount > 0
                ? "bg-gray-900 text-white hover:bg-gray-700"
                : "bg-gray-100 text-gray-300 cursor-not-allowed")}>
            {frames.length
              ? (zh ? "重新產生時間線" : "Rebuild timeline")
              : (zh ? "產生時間線" : "Build timeline")}
          </button>
        )}
      </div>

      {/* ── Player ─────────────────────────────────────────────────────── */}
      {frame && built && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-on-surface)]">
                  {md(frame.from)} — {md(frame.to)}
                </p>
                <p className="text-10 text-[var(--text-on-surface-muted)]">
                  {zh
                    ? `區間 ${dayStr(frame.days)} · 起點已前進 ${frame.index * built.step} 天`
                    : `${dayStr(frame.days)} window · start advanced ${frame.index * built.step}d`}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-[var(--text-accent)] shrink-0">
                {frame.index + 1}/{frames.length}
              </span>
            </div>

            {/* Scrubber */}
            <input type="range" min={0} max={frames.length - 1} value={idx}
              onChange={e => { setPlaying(false); setIdx(Number(e.target.value)); }}
              className="w-full accent-[var(--color-secondary)]" />

            {/* Transport */}
            <div className="flex items-center justify-center gap-2 mt-1">
              <button onClick={() => { setPlaying(false); setIdx(i => Math.max(0, i - 1)); }}
                className="icon-btn text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                <SkipBack size={16} />
              </button>
              <button onClick={togglePlay}
                className="icon-btn-lg bg-gray-900 text-white hover:bg-gray-700">
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button onClick={() => { setPlaying(false); setIdx(i => Math.min(frames.length - 1, i + 1)); }}
                className="icon-btn text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                <SkipForward size={16} />
              </button>
              <button onClick={() => setLoop(v => !v)}
                className={clsx("icon-btn", loop ? "text-[var(--text-accent)]" : "text-gray-300 hover:text-gray-400")}>
                <Repeat size={16} />
              </button>
            </div>

            {/* Frame stats + change against the previous frame */}
            <div className="grid grid-cols-4 gap-1.5 mt-3">
              <StatTile label={zh ? "連線" : "Links"} value={String(frame.stats.edgeCount)}
                delta={frame.delta && <Delta value={frame.delta.edgeCountDelta} />} />
              <StatTile label={zh ? "平均 |r|" : "Mean |r|"} value={frame.stats.meanAbsR.toFixed(2)}
                delta={frame.delta && <Delta value={frame.delta.meanAbsRDelta} digits={2} />} />
              <StatTile label={zh ? "強關聯" : "Strong"} value={String(frame.stats.strongCount)} />
              <StatTile label={zh ? "延遲" : "Lagged"} value={String(frame.stats.laggedCount)} />
            </div>
          </div>

          {/* Graph for this frame — fixed ring so only the edges move */}
          <CorrelationNetwork
            network={frame.network}
            lang={lang}
            ringOrder={ringOrder}
            title={zh ? `關係圖 · ${md(frame.from)}—${md(frame.to)}` : `Network · ${md(frame.from)}—${md(frame.to)}`}
            subtitle={zh
              ? "節點位置固定於整段時間線，因此畫面上移動的只有連線本身"
              : "Node slots are fixed for the whole run, so the only thing that moves is the links"}
          />

          {/* ── Change against the previous frame ────────────────────── */}
          <div className="card">
            <CardHeader mb="mb-3"
              title={zh ? "區間變化" : "What changed"}
              action={<span className="text-10 text-[var(--text-on-surface-muted)]">
                {frame.delta
                  ? (zh ? `較前一張（起點 +${built.step} 天）` : `vs previous (+${built.step}d start)`)
                  : (zh ? "最寬的區間" : "widest window")}
              </span>} />

            {!frame.delta ? (
              <p className="text-xs text-[var(--text-on-surface-muted)]">
                {zh
                  ? "這是第一張圖，之後每一張都會跟前一張比較。"
                  : "This is the first frame; every later one is compared against the one before it."}
              </p>
            ) : (
              <div className="space-y-2.5">
                {frame.delta.appeared.length === 0 && frame.delta.vanished.length === 0 && (
                  <p className="text-xs text-[var(--text-on-surface-muted)]">
                    {zh ? "沒有連線增減，只有強度變化" : "No links gained or lost — only strengths moved"}
                  </p>
                )}
                {frame.delta.appeared.slice(0, MAX_CHANGE_ROWS).map((e, i) => (
                  <div key={`a${i}`} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-600 w-4 shrink-0">+</span>
                    <span className="text-xs text-[var(--text-on-surface)] flex-1 truncate">{edgeLabel(e)}</span>
                    <span className="text-10 font-mono font-bold text-emerald-600 shrink-0">
                      {e.r >= 0 ? "+" : ""}{e.r.toFixed(2)}
                    </span>
                  </div>
                ))}
                {frame.delta.vanished.slice(0, MAX_CHANGE_ROWS).map((e, i) => (
                  <div key={`v${i}`} className="flex items-center gap-2 opacity-70">
                    <span className="text-xs font-bold text-rose-500 w-4 shrink-0">−</span>
                    <span className="text-xs text-[var(--text-on-surface)] flex-1 truncate line-through">{edgeLabel(e)}</span>
                    <span className="text-10 font-mono font-bold text-rose-500 shrink-0">
                      {e.r >= 0 ? "+" : ""}{e.r.toFixed(2)}
                    </span>
                  </div>
                ))}
                {hiddenChanges > 0 && (
                  <p className="text-10 text-[var(--text-on-surface-muted)] pl-6">
                    {zh ? `…另有 ${hiddenChanges} 條增減` : `…and ${hiddenChanges} more gained/lost`}
                  </p>
                )}
                {frame.delta.moved.slice(0, 3).filter(m => Math.abs(m.deltaR) >= 0.02).map(m => (
                  <div key={m.key} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-300 w-4 shrink-0">~</span>
                    <span className="text-xs text-[var(--text-on-surface-muted)] flex-1 truncate">
                      {edgeLabel(m.edge)}
                      {m.flipped && (
                        <span className="ml-1 text-amber-600 font-semibold">
                          {zh ? "轉向" : "flipped"}
                        </span>
                      )}
                      {m.lagShift && !m.flipped && (
                        <span className="ml-1 text-amber-600 font-semibold">
                          {zh ? "延遲改變" : "lag shift"}
                        </span>
                      )}
                    </span>
                    <span className="text-10 font-mono text-gray-400 shrink-0">
                      {m.prevR.toFixed(2)} → {m.edge.r.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Cumulative change against the widest window */}
            {vsFirst && (
              <div className="mt-3 pt-3 border-t border-[var(--surface-border)]">
                <p className="text-10 text-[var(--text-on-surface-muted)] mb-1.5">
                  {zh
                    ? `相對第 1 張（${dayStr(frames[0].days)} → ${dayStr(frame.days)}）`
                    : `vs frame 1 (${dayStr(frames[0].days)} → ${dayStr(frame.days)})`}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-10 text-[var(--text-on-surface-muted)]">
                    {zh ? "連線" : "Links"} <Delta value={vsFirst.edgeCountDelta} />
                  </span>
                  <span className="text-10 text-[var(--text-on-surface-muted)]">
                    {zh ? "平均 |r|" : "Mean |r|"} <Delta value={vsFirst.meanAbsRDelta} digits={2} />
                  </span>
                  <span className="text-10 text-[var(--text-on-surface-muted)]">
                    {zh ? "新增" : "Gained"} <span className="font-mono font-bold text-emerald-600">{vsFirst.appeared.length}</span>
                  </span>
                  <span className="text-10 text-[var(--text-on-surface-muted)]">
                    {zh ? "消失" : "Lost"} <span className="font-mono font-bold text-rose-500">{vsFirst.vanished.length}</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Cross-frame trend ────────────────────────────────────── */}
          <div className="card">
            <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-1">
              {zh ? "整段走勢" : "Across the run"}
            </p>
            <p className="text-10 text-[var(--text-on-surface-muted)] mb-2">
              {zh
                ? "X 軸為該張圖的區間長度（天），由長到短；點一下可跳到該張"
                : "X is each frame's window length in days, longest to shortest; tap to jump to a frame"}
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={series} margin={{ top: 8, right: 4, bottom: 4, left: -26 }}
                onClick={(st: any) => {
                  if (st && typeof st.activeTooltipIndex === "number") {
                    setPlaying(false);
                    setIdx(st.activeTooltipIndex);
                  }
                }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                <XAxis dataKey="index" tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
                  axisLine={false} tickLine={false} minTickGap={24}
                  tickFormatter={(v: number) => String(series[v]?.days ?? "")} />
                <YAxis yAxisId="left" allowDecimals={false}
                  tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
                  axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 1]} width={28}
                  tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as typeof series[number];
                  return (
                    <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl px-2.5 py-1.5 text-10 shadow-lg">
                      <p className="font-semibold text-[var(--text-on-surface)]">
                        {md(d.from)} — {md(built.end)} · {dayStr(d.days)}
                      </p>
                      <p className="text-[var(--text-on-surface-muted)]">
                        {zh ? "連線" : "Links"}: {d.edgeCount} · {zh ? "平均 |r|" : "mean |r|"}: {d.meanAbsR.toFixed(2)}
                      </p>
                      <p className="text-[var(--text-on-surface-muted)]">
                        {zh ? "增減" : "Churn"}: {d.churn}
                      </p>
                    </div>
                  );
                }} />
                <ReferenceLine yAxisId="left" x={idx} stroke="var(--text-accent)" strokeWidth={1.5} />
                <Line yAxisId="left" type="monotone" dataKey="edgeCount" stroke="#0d5c63"
                  strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="meanAbsR" stroke="#fb923c"
                  strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)]">
                <span className="inline-block w-4 h-0.5 rounded" style={{ background: "#0d5c63" }} />
                {zh ? "連線數" : "Link count"}
              </span>
              <span className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)]">
                <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="#fb923c" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                {zh ? "平均 |r|" : "Mean |r|"}
              </span>
            </div>
          </div>

          {/* ── Edge persistence ─────────────────────────────────────── */}
          {trackRows.length > 0 && (
            <div className="card">
              <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-1">
                {zh ? "連線持續度" : "Link persistence"}
              </p>
              <p className="text-10 text-[var(--text-on-surface-muted)] mb-2.5">
                {zh
                  ? "每一條的色帶是它在整段時間線上的存在情形（左=長區間，右=短區間），深淺代表 |r|"
                  : "Each strip shows where a link existed across the run (left = widest window, right = tightest); shade is |r|"}
              </p>
              <div className="space-y-1.5">
                {trackRows.map(({ track, rects }) => (
                  <div key={track.key} className="flex items-center gap-2">
                    <span className="text-10 text-[var(--text-on-surface)] w-24 shrink-0 truncate">
                      {varLabel(track.source)}–{varLabel(track.target)}
                    </span>
                    <div className="relative flex-1 h-2.5 rounded-sm bg-[var(--surface-container-low)] overflow-hidden">
                      <svg viewBox={`0 0 ${frames.length} 10`} preserveAspectRatio="none"
                        className="w-full h-full block">
                        {rects}
                      </svg>
                      <div className="absolute top-0 bottom-0 w-px bg-[var(--text-on-surface)]"
                        style={{ left: `${((idx + 0.5) / frames.length) * 100}%` }} />
                    </div>
                    <span className="text-10 font-mono font-bold text-[var(--text-on-surface-muted)] w-8 text-right shrink-0">
                      {Math.round(track.presence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-10 text-[var(--text-on-surface-muted)] mt-2">
                {zh
                  ? "100% 代表無論區間怎麼縮短都成立；只出現在左側代表那段關聯來自較早的資料"
                  : "100% means it holds at every window; left-only means the link lives in the older data"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
