import { useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { format, parseISO, differenceInCalendarDays, subDays } from "date-fns";
import { Network, X } from "lucide-react";
import { clsx } from "clsx";
import { DateRangePickerCard } from "@/components/common/DateRangePicker";
import { CardHeader } from "@/components/common/CardHeader";
import { useLangStore } from "@/store/langStore";
import { NET_VARS, type NetVar } from "@/lib/statistics/network";
import {
  buildNetworkTimeline, emergedNetworkLinks, groupEmergedByHub,
  planTimeline, TIMELINE_MIN_WINDOW, EMERGENCE_STEP_OPTIONS, EMERGENCE_WORK_BUDGET,
  type NetworkFrame, type EmergedPairLink, type EmergenceCard as HubCard,
} from "@/lib/statistics/emergence";
import { getDailyStatsRecords, getDataDateBounds, getActiveDates } from "@/lib/db/queries/stats";
import { logError } from "@/lib/error";

/** Widest-window presets — same values and rationale as the Timeline tab's. */
const RANGE_OPTIONS: readonly (number | null)[] = [null, 365, 180, 90];

/** A variable only linked to one other one doesn't earn its own multi-line card. */
const MIN_HUB_DEGREE = 2;

const LINE_COLORS = ["#0d5c63", "#fb923c", "#a78bfa", "#f43f5e", "#10b981", "#38bdf8", "#eab308"];

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

interface Props {
  userId: number;
  lang: string;
}

/**
 * Which pairwise relationships in the network are new, not just present —
 * and which of those cluster around one variable.
 *
 * The correlation network graph above this shows what's related right now,
 * but a snapshot can't tell "weight and calories, always linked" apart from
 * "sleep and water, only linked for the last two months" — both just look
 * like an edge. This re-runs the network across a shrinking-window sequence
 * (the same idea the Timeline tab uses) to tell them apart: a relationship
 * that holds using the entire history, old data included, is excluded as
 * long-term stable; what's left are relationships that measurably turned on
 * partway through the record and still hold now.
 *
 * Those are then grouped by hub variable — the node with the most newly-
 * emerged connections — so a card shows one variable's shifting web of
 * relationships as a small multi-line chart (r per window, one line per
 * neighbour) instead of a flat list. Not every run produces a card: this is
 * a real event to have happened in your data, not something guaranteed to
 * be there.
 */
export function EmergenceCards({ userId, lang }: Props) {
  const zh = lang === "zh";
  const { t } = useLangStore();

  const [bounds, setBounds]         = useState<{ first: string; last: string } | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [rangeDays, setRangeDays]   = useState<number | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [modeCustom, setModeCustom] = useState(false);
  const [customRange, setCustomRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [stepDays, setStepDays]     = useState<number>(1);

  const [frames, setFrames]     = useState<NetworkFrame[]>([]);
  const [cards, setCards]       = useState<HubCard[]>([]);
  const [loose, setLoose]       = useState<EmergedPairLink[]>([]);
  const [built, setBuilt]       = useState<{ start: string; end: string; step: number } | null>(null);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; phase: "frames" | "emerged" }>(
    { done: 0, total: 0, phase: "frames" });
  const abortRef = useRef(false);

  const ensureBounds = async () => {
    if (metaLoaded) return;
    try {
      const b = await getDataDateBounds(userId);
      setBounds(b);
    } catch (e) { logError("EmergenceCards.loadBounds", e); }
    setMetaLoaded(true);
  };

  const ensureActiveDates = async () => {
    if (activeDates.size > 0) return;
    try {
      setActiveDates(await getActiveDates(userId, ["meal", "exercise", "weight", "body"]));
    } catch (e) { logError("EmergenceCards.loadActiveDates", e); }
  };

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
  // Must match buildNetworkTimeline's own budget default exactly, or the plan
  // shown here (and the `stale` check below) disagrees with what the build
  // actually does — planTimeline's own default is the Timeline tab's much
  // larger goal-only budget, not this full-network scan's tighter one.
  const plan = useMemo(() => planTimeline(totalDays, stepDays, TIMELINE_MIN_WINDOW, undefined, EMERGENCE_WORK_BUDGET), [totalDays, stepDays]);
  const rangeTooShort = modeCustom && customRange.start && customRange.end && plan.frameCount <= 0;

  const handleOpen = async () => {
    setShowSetup(v => !v);
    await ensureBounds();
  };
  const [showSetup, setShowSetup] = useState(false);

  const handleBuild = async () => {
    if (!startDate || !endDate || plan.frameCount <= 0) return;
    abortRef.current = false;
    setBuilding(true);
    setProgress({ done: 0, total: plan.frameCount, phase: "frames" });
    try {
      const recs = await getDailyStatsRecords(userId, 0, startDate, endDate);
      const res  = await buildNetworkTimeline(
        recs,
        { startDate, endDate, stepDays },
        (done, total) => setProgress({ done, total, phase: "frames" }),
        () => abortRef.current,
      );
      if (res.frames.length) {
        setFrames(res.frames);
        setProgress({ done: 0, total: 0, phase: "emerged" });
        const emerged = abortRef.current ? [] : await emergedNetworkLinks(
          recs, res.frames, {},
          (done, total) => setProgress({ done, total, phase: "emerged" }),
          () => abortRef.current,
        );
        const grouped = groupEmergedByHub(emerged, MIN_HUB_DEGREE);
        const hubbed = new Set(grouped.flatMap(c => c.links.map(l => l.key)));
        setCards(grouped);
        setLoose(emerged.filter(l => !hubbed.has(l.key)));
        setBuilt({ start: startDate, end: endDate, step: res.effectiveStep });
      } else {
        setCards([]); setLoose([]); setFrames([]);
        setBuilt({ start: startDate, end: endDate, step: res.effectiveStep });
      }
    } catch (e) { logError("EmergenceCards.build", e); }
    setBuilding(false);
  };

  const cancelBuild = () => { abortRef.current = true; };

  const varLabel = (v: NetVar) => zh ? NET_VARS[v].labelZh : NET_VARS[v].labelEn;
  const md = (d: string) => format(parseISO(d), "M/d");
  const dayStr = (n: number) => zh ? `${n} 天` : `${n}d`;
  const lagLabel = (lag: number) => lag === 0 ? (zh ? "當天" : "same day") : (zh ? `延遲 ${lag} 天` : `${lag}d lag`);

  const stale = built != null && (built.start !== startDate || built.end !== endDate || built.step !== plan.effectiveStep);

  return (
    <div className="card">
      <CardHeader mb="mb-3"
        title={<span className="flex items-center gap-micro.5">
          <Network size={14} className="text-[var(--text-accent)]" />
          {zh ? "關係變化" : "Relationship changes"}
        </span>}
        action={
          <button onClick={handleOpen}
            className="text-10 font-semibold text-[var(--text-accent)] hover:opacity-70">
            {showSetup ? (zh ? "收起" : "Hide") : built ? (zh ? "重新分析" : "Re-run") : (zh ? "分析" : "Analyse")}
          </button>
        } />
      <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
        {zh
          ? "上面的關係圖是「現在」的快照，看不出哪些關聯是最近才出現的。這裡把同一段記錄切成從長到短的窗口序列，找出真正新出現、且持續至今的關聯（像體重與熱量這種從頭到尾都成立的長期穩定關係不會列在這裡），並依共同因子分組成卡片。"
          : "The graph above is a snapshot of \"now\" — it can't tell a relationship that's always held from one that just started. This re-scores the same record across a long-to-short window sequence to find links that measurably turned on and still hold (a long-term stable one, like weight and calories, is excluded), grouped into cards by shared factor."}
      </p>

      {showSetup && (
        <div className="mb-3 space-y-3">
          {!bounds ? (
            <p className="text-xs text-[var(--text-on-surface-muted)]">{zh ? "載入中…" : "Loading…"}</p>
          ) : (
            <>
              <p className="text-10 font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {zh ? "分析區間" : "Analysis range"}
              </p>
              <div className="flex gap-micro.5 flex-wrap">
                {RANGE_OPTIONS.map(d => (
                  <SegButton key={d ?? "all"} active={!modeCustom && rangeDays === d} onClick={() => selectPreset(d)}>
                    {d == null ? (zh ? "全部" : "All") : dayStr(d)}
                  </SegButton>
                ))}
                <SegButton active={showCustom || modeCustom} onClick={() => { setShowCustom(v => !v); ensureActiveDates(); }}>
                  {t("history.custom")}
                </SegButton>
              </div>

              {showCustom && (
                <div>
                  <DateRangePickerCard
                    customRange={customRange} activeDates={activeDates}
                    onRangeChange={r => { setCustomRange(r); setModeCustom(!!(r.start && r.end)); }}
                    onApply={() => setShowCustom(false)}
                    titleKey="stats.pickRange" pickStartKey="stats.pickStart"
                    pickEndKey="stats.pickEnd" applyKey="stats.applyRange"
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

              <p className="text-10 font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {zh ? "分析精細度（每張間隔）" : "Granularity (step per frame)"}
              </p>
              <div className="flex gap-micro.5 flex-wrap">
                {EMERGENCE_STEP_OPTIONS.map(s => (
                  <SegButton key={s} active={stepDays === s} onClick={() => setStepDays(s)}>
                    {zh ? `${s} 天` : `${s}d`}
                  </SegButton>
                ))}
              </div>

              <p className="text-10 text-[var(--text-on-surface-muted)]">
                {startDate && endDate
                  ? (zh
                    ? `${md(startDate)} — ${md(endDate)} · 區間 ${dayStr(totalDays)} · 共分析 ${plan.frameCount} 個窗口`
                    : `${md(startDate)} — ${md(endDate)} · ${dayStr(totalDays)} range · ${plan.frameCount} windows`)
                  : ""}
                {plan.stepWidened && (
                  <span className="text-amber-600">
                    {zh ? ` · 間隔自動放寬為 ${plan.effectiveStep} 天` : ` · step widened to ${plan.effectiveStep}d`}
                  </span>
                )}
              </p>

              {stale && !building && (
                <p className="text-10 text-amber-600">{zh ? "設定已變更，重新分析以套用" : "Settings changed — re-run to apply"}</p>
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
                        ? (zh ? "尋找新出現的關聯" : "Finding emerged links")
                        : (zh ? "計算中" : "Building")} {progress.done}/{progress.total}
                    </p>
                    <button onClick={cancelBuild} className="flex items-center gap-1 text-10 font-semibold text-rose-500 hover:text-rose-600">
                      <X size={12} />{zh ? "取消" : "Cancel"}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={handleBuild} disabled={plan.frameCount <= 0}
                  className={clsx("w-full py-2.5 rounded-xl text-xs font-semibold transition-colors",
                    plan.frameCount > 0 ? "bg-gray-900 text-white hover:bg-gray-700" : "bg-gray-100 text-gray-300 cursor-not-allowed")}>
                  {built ? (zh ? "重新分析" : "Rebuild") : (zh ? "開始分析" : "Analyse")}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {built && !building && (
        cards.length === 0 && loose.length === 0 ? (
          <p className="text-xs text-[var(--text-on-surface-muted)]">
            {zh
              ? "這段區間沒有找到新出現且持續的關聯 — 目前的關係圖裡的連線多半是長期穩定的。"
              : "No newly-emerged, still-holding relationship in this range — what's in the network graph above is mostly long-term stable."}
          </p>
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <HubChart key={card.hub} card={card} frames={frames} lang={lang}
                varLabel={varLabel} md={md} dayStr={dayStr} lagLabel={lagLabel} />
            ))}
            {loose.length > 0 && (
              <div className="rounded-xl bg-[var(--surface-container-low)] px-3 py-2.5">
                <p className="text-10 font-semibold text-[var(--text-on-surface)] mb-1.5">
                  {zh ? "其他新出現的關聯" : "Other newly-emerged links"}
                </p>
                <div className="space-y-1">
                  {loose.map(l => (
                    <p key={l.key} className="text-10 text-[var(--text-on-surface-muted)]">
                      <span className="text-[var(--text-on-surface)] font-medium">{varLabel(l.a)} ↔ {varLabel(l.b)}</span>
                      {" · "}{lagLabel(l.lag)}
                      {" · "}<span className={clsx("font-mono font-bold", l.since.r >= 0 ? "text-emerald-600" : "text-rose-500")}>
                        {l.since.r >= 0 ? "+" : ""}{l.since.r.toFixed(2)}
                      </span>
                      {" "}{zh ? `${md(l.date)} 起` : `since ${md(l.date)}`}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

// ── One hub's multi-line chart ────────────────────────────────────────────────

function HubChart({ card, frames, lang, varLabel, md, dayStr, lagLabel }: {
  card: HubCard;
  frames: NetworkFrame[];
  lang: string;
  varLabel: (v: NetVar) => string;
  md: (d: string) => string;
  dayStr: (n: number) => string;
  lagLabel: (lag: number) => string;
}) {
  const zh = lang === "zh";
  const data = useMemo(() => frames.map((f, i) => {
    const row: Record<string, number | string | null> = { index: f.index, days: f.days };
    for (const link of card.links) {
      const other = link.a === card.hub ? link.b : link.a;
      row[other] = link.trajectory[i];
    }
    return row;
  }), [frames, card]);

  // Each link already carries the frame index its own onset split landed on;
  // the earliest (smallest index = widest window) is the reference line.
  const refIndex = Math.min(...card.links.map(l => l.frameIndex));

  return (
    <div className="rounded-xl bg-[var(--surface-container-low)] px-3 py-3">
      <p className="text-xs font-semibold text-[var(--text-on-surface)] mb-0.5">
        {zh ? `${varLabel(card.hub)} 的新出現關聯` : `${varLabel(card.hub)}'s newly-emerged links`}
      </p>
      <p className="text-9 text-[var(--text-on-surface-muted)] mb-2">
        {zh
          ? `${card.links.length} 個因子在這段記錄裡開始與「${varLabel(card.hub)}」同時變化`
          : `${card.links.length} factors started moving together with "${varLabel(card.hub)}" during this record`}
      </p>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
          <XAxis dataKey="index" tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
            axisLine={false} tickLine={false} minTickGap={20}
            tickFormatter={(v: number) => String(data[v]?.days ?? "")} />
          <YAxis domain={[-1, 1]} tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
            axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(1)} />
          <ReferenceLine y={0} stroke="var(--surface-border)" />
          {refIndex >= 0 && (
            <ReferenceLine x={refIndex} stroke="var(--text-accent)" strokeDasharray="4 3" strokeWidth={1} />
          )}
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = data[label as number];
            return (
              <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl px-2.5 py-1.5 text-10 shadow-lg">
                <p className="font-semibold text-[var(--text-on-surface)]">{dayStr(row.days as number)}</p>
                {payload.map(p => p.value != null && (
                  <p key={p.dataKey as string} style={{ color: p.color }}>
                    {varLabel(p.dataKey as NetVar)}: {(p.value as number) >= 0 ? "+" : ""}{(p.value as number).toFixed(2)}
                  </p>
                ))}
              </div>
            );
          }} />
          {card.links.map((link, i) => {
            const other = link.a === card.hub ? link.b : link.a;
            return (
              <Line key={other} dataKey={other} name={varLabel(other)}
                stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.8}
                dot={false} connectNulls={false} isAnimationActive={false} />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <div className="space-y-1 mt-1.5">
        {card.links.map((link, i) => {
          const other = link.a === card.hub ? link.b : link.a;
          return (
            <div key={link.key} className="flex items-center gap-1.5 text-10">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
              <span className="text-[var(--text-on-surface)] font-medium">{varLabel(other)}</span>
              <span className="text-[var(--text-on-surface-muted)]">{lagLabel(link.lag)}</span>
              <span className={clsx("font-mono font-bold", link.since.r >= 0 ? "text-emerald-600" : "text-rose-500")}>
                {link.since.r >= 0 ? "+" : ""}{link.since.r.toFixed(2)}
              </span>
              <span className="text-[var(--text-on-surface-muted)] ml-auto shrink-0">
                {zh ? `${md(link.date)} 起` : `since ${md(link.date)}`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-9 text-[var(--text-on-surface-muted)] mt-1.5">
        {zh
          ? "垂直虛線＝最早的起始日期；p 值已對整趟搜尋校正"
          : "Dashed line = earliest onset date; p corrected for the whole search"}
      </p>
    </div>
  );
}
