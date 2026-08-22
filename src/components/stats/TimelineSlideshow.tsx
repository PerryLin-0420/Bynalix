import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { format, parseISO, differenceInCalendarDays, subDays } from "date-fns";
import { Film, X, TrendingUp, TrendingDown, Minus, Target } from "lucide-react";
import { clsx } from "clsx";
import { DateRangePickerCard } from "@/components/common/DateRangePicker";
import { CardHeader } from "@/components/common/CardHeader";
import { useLangStore } from "@/store/langStore";
import { NET_VARS, type NetVar } from "@/lib/statistics/network";
import {
  buildTimeline, persistentGoalLinks, emergedGoalLinks, goalTrendSeries,
  linkTrends, regimeGoalLinks, factorTrajectory,
  planTimeline, TIMELINE_MIN_WINDOW, TIMELINE_STEP_OPTIONS,
  type GoalFrame, type GoalDirection, type PersistentGoalLink, type EmergedGoalLink,
  type LinkTrend, type RegimeSegment,
} from "@/lib/statistics/timeline";
import { getDailyStatsRecords, getDataDateBounds, getActiveDates } from "@/lib/db/queries/stats";
import { logError } from "@/lib/error";

/** The variable every Timeline result is measured against. */
const GOAL_VAR: NetVar = "weight_kg";

/**
 * Widest-window presets, same pill-and-custom-range model as the other stats
 * tabs (see `DateRangePills`/`useDateRange`) — but with Timeline-appropriate
 * values. The 14/30/90-day presets those tabs use are mostly too short here:
 * the shrinking-window analysis needs real room to walk the start forward, and
 * "long-term" only means something against a genuinely long default range.
 * `null` stands for the full logged history, and is the default.
 */
