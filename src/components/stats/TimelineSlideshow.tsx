import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { format, parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { CalendarDays, Film, X, TrendingUp, TrendingDown, Target } from "lucide-react";
import { clsx } from "clsx";
import { MiniCalendar } from "@/components/common/MiniCalendar";
import { CardHeader } from "@/components/common/CardHeader";
import { NET_VARS, type NetVar } from "@/lib/statistics/network";
import {
  buildTimeline, persistentGoalLinks, emergedGoalLinks, goalTrendSeries,
  planTimeline, TIMELINE_MIN_WINDOW, TIMELINE_STEP_OPTIONS,
  type GoalFrame, type GoalDirection, type PersistentGoalLink, type EmergedGoalLink,
} from "@/lib/statistics/timeline";
import { getDailyStatsRecords, getDataDateBounds } from "@/lib/db/queries/stats";
import { logError } from "@/lib/error";

/** The variable every Timeline result is measured against. */
const GOAL_VAR: NetVar = "weight_kg";

/** Rows shown per direction before the rest collapse into a count. */
const MAX_ROWS = 5;

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

function SectionEmpty({ text }: { text: string }) {
  return <p className="text-xs text-[var(--text-on-surface-muted)]">{text}</p>;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  userId: number;
  lang: string;
  /** "up" if the goal wants weight to rise, "down" if it wants it to fall. */
  goalDir: GoalDirection;
}

/**
 * Timeline: which factors affect your goal, and since when.
 *
 * The window end is pinned to your latest data; the start walks forward one
 * step per frame, from the entire history down to the shortest window a
 * correlation can stand on. That shrinking sequence is used purely as
 * computation — every frame is scored against the goal variable only (see
 * `computeGoalLinks`) — and never drawn as a network. Two results come out:
 *
 * - Long-term effects: hold up no matter how tight the window gets, including
 *   right now.
 * - Newly emerged effects: only started holding partway through the record,
 *   and still do as of your latest data.
 *
 * Both are split into positive (helps your goal) and negative (hurts it),
 * using the direction your mode already targets weight in.
 */
export function TimelineSlideshow({ userId, lang, goalDir }: Props) {
  const zh = lang === "zh";

  // ── Setup state ───────────────────────────────────────────────────────────
  const [bounds, setBounds]         = useState<{ first: string; last: string } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [startDate, setStartDate]   = useState<string | null>(null);
  const [showCal, setShowCal]       = useState(false);
  const [stepDays, setStepDays]     = useState<number>(1);

  // ── Build state ───────────────────────────────────────────────────────────
  const [frames, setFrames]       = useState<GoalFrame[]>([]);
  const [persistent, setPersistent] = useState<PersistentGoalLink[]>([]);
  const [emerged, setEmerged]     = useState<EmergedGoalLink[]>([]);
  const [built, setBuilt]         = useState<{ start: string; end: string; step: number; widened: boolean } | null>(null);
  const [building, setBuilding]   = useState(false);
  const [progress, setProgress]   = useState<{ done: number; total: number; phase: "frames" | "emerged" }>(
    { done: 0, total: 0, phase: "frames" });
  const abortRef = useRef(false);

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
   * Days the picker offers as a start: anywhere in the record that still
   * leaves an analysable window behind it.
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
  const plan = useMemo(() => planTimeline(totalDays, stepDays), [totalDays, stepDays]);

  /** The result on screen no longer matches what the setup card is configured for. */
  const stale = built != null && (
    built.start !== startDate ||
    built.end   !== bounds?.last ||
    built.step  !== plan.effectiveStep);

  // ── Build ─────────────────────────────────────────────────────────────────
  const handleBuild = async () => {
    if (!bounds || !startDate || plan.frameCount <= 0) return;
    abortRef.current = false;
    setBuilding(true);
    setProgress({ done: 0, total: plan.frameCount, phase: "frames" });
    try {
      const recs = await getDailyStatsRecords(userId, 0, startDate, bounds.last);
      const res  = await buildTimeline(
        recs,
        { startDate, endDate: bounds.last, stepDays, goalVar: GOAL_VAR },
        (done, total) => setProgress({ done, total, phase: "frames" }),
        () => abortRef.current,
      );
      if (res.frames.length) {
        setFrames(res.frames);
        setPersistent(persistentGoalLinks(res.frames, goalDir));
        setBuilt({ start: startDate, end: bounds.last, step: res.effectiveStep, widened: res.stepWidened });

        setProgress({ done: 0, total: 0, phase: "emerged" });
        setEmerged(abortRef.current ? [] : await emergedGoalLinks(
          recs, res.frames, GOAL_VAR, goalDir, {},
          (done, total) => setProgress({ done, total, phase: "emerged" }),
          () => abortRef.current,
        ));
      }
    } catch (e) { logError("Timeline.build", e); }
    setBuilding(false);
  };

  const cancelBuild = () => { abortRef.current = true; };

  // ── Derived views ─────────────────────────────────────────────────────────
  const trend = useMemo(() => goalTrendSeries(frames, goalDir), [frames, goalDir]);

  const varLabel = (v: NetVar) => zh ? NET_VARS[v].labelZh : NET_VARS[v].labelEn;
  const goalLabel = varLabel(GOAL_VAR);
  const dayStr = (n: number) => zh ? `${n} 天` : `${n}d`;
  const md = (d: string) => format(parseISO(d), "M/d");
  const lagLabel = (lag: number) =>
    lag === 0 ? (zh ? "當天" : "same day") : (zh ? `領先 ${lag} 天` : `leads by ${lag}d`);

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

  const posLabel = zh ? "正面" : "Positive";
  const negLabel = zh ? "負面" : "Negative";

  const renderPersistentRow = (link: PersistentGoalLink, positive: boolean) => (
    <div key={link.factor}
      className={clsx("rounded-xl bg-[var(--surface-container-low)] px-3 py-2",
        "border-l-4", positive ? "border-l-emerald-400" : "border-l-rose-300")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-on-surface)] truncate">{varLabel(link.factor)}</span>
        <span className={clsx("text-10 font-mono font-bold shrink-0",
          positive ? "text-emerald-600" : "text-rose-500")}>
          {link.r >= 0 ? "+" : ""}{link.r.toFixed(2)}
        </span>
      </div>
      <p className="text-10 text-[var(--text-on-surface-muted)] mt-0.5">
        {lagLabel(link.lag)} · n={link.n}
        {" · "}{zh ? "整段持續" : "held"} {Math.round(link.presence * 100)}%
      </p>
    </div>
  );

  const renderEmergedRow = (link: EmergedGoalLink, positive: boolean) => (
    <div key={link.factor}
      className={clsx("rounded-xl bg-[var(--surface-container-low)] px-3 py-2",
        "border-l-4", positive ? "border-l-emerald-400" : "border-l-rose-300")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-on-surface)] truncate">{varLabel(link.factor)}</span>
        <span className={clsx("text-10 font-semibold shrink-0",
          positive ? "text-emerald-600" : "text-rose-500")}>
          {zh ? `${md(link.date)} 起` : `since ${md(link.date)}`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 mt-1 text-10">
        <span className="text-[var(--text-on-surface-muted)]">{zh ? "之前" : "before"} {dayStr(link.beforeDays)}</span>
        <span className="font-mono text-[var(--text-on-surface-muted)]">
          {link.before.r >= 0 ? "+" : ""}{link.before.r.toFixed(2)}
        </span>
        <span className="text-[var(--text-on-surface-muted)]">n={link.before.n}</span>
        <span className="text-gray-300 mx-0.5">→</span>
        <span className="text-[var(--text-on-surface-muted)]">{zh ? "之後" : "since"} {dayStr(link.sinceDays)}</span>
        <span className={clsx("font-mono font-bold", positive ? "text-emerald-600" : "text-rose-500")}>
          {link.since.r >= 0 ? "+" : ""}{link.since.r.toFixed(2)}
        </span>
        <span className="text-[var(--text-on-surface-muted)]">n={link.since.n}</span>
      </div>
      <p className="text-9 text-[var(--text-on-surface-muted)] mt-0.5">
        {lagLabel(link.lag)}
        {" · p "}{link.pAdjusted < 0.001 ? "< 0.001" : `= ${link.pAdjusted.toFixed(3)}`}
      </p>
    </div>
  );

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
            ? `終點固定在最新一筆資料，起點逐步往前推：分析區間從長到短，找出哪些因子長期都會影響「${goalLabel}」，哪些是最近才開始出現影響。`
            : `The window end is pinned to your latest data and the start walks forward, from a long analysis window down to a short one, to find which factors affect "${goalLabel}" long-term and which only started recently.`}
        </p>

        <div className="flex items-center gap-2 mb-1.5 px-3 py-2 rounded-xl bg-[var(--surface-container-low)]">
          <Target size={13} className="text-[var(--text-accent)] shrink-0" />
          <span className="text-10 text-[var(--text-on-surface-muted)]">
            {zh ? "分析目標" : "Goal"}
            <span className="mx-1 text-[var(--text-on-surface)] font-semibold">{goalLabel}</span>
            <span className={clsx("font-semibold", goalDir === "down" ? "text-rose-500" : "text-emerald-600")}>
              {goalDir === "down"
                ? (zh ? "（越低越好）" : "(lower is better)")
                : (zh ? "（越高越好）" : "(higher is better)")}
            </span>
          </span>
        </div>

        {/* Range row */}
        <div className="flex items-center gap-2 mb-3 mt-2">
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
          {zh ? "分析精細度（每張間隔）" : "Analysis granularity (step per frame)"}
        </p>
        <div className="flex gap-micro.5 flex-wrap mb-3">
          {TIMELINE_STEP_OPTIONS.map(s => (
            <SegButton key={s} active={stepDays === s} onClick={() => setStepDays(s)}>
              {zh ? `${s} 天` : `${s}d`}
            </SegButton>
          ))}
        </div>

        {/* Plan summary */}
        <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
          {zh
            ? `區間 ${dayStr(totalDays)} · 共分析 ${plan.frameCount} 個窗口`
            : `${dayStr(totalDays)} range · ${plan.frameCount} windows analysed`}
          {plan.stepWidened && (
            <span className="text-amber-600">
              {zh
                ? ` · 區間偏長，間隔自動放寬為 ${plan.effectiveStep} 天`
                : ` · long range, step widened to ${plan.effectiveStep}d`}
            </span>
          )}
        </p>

        {stale && !building && (
          <p className="text-10 text-amber-600 mb-3">
            {zh ? "設定已變更，按下方按鈕重新產生時間線" : "Settings changed — rebuild to apply them"}
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
                {progress.phase === "emerged"
                  ? (zh ? "分析新出現的影響" : "Finding newly emerged effects")
                  : (zh ? "計算中" : "Building")} {progress.done}/{progress.total}
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
            {built ? (zh ? "重新分析" : "Rebuild") : (zh ? "開始分析" : "Analyse")}
          </button>
        )}
      </div>

      {/* ── Results ────────────────────────────────────────────────────── */}
      {built && (
        <>
          {/* Long-term effects */}
          <div className="card">
            <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-1">
              {zh ? "長期存在的影響" : "Long-term effects"}
            </p>
            <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
              {zh
                ? `不論分析窗口拉長或縮短都成立，包含最近的資料在內 — 不是舊資料造成的錯覺，現在也還在發生`
                : `Holds no matter how the analysis window is sized, including the most recent data — not an artefact of old data, and still true now`}
            </p>

            {(() => {
              const pos = persistent.filter(l => l.direction === "positive");
              const neg = persistent.filter(l => l.direction === "negative");
              if (pos.length === 0 && neg.length === 0) {
                return <SectionEmpty text={zh
                  ? "沒有找到長期都成立的關聯"
                  : "No factor holds up across the whole run"} />;
              }
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="flex items-center gap-1 text-10 font-semibold text-emerald-600 mb-1.5">
                      <TrendingUp size={12} />{posLabel}
                    </p>
                    <div className="space-y-1.5">
                      {pos.length === 0
                        ? <SectionEmpty text={zh ? "無" : "None"} />
                        : pos.slice(0, MAX_ROWS).map(l => renderPersistentRow(l, true))}
                      {pos.length > MAX_ROWS && (
                        <p className="text-10 text-[var(--text-on-surface-muted)]">
                          {zh ? `…另有 ${pos.length - MAX_ROWS} 個` : `…and ${pos.length - MAX_ROWS} more`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-10 font-semibold text-rose-500 mb-1.5">
                      <TrendingDown size={12} />{negLabel}
                    </p>
                    <div className="space-y-1.5">
                      {neg.length === 0
                        ? <SectionEmpty text={zh ? "無" : "None"} />
                        : neg.slice(0, MAX_ROWS).map(l => renderPersistentRow(l, false))}
                      {neg.length > MAX_ROWS && (
                        <p className="text-10 text-[var(--text-on-surface-muted)]">
                          {zh ? `…另有 ${neg.length - MAX_ROWS} 個` : `…and ${neg.length - MAX_ROWS} more`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Newly emerged effects */}
          <div className="card">
            <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-1">
              {zh ? "新出現的影響" : "Newly emerged effects"}
            </p>
            <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
              {zh
                ? "把記錄從每個候選日期切成前後兩段，找出前後相關性差最多的日期。列出的都是「從該日起、直到最新資料」才成立的關聯，p 值已對整趟搜尋校正"
                : "Each candidate date splits the record in two; the date where the halves disagree most is the onset. Everything here holds only from that date through to your latest data — p corrected for the whole search"}
            </p>

            {(() => {
              const pos = emerged.filter(l => l.direction === "positive");
              const neg = emerged.filter(l => l.direction === "negative");
              if (pos.length === 0 && neg.length === 0) {
                return <SectionEmpty text={zh
                  ? "沒有找到新出現的關聯"
                  : "No newly emerged effect found"} />;
              }
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="flex items-center gap-1 text-10 font-semibold text-emerald-600 mb-1.5">
                      <TrendingUp size={12} />{posLabel}
                    </p>
                    <div className="space-y-1.5">
                      {pos.length === 0
                        ? <SectionEmpty text={zh ? "無" : "None"} />
                        : pos.slice(0, MAX_ROWS).map(l => renderEmergedRow(l, true))}
                      {pos.length > MAX_ROWS && (
                        <p className="text-10 text-[var(--text-on-surface-muted)]">
                          {zh ? `…另有 ${pos.length - MAX_ROWS} 個` : `…and ${pos.length - MAX_ROWS} more`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-10 font-semibold text-rose-500 mb-1.5">
                      <TrendingDown size={12} />{negLabel}
                    </p>
                    <div className="space-y-1.5">
                      {neg.length === 0
                        ? <SectionEmpty text={zh ? "無" : "None"} />
                        : neg.slice(0, MAX_ROWS).map(l => renderEmergedRow(l, false))}
                      {neg.length > MAX_ROWS && (
                        <p className="text-10 text-[var(--text-on-surface-muted)]">
                          {zh ? `…另有 ${neg.length - MAX_ROWS} 個` : `…and ${neg.length - MAX_ROWS} more`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Across-the-run chart ─────────────────────────────────── */}
          <div className="card">
            <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-1">
              {zh ? "整段走勢" : "Across the run"}
            </p>
            <p className="text-10 text-[var(--text-on-surface-muted)] mb-2">
              {zh
                ? "每個分析窗口有幾個正面／負面因子。X 軸為窗口長度（天），由長到短；把游標移到柱狀上可看是哪些因子"
                : "How many positive/negative factors each analysis window found. X is window length in days, longest to shortest; hover a bar to see which factors"}
            </p>
            {(() => {
              const data = trend.map(t => ({
                index: t.index, days: t.days,
                pos: t.positive.length, neg: -t.negative.length,
                point: t,
              }));
              const maxCount = Math.max(1, ...trend.map(t => Math.max(t.positive.length, t.negative.length)));
              return (
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -26 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                    <XAxis dataKey="index" tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
                      axisLine={false} tickLine={false} minTickGap={24}
                      tickFormatter={(v: number) => String(data[v]?.days ?? "")} />
                    <YAxis allowDecimals={false} domain={[-maxCount, maxCount]}
                      tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
                      axisLine={false} tickLine={false}
                      tickFormatter={(v: number) => String(Math.abs(v))} />
                    <ReferenceLine y={0} stroke="var(--surface-border)" />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = (payload[0].payload as typeof data[number]).point;
                      const list = (arr: { factor: NetVar; r: number }[]) => arr.length
                        ? arr.slice(0, 6).map(f => varLabel(f.factor)).join("、")
                          + (arr.length > 6 ? ` +${arr.length - 6}` : "")
                        : (zh ? "無" : "none");
                      return (
                        <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl px-2.5 py-1.5 text-10 shadow-lg max-w-[220px]">
                          <p className="font-semibold text-[var(--text-on-surface)]">
                            {md(d.from)} — {md(built.end)} · {dayStr(d.days)}
                          </p>
                          <p className="text-emerald-600 mt-1">{posLabel}: {list(d.positive)}</p>
                          <p className="text-rose-500 mt-0.5">{negLabel}: {list(d.negative)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="pos" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={10} />
                    <Bar dataKey="neg" fill="#f43f5e" radius={[0, 0, 3, 3]} maxBarSize={10} />
                  </ComposedChart>
                </ResponsiveContainer>
              );
            })()}
            <div className="flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)]">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#10b981" }} />
                {zh ? "正面因子數" : "Positive factors"}
              </span>
              <span className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)]">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#f43f5e" }} />
                {zh ? "負面因子數" : "Negative factors"}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