const TIMELINE_RANGE_OPTIONS: readonly (number | null)[] = [null, 365, 180, 90];

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
  const { t } = useLangStore();

  // ── Setup state ───────────────────────────────────────────────────────────
  // Same preset-pill + custom-range model as the Pearson/Advanced/Patterns
  // tabs (`useDateRange`, `DateRangePills`, `DateRangePickerCard`): a set of
  // widest-window presets, or a fully custom [start, end] picked on a
  // calendar. Kept as Timeline's own state rather than sharing the page-level
  // one those tabs use — switching between Pearson and Patterns would
  // otherwise silently rewind an in-progress Timeline analysis, and the
  // presets themselves need different (much longer) values here anyway.
  const [bounds, setBounds]         = useState<{ first: string; last: string } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [rangeDays, setRangeDays]   = useState<number | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [modeCustom, setModeCustom] = useState(false);
  const [customRange, setCustomRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [stepDays, setStepDays]     = useState<number>(1);

  // ── Build state ───────────────────────────────────────────────────────────
  const [frames, setFrames]       = useState<GoalFrame[]>([]);
  const [persistent, setPersistent] = useState<PersistentGoalLink[]>([]);
  const [trends, setTrends]       = useState<Map<NetVar, LinkTrend>>(new Map());
  const [emerged, setEmerged]     = useState<EmergedGoalLink[]>([]);
  const [regimes, setRegimes]     = useState<Map<NetVar, RegimeSegment[]>>(new Map());
  const [built, setBuilt]         = useState<{ start: string; end: string; step: number; widened: boolean } | null>(null);
  const [building, setBuilding]   = useState(false);
  const [progress, setProgress]   = useState<{ done: number; total: number; phase: "frames" | "emerged" | "regimes" }>(
    { done: 0, total: 0, phase: "frames" });
  const abortRef = useRef(false);

  // ── Load the data bounds once ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await getDataDateBounds(userId);
        if (!cancelled) setBounds(b);
      } catch (e) { logError("Timeline.loadBounds", e); }
      if (!cancelled) setMetaLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Custom range needs the calendar's "which days actually have data" set,
  // same lazy-load pattern the other tabs use for their own range picker.
  useEffect(() => {
    if (!showCustom) return;
    let cancelled = false;
    (async () => {
      try {
        const dates = await getActiveDates(userId, ["meal", "exercise", "weight", "body"]);
        if (!cancelled) setActiveDates(dates);
      } catch (e) { logError("Timeline.loadActiveDates", e); }
    })();
    return () => { cancelled = true; };
  }, [showCustom, userId]);

  /**
   * The widest frame's [start, end]. A preset always ends on the latest
   * logged day — matching Timeline's own "end pinned to now" design — clamped
   * so a preset longer than the actual history just falls back to all of it.
   * A custom range is user-chosen on both ends, generalising past "always
   * ends at latest" to "analyse any historical stretch", same flexibility the
   * other tabs' custom range already has.
   */
  const { startDate, endDate } = useMemo(() => {
    if (!bounds) return { startDate: null as string | null, endDate: null as string | null };
    if (modeCustom && customRange.start && customRange.end) return { startDate: customRange.start, endDate: customRange.end };
    if (rangeDays == null) return { startDate: bounds.first, endDate: bounds.last };
    const candidate = format(subDays(parseISO(bounds.last), rangeDays - 1), "yyyy-MM-dd");
    return { startDate: candidate < bounds.first ? bounds.first : candidate, endDate: bounds.last };
  }, [bounds, rangeDays, modeCustom, customRange]);

  const selectPreset = (d: number | null) => {
    setRangeDays(d);
    setModeCustom(false);
    setShowCustom(false);
    setCustomRange({ start: null, end: null });
  };

  const totalDays = startDate && endDate
    ? differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1
    : 0;
  const plan = useMemo(() => planTimeline(totalDays, stepDays), [totalDays, stepDays]);
  /** A custom range picked but too short for even one window. */
  const rangeTooShort = modeCustom && customRange.start && customRange.end && plan.frameCount <= 0;

  /** The result on screen no longer matches what the setup card is configured for. */
  const stale = built != null && (
    built.start !== startDate ||
    built.end   !== endDate ||
    built.step  !== plan.effectiveStep);

  // ── Build ─────────────────────────────────────────────────────────────────
  const handleBuild = async () => {
    if (!startDate || !endDate || plan.frameCount <= 0) return;
    abortRef.current = false;
    setBuilding(true);
    setProgress({ done: 0, total: plan.frameCount, phase: "frames" });
    try {
      const recs = await getDailyStatsRecords(userId, 0, startDate, endDate);
      const res  = await buildTimeline(
        recs,
        { startDate, endDate, stepDays, goalVar: GOAL_VAR },
        (done, total) => setProgress({ done, total, phase: "frames" }),
        () => abortRef.current,
      );
      if (res.frames.length) {
        setFrames(res.frames);
        const persistentLinks = persistentGoalLinks(res.frames, goalDir);
        setPersistent(persistentLinks);
        setTrends(new Map(linkTrends(res.frames, persistentLinks.map(l => l.factor)).map(t => [t.factor, t])));
        setBuilt({ start: startDate, end: endDate, step: res.effectiveStep, widened: res.stepWidened });

        setProgress({ done: 0, total: 0, phase: "emerged" });
        const emergedLinks = abortRef.current ? [] : await emergedGoalLinks(
          recs, res.frames, GOAL_VAR, goalDir, {},
          (done, total) => setProgress({ done, total, phase: "emerged" }),
          () => abortRef.current,
        );
        setEmerged(emergedLinks);

        setProgress({ done: 0, total: 0, phase: "regimes" });
        setRegimes(abortRef.current || emergedLinks.length === 0 ? new Map() : await regimeGoalLinks(
          recs, emergedLinks, GOAL_VAR, startDate, endDate, {},
          (done, total) => setProgress({ done, total, phase: "regimes" }),
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

  const historyDays = bounds ? differenceInCalendarDays(parseISO(bounds.last), parseISO(bounds.first)) + 1 : 0;
  if (!bounds || historyDays < TIMELINE_MIN_WINDOW) {
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
    <PersistentWaveform key={link.factor} link={link} trend={trends.get(link.factor)} frames={frames}
      lang={lang} positive={positive} varLabel={varLabel} lagLabel={lagLabel} />
  );

  const renderEmergedRow = (link: EmergedGoalLink, positive: boolean) => (
    <EmergedWaveform key={link.factor} link={link} segments={regimes.get(link.factor)} frames={frames}
      lang={lang} positive={positive} varLabel={varLabel} lagLabel={lagLabel} md={md} />
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
            ? `選一段分析區間，起點會逐步往前推、區間從長到短：找出哪些因子長期都會影響「${goalLabel}」，哪些是最近才開始出現影響。預設區間的終點固定在最新一筆資料；自訂範圍則可自行選擇終點。`
            : `Pick an analysis range — the start walks forward and the window shrinks from long to short, to find which factors affect "${goalLabel}" long-term and which only started recently. Preset ranges end on your latest data; a custom range lets you pick the end yourself.`}
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

        {/* Range: preset pills (widest window, always ending at latest data)
            or a fully custom [start, end] — same model as Pearson/Advanced/
            Patterns' own date-range picker. */}
        <p className="text-10 font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          {zh ? "分析區間（起點 A）" : "Analysis range (start A)"}
        </p>
        <div className="flex gap-micro.5 flex-wrap mb-2">
          {TIMELINE_RANGE_OPTIONS.map(d => (
            <SegButton key={d ?? "all"} active={!modeCustom && rangeDays === d} onClick={() => selectPreset(d)}>
              {d == null ? (zh ? "全部" : "All") : dayStr(d)}
            </SegButton>
          ))}
          <SegButton active={showCustom || modeCustom} onClick={() => setShowCustom(v => !v)}>
            {t("history.custom")}
          </SegButton>
        </div>

        {showCustom && (
          <div className="mb-2">
            <DateRangePickerCard
              customRange={customRange} activeDates={activeDates}
              onRangeChange={r => { setCustomRange(r); setModeCustom(!!(r.start && r.end)); }}
              onApply={() => setShowCustom(false)}
              titleKey="stats.pickRange"
              pickStartKey="stats.pickStart"
              pickEndKey="stats.pickEnd"
              applyKey="stats.applyRange"
            />
            {rangeTooShort && (
              <p className="text-10 text-rose-500 mt-1.5">
                {zh
                  ? `這段區間短於 ${TIMELINE_MIN_WINDOW} 天，統計上無法成立，請選更寬的範圍`
                  : `That range is under ${TIMELINE_MIN_WINDOW} days, which no statistic can carry — pick a wider one`}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--surface-container-low)] border border-[var(--surface-border)]">
            <span className="block text-9 text-[var(--text-on-surface-muted)] leading-none">
              {zh ? "起點 A" : "Start A"}
            </span>
            <span className="block text-sm font-semibold text-[var(--text-on-surface)] leading-tight mt-0.5">
              {startDate ? format(parseISO(startDate), "yyyy/M/d") : "—"}
            </span>
          </div>
          <span className="text-[var(--text-on-surface-muted)] text-sm">→</span>
          <div className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--surface-container-low)] border border-[var(--surface-border)]">
            <span className="block text-9 text-[var(--text-on-surface-muted)] leading-none">
              {modeCustom ? (zh ? "終點" : "End") : (zh ? "終點（最新資料）" : "End (latest data)")}
            </span>
            <span className="block text-sm font-semibold text-[var(--text-on-surface)] leading-tight mt-0.5">
              {endDate ? format(parseISO(endDate), "yyyy/M/d") : "—"}
            </span>
          </div>
        </div>

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
                {progress.phase === "regimes"
                  ? (zh ? "尋找更早的轉折" : "Looking for earlier regimes")
                  : progress.phase === "emerged"
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
                <div className="space-y-3">
                  {pos.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 text-10 font-semibold text-emerald-600 mb-1.5">
                        <TrendingUp size={12} />{posLabel}
                      </p>
                      <div className="space-y-2">
                        {pos.slice(0, MAX_ROWS).map(l => renderPersistentRow(l, true))}
                        {pos.length > MAX_ROWS && (
                          <p className="text-10 text-[var(--text-on-surface-muted)]">
                            {zh ? `…另有 ${pos.length - MAX_ROWS} 個` : `…and ${pos.length - MAX_ROWS} more`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {neg.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 text-10 font-semibold text-rose-500 mb-1.5">
                        <TrendingDown size={12} />{negLabel}
                      </p>
                      <div className="space-y-2">
                        {neg.slice(0, MAX_ROWS).map(l => renderPersistentRow(l, false))}
                        {neg.length > MAX_ROWS && (
                          <p className="text-10 text-[var(--text-on-surface-muted)]">
                            {zh ? `…另有 ${neg.length - MAX_ROWS} 個` : `…and ${neg.length - MAX_ROWS} more`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
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
                <div className="space-y-3">
                  {pos.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 text-10 font-semibold text-emerald-600 mb-1.5">
                        <TrendingUp size={12} />{posLabel}
                      </p>
                      <div className="space-y-2">
                        {pos.slice(0, MAX_ROWS).map(l => renderEmergedRow(l, true))}
                        {pos.length > MAX_ROWS && (
                          <p className="text-10 text-[var(--text-on-surface-muted)]">
                            {zh ? `…另有 ${pos.length - MAX_ROWS} 個` : `…and ${pos.length - MAX_ROWS} more`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {neg.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 text-10 font-semibold text-rose-500 mb-1.5">
                        <TrendingDown size={12} />{negLabel}
                      </p>
                      <div className="space-y-2">
                        {neg.slice(0, MAX_ROWS).map(l => renderEmergedRow(l, false))}
                        {neg.length > MAX_ROWS && (
                          <p className="text-10 text-[var(--text-on-surface-muted)]">
                            {zh ? `…另有 ${neg.length - MAX_ROWS} 個` : `…and ${neg.length - MAX_ROWS} more`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
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

// ── Waveform charts ────────────────────────────────────────────────────────────
//
// A link's r value across the frame sequence is read as a signal, not a
// number: a thin raw trace (one point per window) under a bold smoothed
// trend line, plotted against the window's *start date* rather than its size
// in days — so the X axis reads directly as "correlation using data from
// this date onward", which is what the analysis actually means.

const RAW_COLOR = "var(--text-on-surface-muted)";
const POS_LINE = "#10b981";
const NEG_LINE = "#f43f5e";

function PersistentWaveform({ link, trend, frames, lang, positive, varLabel, lagLabel }: {
  link: PersistentGoalLink;
  trend: LinkTrend | undefined;
  frames: GoalFrame[];
  lang: string;
  positive: boolean;
  varLabel: (v: NetVar) => string;
  lagLabel: (lag: number) => string;
}) {
  const zh = lang === "zh";
  const lineColor = positive ? POS_LINE : NEG_LINE;
  const data = useMemo(() => frames.map((f, i) => ({
    date: f.from,
    raw: trend?.raw[i] ?? null,
    smoothed: trend?.smoothed[i] ?? null,
  })), [frames, trend]);

  const direction = trend?.direction ?? "stable";
  const TrendIcon = direction === "strengthening" ? TrendingUp : direction === "weakening" ? TrendingDown : Minus;
  const trendLabel = direction === "strengthening" ? (zh ? "增強中" : "strengthening")
    : direction === "weakening" ? (zh ? "減弱中" : "weakening")
    : (zh ? "持平" : "steady");

  return (
    <div className="rounded-xl bg-[var(--surface-container-low)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className="text-xs font-semibold text-[var(--text-on-surface)] truncate">{varLabel(link.factor)}</span>
        <span className={clsx("flex items-center gap-1 text-10 font-semibold shrink-0",
          direction === "strengthening" ? "text-emerald-600" : direction === "weakening" ? "text-rose-500" : "text-[var(--text-on-surface-muted)]")}>
          <TrendIcon size={11} />{trendLabel}
        </span>
      </div>
      <p className="text-10 text-[var(--text-on-surface-muted)] mb-1.5">
        {lagLabel(link.lag)} · {zh ? "目前" : "now"}{" "}
        <span className={clsx("font-mono font-bold", positive ? "text-emerald-600" : "text-rose-500")}>
          {link.r >= 0 ? "+" : ""}{link.r.toFixed(2)}
        </span>
        {" · "}{zh ? "整段持續" : "held"} {Math.round(link.presence * 100)}%
      </p>

      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: -30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
            axisLine={false} tickLine={false} minTickGap={28}
            tickFormatter={(v: string) => format(parseISO(v), "M/d")} />
          <YAxis domain={[-1, 1]} tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
            axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(1)} width={26} />
          <ReferenceLine y={0} stroke="var(--surface-border)" />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const raw = payload.find(p => p.dataKey === "raw")?.value as number | undefined;
            return (
              <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl px-2.5 py-1.5 text-10 shadow-lg">
                <p className="font-semibold text-[var(--text-on-surface)]">{format(parseISO(label as string), "M/d")}</p>
                {raw != null && <p className="text-[var(--text-on-surface-muted)]">r = {raw >= 0 ? "+" : ""}{raw.toFixed(2)}</p>}
              </div>
            );
          }} />
          <Line dataKey="raw" stroke={RAW_COLOR} strokeWidth={1} strokeOpacity={0.35} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="smoothed" stroke={lineColor} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {trend && trend.direction !== "stable" && (
        <p className="text-9 text-[var(--text-on-surface-muted)] mt-1">
          {zh
            ? `趨勢 r=${trend.trendR.toFixed(2)}，p ${trend.trendP < 0.001 ? "< 0.001" : `= ${trend.trendP.toFixed(3)}`}`
            : `trend r=${trend.trendR.toFixed(2)}, p ${trend.trendP < 0.001 ? "< 0.001" : `= ${trend.trendP.toFixed(3)}`}`}
        </p>
      )}
    </div>
  );
}

function EmergedWaveform({ link, segments, frames, lang, positive, varLabel, lagLabel, md }: {
  link: EmergedGoalLink;
  segments: RegimeSegment[] | undefined;
  frames: GoalFrame[];
  lang: string;
  positive: boolean;
  varLabel: (v: NetVar) => string;
  lagLabel: (lag: number) => string;
  md: (d: string) => string;
}) {
  const zh = lang === "zh";
  const lineColor = positive ? POS_LINE : NEG_LINE;

  const rangeEndFallback = frames[0]?.to ?? link.date;
  const segs = segments ?? [
    { from: frames[0]?.from ?? link.date, to: link.date, r: link.before.r, n: link.before.n, reliability: link.before.reliability },
    { from: link.date, to: rangeEndFallback, r: link.since.r, n: link.since.n, reliability: link.since.reliability },
  ];

  // Raw per-window trace (thin), same date-keyed X axis as the persistent chart.
  const raw = useMemo(() => factorTrajectory(frames, link.factor).raw, [frames, link.factor]);
  const rawData = useMemo(() => frames.map((f, i) => ({ date: f.from, raw: raw[i] })), [frames, raw]);

  // A step function through the regime segments: one point per segment start
  // plus a closing point at the range end, so `stepAfter` interpolation draws
  // a flat line for each segment and a vertical jump at each transition —
  // the "decoded discrete levels" read against the raw trace above.
  const rangeEnd = frames[0]?.to ?? link.date;
  const stepData = useMemo(() => [
    ...segs.map(s => ({ date: s.from, level: s.r })),
    { date: rangeEnd, level: segs[segs.length - 1].r },
  ], [segs, rangeEnd]);

  return (
    <div className="rounded-xl bg-[var(--surface-container-low)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className="text-xs font-semibold text-[var(--text-on-surface)] truncate">{varLabel(link.factor)}</span>
        <span className={clsx("text-10 font-semibold shrink-0", positive ? "text-emerald-600" : "text-rose-500")}>
          {zh ? `${md(link.date)} 起` : `since ${md(link.date)}`}
        </span>
      </div>
      <p className="text-10 text-[var(--text-on-surface-muted)] mb-1.5">
        {lagLabel(link.lag)}
        {" · p "}{link.pAdjusted < 0.001 ? "< 0.001" : `= ${link.pAdjusted.toFixed(3)}`}
        {segs.length > 2 && (zh ? ` · 偵測到 ${segs.length} 段` : ` · ${segs.length} segments found`)}
      </p>

      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart margin={{ top: 2, right: 4, bottom: 0, left: -30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
          <XAxis dataKey="date" type="category" allowDuplicatedCategory={false}
            tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
            axisLine={false} tickLine={false} minTickGap={28}
            tickFormatter={(v: string) => format(parseISO(v), "M/d")} />
          <YAxis domain={[-1, 1]} tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
            axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(1)} width={26} />
          <ReferenceLine y={0} stroke="var(--surface-border)" />
          {segs.slice(1).map((s, i) => (
            <ReferenceLine key={i} x={s.from} stroke="var(--text-accent)" strokeDasharray="4 3" strokeWidth={1} />
          ))}
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const rawV = payload.find(p => p.dataKey === "raw")?.value as number | undefined;
            const lvl  = payload.find(p => p.dataKey === "level")?.value as number | undefined;
            return (
              <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl px-2.5 py-1.5 text-10 shadow-lg">
                <p className="font-semibold text-[var(--text-on-surface)]">{format(parseISO(label as string), "M/d")}</p>
                {rawV != null && <p className="text-[var(--text-on-surface-muted)]">r = {rawV >= 0 ? "+" : ""}{rawV.toFixed(2)}</p>}
                {lvl  != null && <p style={{ color: lineColor }}>{zh ? "區段" : "segment"}: {lvl >= 0 ? "+" : ""}{lvl.toFixed(2)}</p>}
              </div>
            );
          }} />
          <Line data={rawData} dataKey="raw" stroke={RAW_COLOR} strokeWidth={1} strokeOpacity={0.35}
            dot={false} connectNulls={false} isAnimationActive={false} />
          <Line data={stepData} dataKey="level" type="stepAfter" stroke={lineColor} strokeWidth={2.2}
            dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {segs.map((s, i) => (
          <span key={i} className="text-9 text-[var(--text-on-surface-muted)]">
            {md(s.from)}–{s.to === rangeEnd ? (zh ? "現在" : "now") : md(s.to)}:{" "}
            <span className={clsx("font-mono font-bold", s.r >= 0 ? "text-emerald-600" : "text-rose-500")}>
              {s.r >= 0 ? "+" : ""}{s.r.toFixed(2)}
            </span>{" "}n={s.n}
          </span>
        ))}
      </div>
    </div>
  );
}
