import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer, LineChart, Line, ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { BarChart2, TrendingDown, TrendingUp, Minus, RefreshCw, Target, Pencil, Plus, X, User } from "lucide-react";
import { MetricPicker, metricKey, metricLabel, type MetricCfg } from "@/components/stats/MetricPicker";
import { CARDIO_SWIM_LIKE, CARDIO_CYCLE_LIKE, CARDIO_RUN_LIKE } from "@/constants";
import { clsx } from "clsx";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { NoProfile } from "@/components/common/NoProfile";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { PillButton } from "@/components/common/PillButton";
import { CardHeader } from "@/components/common/CardHeader";
import { DateRangePills, DateRangePickerCard } from "@/components/common/DateRangePicker";
import { useDateRange } from "@/hooks/useDateRange";
import { useSwipeTabs } from "@/hooks/useSwipe";
import { getDailyStatsRecords, getActiveDates } from "@/lib/db/queries/stats";
import { getDb } from "@/lib/db";
import { computeInfluenceRanking, FACTOR_LABELS, FACTOR_LABELS_EN, RELIABILITY_THRESHOLDS, getReliability, lagCorrelation, bestLag, buildDateRange as buildDateRangePure, linearInterpolate as linearInterpPure, type Factor, type Reliability, type LagResult } from "@/lib/statistics/pearson";
import { logError } from "@/lib/error";
import { MODE_GOAL, MODE_META, STATS_MIN_DAYS } from "@/constants";
import type { DailyStatsRecord } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatTab = "pearson" | "advanced" | "patterns";

interface LagRow {
  factor: string;
  label: string;
  best: LagResult | null;
  density: number;
  sampleSize: number;
}

interface TrendTabData {
  chartPoints: {
    date: string;
    w: number | null;    // z-score for plotting
    s: number | null;
    c: number | null;
    wRaw: number | null; // original values for tooltip
    sRaw: number | null;
    cRaw: number | null;
  }[];
  trends: {
    weight:   { slope: number; significant: boolean } | null;
    sleep:    { slope: number; significant: boolean } | null;
    calories: { slope: number; significant: boolean } | null;
  };
  lagSections: { targetLabel: string; rows: LagRow[] }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const densityColor = (d: number): "green" | "yellow" | "red" =>
  d >= 80 ? "green" : d >= 50 ? "yellow" : "red";

const densityDotCls = (d: number): string =>
  d >= 80 ? "text-green-500" : d >= 50 ? "text-amber-400" : "text-red-400";

// ─── Shared sub-components ────────────────────────────────────────────────────

function PearsonBarChart({ data, colorFor, lang }: {
  data: { label: string; r: number | null }[];
  colorFor: (d: { label: string; r: number | null }) => boolean;
  lang: string;
}) {
  return (
    <div className="card">
      <CardHeader title={lang === "zh" ? "相關係數排名" : "Correlation Ranking"} />
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 40, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#374151" }}
            axisLine={false} tickLine={false}
            angle={-30} textAnchor="end" interval={0} />
          <YAxis domain={[-1, 1]}
            tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false}
            tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip
            formatter={(v: number) => [v.toFixed(3), "Pearson r"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
          <Bar dataKey="r" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorFor(d) ? "#10b981" : "#f87171"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FactorInsightCard({ label, r, density, isGood, insight, dcClx, reliabilityBadge, lang, onEdit, onRemove }: {
  label: string;
  r: number | null;
  density: number;
  isGood: boolean;
  insight: string;
  dcClx: string;
  reliabilityBadge?: string | null;
  lang: string;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const Icon = r !== null && r > 0.1 ? TrendingUp : r !== null && r < -0.1 ? TrendingDown : Minus;
  return (
    <div className={clsx("card flex items-start gap-3 border-l-4",
      r === null ? "border-l-gray-200" : isGood ? "border-l-green-400" : "border-l-red-300",
      (reliabilityBadge !== undefined && !isGood && r !== null) && "opacity-75")}>
      <div className={clsx("w-7 h-7 flex items-center justify-center shrink-0 text-base font-black leading-none",
        r === null ? "text-gray-300" : isGood ? "text-emerald-600" : "text-rose-600")}>
        ◎
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-on-surface)] truncate">{label}</p>
          <div className="flex items-center gap-1 shrink-0">
            {r !== null ? (
              <div className="flex flex-col items-end gap-0.5">
                <div className={clsx("flex items-center gap-1 text-xs font-mono font-bold",
                  isGood ? "text-green-600" : "text-red-500")}>
                  <span className={clsx("text-sm leading-none", dcClx)}>●</span>
                  <Icon size={12} />
                  {r >= 0 ? "+" : ""}{r.toFixed(3)}
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[9px] text-[var(--text-on-surface-muted)] leading-none">{lang === "zh" ? "資料密度" : "Density"}:</span>
                  <span className={clsx("text-sm font-bold leading-none", dcClx)}>{density}%</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-0.5 opacity-50">
                <div className="flex items-center gap-1 text-xs font-mono font-bold text-gray-400">
                  <span className="text-sm leading-none text-gray-300">●</span>
                  <Minus size={12} />
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[9px] text-[var(--text-on-surface-muted)] leading-none">{lang === "zh" ? "資料密度" : "Density"}:</span>
                  <span className="text-sm font-bold leading-none text-gray-400">{density}%</span>
                </div>
              </div>
            )}
            {onEdit && (
              <button onClick={onEdit} className="p-1 text-gray-400 hover:text-yellow-500 transition-colors">
                <Pencil size={13} />
              </button>
            )}
            {onRemove && (
              <button onClick={onRemove} className="p-1 text-gray-400 hover:text-red-400 transition-colors">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">
          {insight}
          {reliabilityBadge && (
            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600">
              {reliabilityBadge}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function computePearsonAligned(
  goalPts: number[],
  varPts: number[],
): { r: number; reliability: Reliability } | null {
  const n = Math.min(goalPts.length, varPts.length);
  if (n < RELIABILITY_THRESHOLDS.MIN_PAIRS) return null;
  // Always trim from head (oldest) of the larger series
  const g = goalPts.length > n ? goalPts.slice(goalPts.length - n) : goalPts;
  const v = varPts.length  > n ? varPts.slice(varPts.length  - n) : varPts;
  return { r: pearsonFromArrays(g, v), reliability: getReliability(n) };
}

function pearsonFromArrays(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx; const dy = y[i] - my;
    num += dx * dy; sx += dx * dx; sy += dy * dy;
  }
  const denom = Math.sqrt(sx * sy);
  return denom === 0 ? 0 : num / denom;
}

// ─── Trend helpers ────────────────────────────────────────────────────────────

function zScoreMap(rawMap: Map<string, number>): Map<string, number> {
  const vals = [...rawMap.values()].sort((a, b) => a - b);
  if (vals.length < 2) return new Map();
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  const devs = vals.map(v => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = devs.length % 2 === 0 ? (devs[mid - 1] + devs[mid]) / 2 : devs[mid];
  const scale = 1.4826 * mad;
  if (scale === 0) return new Map();
  const result = new Map<string, number>();
  for (const [d, v] of rawMap) result.set(d, (v - median) / scale);
  return result;
}

function currentSlope(zMap: Map<string, number>, allDates: string[], window: number): number | null {
  const pts: { x: number; y: number }[] = [];
  for (let i = allDates.length - 1; i >= 0 && pts.length < window; i--) {
    const z = zMap.get(allDates[i]);
    if (z != null) pts.unshift({ x: i, y: z });
  }
  if (pts.length < 3) return null;
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom;
}

function adaptiveThreshold(rangeDays: number): number {
  if (rangeDays <= 30)  return 0.05;
  if (rangeDays <= 90)  return 0.03;
  if (rangeDays <= 180) return 0.02;
  return 0.01;
}

function rollingChangeMap(
  rawMap: Map<string, number>,
  allDates: string[],
  window = 3,
): Map<string, number> {
  const interp = linearInterpPure(rawMap, allDates);
  const result = new Map<string, number>();
  for (let i = window; i < allDates.length; i++) {
    const curr = allDates.slice(i - window + 1, i + 1).map(d => interp.get(d)?.value).filter((v): v is number => v != null);
    const prev = allDates.slice(i - window, i).map(d => interp.get(d)?.value).filter((v): v is number => v != null);
    if (!curr.length || !prev.length) continue;
    const ac = curr.reduce((s, v) => s + v, 0) / curr.length;
    const ap = prev.reduce((s, v) => s + v, 0) / prev.length;
    result.set(allDates[i], ac - ap);
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Statistics() {
  const { profile, modeSettings, patchAdvConfig, patchAdv2Config } = useUserStore();
  const { t, lang } = useLangStore();
  const dStr = (n: number) => lang === "zh" ? `${n}天` : `${n} days`;

  const [activeTab, setActiveTab] = useState<StatTab>("pearson");
  const STAT_TABS = ["pearson", "advanced", "patterns"] as const;
  const statSwipe = useSwipeTabs(STAT_TABS, activeTab, setActiveTab as (t: string) => void);

  const { days, showCustom, setShowCustom, customRange, setCustomRange, modeCustom, setModeCustom, getFromTo, rangeTotal, selectPreset } = useDateRange(90);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());

  // Pearson tab
  const [loading, setLoading]       = useState(false);
  const [daysWithData, setDaysWithData] = useState(0);
  const [basicFactors, setBasicFactors] = useState<{ factor: string; label: string; r: number | null; density: number }[]>([]);
  const [advGoalDensity, setAdvGoalDensity] = useState(100);

  // Patterns tab (trend + lag)
  const [trendData, setTrendData] = useState<TrendTabData | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(false);

  // Advanced tab — new config UI
  interface VarCard { id: string; cfg: MetricCfg | null; confirmed: boolean; open: boolean }
  const [advGoalCfg, setAdvGoalCfg]           = useState<MetricCfg | null>(null);
  const [advGoalDir, setAdvGoalDir]           = useState<"up" | "down">("up");
  const [advGoalOpen, setAdvGoalOpen]         = useState(false);
  const [advGoalConfirmed, setAdvGoalConfirmed] = useState(false);
  const [advVarCards, setAdvVarCards]         = useState<VarCard[]>([]);
  const [_advChartLoading, setAdvChartLoading] = useState(false);
  const [advPearsonResults, setAdvPearsonResults] = useState<Record<string, { r: number | null; density: number; reliability: Reliability }>>({});

  // Advanced tab — slot 2 (custom mode 進階2)
  const [adv2GoalCfg, setAdv2GoalCfg]                 = useState<MetricCfg | null>(null);
  const [adv2GoalDir, setAdv2GoalDir]                 = useState<"up" | "down">("up");
  const [adv2GoalOpen, setAdv2GoalOpen]               = useState(false);
  const [adv2GoalConfirmed, setAdv2GoalConfirmed]     = useState(false);
  const [adv2VarCards, setAdv2VarCards]               = useState<VarCard[]>([]);
  const [adv2PearsonResults, setAdv2PearsonResults]   = useState<Record<string, { r: number | null; density: number; reliability: Reliability }>>({});
  const [adv2GoalDensity, setAdv2GoalDensity]         = useState(100);

  const goalMode = modeSettings ? MODE_GOAL[modeSettings.mode] : "maintain";
  const modeInfo = modeSettings ? MODE_META[modeSettings.mode] : null;
  const MODE_LABEL_KEY: Record<string, string> = {
    cut_slow: "profile.mode.cutSlow", cut_normal: "profile.mode.cutNormal",
    cut_aggressive: "profile.mode.cutAggressive", bulk_lean: "profile.mode.bulkLean",
    bulk_normal: "profile.mode.bulkNormal", bulk_aggressive: "profile.mode.bulkAggressive",
    maintain: "profile.mode.maintain", custom: "profile.mode.custom",
  };
  const modeLabelI18n = modeSettings ? t(MODE_LABEL_KEY[modeSettings.mode] as any) : "";

  useEffect(() => {
    if (profile) {
      loadPearson(); loadTrend();
      if (advGoalConfirmed && advGoalCfg) loadAdvChart(advGoalCfg, advVarCards, 1);
      if (adv2GoalConfirmed && adv2GoalCfg) loadAdvChart(adv2GoalCfg, adv2VarCards, 2);
    }
  }, [profile, days, modeCustom, customRange]);

  // Init new adv config from persisted modeSettings
  useEffect(() => {
    if (!modeSettings) return;
    // Slot 1
    if (modeSettings.adv_goal_type === "custom_v2" && modeSettings.adv_goal_config) {
      try {
        const gc = JSON.parse(modeSettings.adv_goal_config);
        setAdvGoalCfg({ type: gc.type, metric: gc.metric, exerciseName: gc.exerciseName });
        setAdvGoalDir(gc.direction ?? "up");
        setAdvGoalConfirmed(true);
      } catch { }
    }
    if (modeSettings.adv_goal_type === "custom_v2" && modeSettings.adv_stat_variables) {
      try {
        const vars = JSON.parse(modeSettings.adv_stat_variables);
        if (Array.isArray(vars) && vars.length > 0 && typeof vars[0] === "object" && vars[0].type) {
          setAdvVarCards(vars.map((v: any) => ({
            id: v.id ?? Math.random().toString(36).slice(2),
            cfg: { type: v.type, metric: v.metric, exerciseName: v.exerciseName },
            confirmed: true,
            open: false,
          })));
        }
      } catch { }
    }
    // Slot 2
    if (modeSettings.adv2_goal_config) {
      try {
        const gc = JSON.parse(modeSettings.adv2_goal_config);
        setAdv2GoalCfg({ type: gc.type, metric: gc.metric, exerciseName: gc.exerciseName });
        setAdv2GoalDir(gc.direction ?? "up");
        setAdv2GoalConfirmed(true);
      } catch { }
    }
    if (modeSettings.adv2_stat_variables) {
      try {
        const vars = JSON.parse(modeSettings.adv2_stat_variables);
        if (Array.isArray(vars) && vars.length > 0 && typeof vars[0] === "object" && vars[0].type) {
          setAdv2VarCards(vars.map((v: any) => ({
            id: v.id ?? Math.random().toString(36).slice(2),
            cfg: { type: v.type, metric: v.metric, exerciseName: v.exerciseName },
            confirmed: true,
            open: false,
          })));
        }
      } catch { }
    }
  }, [modeSettings?.id]);

  useEffect(() => {
    if (showCustom && profile) loadActiveDates();
  }, [showCustom, profile]);

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadActiveDates = async () => {
    if (!profile) return;
    try {
      setActiveDates(await getActiveDates(profile.user_id, ["meal", "exercise", "weight", "body"]));
    } catch (e) { logError("Statistics.loadActiveDates", e); }
  };

  const loadPearson = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { from, to } = getFromTo();
      const recs = await getDailyStatsRecords(profile.user_id, days, from, to);
      const withWeight = recs.filter((r: DailyStatsRecord) => r.weight_kg != null).length;
      setDaysWithData(withWeight);

      const sleepCount = recs.filter((r: DailyStatsRecord) => r.sleep_quality != null).length;
      const includeSleep = sleepCount >= STATS_MIN_DAYS;

      const pearsonRecs = recs.map((r: DailyStatsRecord) => ({
        date:               r.date,
        weight_kg:          r.weight_kg          ?? undefined,
        calories_kcal:      r.calories           ?? undefined,
        protein_g:          r.protein_g          ?? undefined,
        carb_g:             r.carb_g             ?? undefined,
        fat_g:              r.fat_g              ?? undefined,
        water_ml:           r.water_ml           ?? undefined,
        exercise_count:     r.exercise_count     ?? undefined,
        exercise_min:       r.exercise_min       ?? undefined,
        exercise_kcal:      r.exercise_kcal      ?? undefined,
        strength_volume_kg: r.strength_volume_kg ?? undefined,
        ...(includeSleep && {
          sleep_quality: r.sleep_quality ?? undefined,
          sleep_hours:   r.sleep_hours   ?? undefined,
        }),
      }));
      const computed = computeInfluenceRanking(pearsonRecs, undefined, 9, STATS_MIN_DAYS) ?? [];
      const resultMap = new Map(computed.map(r => [r.factor, r]));

      const ALL_FACTORS: Factor[] = [
        "calories_kcal", "protein_g", "carb_g", "fat_g", "water_ml",
        "exercise_count", "exercise_min", "exercise_kcal", "strength_volume_kg",
      ];
      const bFactors = ALL_FACTORS.map(factor => {
        const count = pearsonRecs.filter(r => (r as any)[factor] != null).length;
        const density = rangeTotal > 0 ? Math.round((count / rangeTotal) * 100) : 0;
        const res = resultMap.get(factor);
        return {
          factor,
          label: lang === "en" ? (FACTOR_LABELS_EN[factor] ?? factor) : (FACTOR_LABELS[factor] ?? factor),
          r: res?.r ?? null,
          density,
        };
      });
      setBasicFactors(bFactors);
    } catch (e) { logError("Statistics.loadPearson", e); }
    setLoading(false);
  };

  const loadTrend = async () => {
    if (!profile) return;
    setPatternsLoading(true);
    try {
      const { from, to } = getFromTo();
      const recs = await getDailyStatsRecords(profile.user_id, days, from, to);
      const allDates = buildDateRangePure(from, to);
      const rangeLen = Math.max(1, allDates.length);

      // ── Raw maps ──────────────────────────────────────────────────────────
      const weightRaw = new Map(recs.filter(r => r.weight_kg  != null).map(r => [r.date, r.weight_kg!]));
      const sleepRaw  = new Map(recs.filter(r => r.sleep_hours != null).map(r => [r.date, r.sleep_hours!]));
      const calRaw    = new Map(recs.filter(r => r.calories    != null).map(r => [r.date, r.calories!]));

      // ── Z-score normalize ─────────────────────────────────────────────────
      const wZ = zScoreMap(weightRaw);
      const sZ = zScoreMap(sleepRaw);
      const cZ = zScoreMap(calRaw);

      // ── Chart points ──────────────────────────────────────────────────────
      const chartPoints = allDates.map(date => ({
        date,
        w: wZ.get(date) ?? null,
        s: sZ.get(date) ?? null,
        c: cZ.get(date) ?? null,
        wRaw: weightRaw.get(date) ?? null,
        sRaw: sleepRaw.get(date)  ?? null,
        cRaw: calRaw.get(date)    ?? null,
      }));

      // ── Current trend slope ───────────────────────────────────────────────
      const slopeWindow = Math.min(14, Math.max(7, Math.floor(rangeLen / 4)));
      const threshold   = adaptiveThreshold(rangeLen);
      const mkTrend = (zMap: Map<string, number>) => {
        const slope = currentSlope(zMap, allDates, slopeWindow);
        if (slope == null) return null;
        return { slope, significant: Math.abs(slope) >= threshold };
      };
      const trends = {
        weight:   mkTrend(wZ),
        sleep:    mkTrend(sZ),
        calories: mkTrend(cZ),
      };

      // ── Rolling change targets ─────────────────────────────────────────────
      const weightTargetMap   = rollingChangeMap(weightRaw, allDates);
      const sleepTargetMap    = rollingChangeMap(sleepRaw,  allDates);
      const calTargetMap      = rollingChangeMap(calRaw,    allDates);

      const buildRows = (
        targetMap: Map<string, number>,
        factors: { key: string; labelZh: string; labelEn: string }[],
      ): LagRow[] => {
        const rows = factors.map(({ key, labelZh, labelEn }) => {
          const fmap = new Map<string, number>();
          let nonNull = 0;
          for (const r of recs) {
            const v = (r as any)[key];
            if (v != null) { fmap.set(r.date, v as number); nonNull++; }
          }
          const results = lagCorrelation(fmap, targetMap, 7);
          const best = bestLag(results);
          return {
            factor: key,
            label: lang === "en" ? labelEn : labelZh,
            best,
            density:    Math.round((nonNull / rangeLen) * 100),
            sampleSize: best?.sampleSize ?? 0,
          };
        });
        return rows.sort((a, b) => (b.best ? Math.abs(b.best.r) : -1) - (a.best ? Math.abs(a.best.r) : -1));
      };

      const lagSections = [
        {
          targetLabel: lang === "zh" ? "→ 體重變化" : "→ Weight change",
          rows: buildRows(weightTargetMap, [
            { key: "calories",           labelZh: "攝取熱量", labelEn: "Calories"      },
            { key: "protein_g",          labelZh: "蛋白質",   labelEn: "Protein"       },
            { key: "water_ml",           labelZh: "飲水量",   labelEn: "Water"         },
            { key: "sleep_hours",        labelZh: "睡眠時長", labelEn: "Sleep"         },
            { key: "exercise_kcal",      labelZh: "運動消耗", labelEn: "Exercise burn" },
            { key: "strength_volume_kg", labelZh: "重訓總量", labelEn: "Strength vol." },
          ]),
        },
        {
          targetLabel: lang === "zh" ? "→ 睡眠變化" : "→ Sleep change",
          rows: buildRows(sleepTargetMap, [
            { key: "weight_kg",     labelZh: "體重",     labelEn: "Weight"        },
            { key: "calories",      labelZh: "攝取熱量", labelEn: "Calories"      },
            { key: "water_ml",      labelZh: "飲水量",   labelEn: "Water"         },
            { key: "exercise_kcal", labelZh: "運動消耗", labelEn: "Exercise burn" },
            { key: "protein_g",     labelZh: "蛋白質",   labelEn: "Protein"       },
          ]),
        },
        {
          targetLabel: lang === "zh" ? "→ 熱量變化" : "→ Calorie change",
          rows: buildRows(calTargetMap, [
            { key: "weight_kg",          labelZh: "體重",     labelEn: "Weight"        },
            { key: "sleep_hours",        labelZh: "睡眠時長", labelEn: "Sleep"         },
            { key: "exercise_kcal",      labelZh: "運動消耗", labelEn: "Exercise burn" },
            { key: "water_ml",           labelZh: "飲水量",   labelEn: "Water"         },
            { key: "strength_volume_kg", labelZh: "重訓總量", labelEn: "Strength vol." },
          ]),
        },
      ];

      setTrendData({ chartPoints, trends, lagSections });
    } catch (e) { logError("Statistics.loadTrend", e); }
    setPatternsLoading(false);
  };

  // ── New advanced: query a MetricCfg over date range ─────────────────────────
  const queryCustomMetric = async (cfg: MetricCfg, from: string, to: string): Promise<{ date: string; value: number }[]> => {
    if (!profile) return [];
    try {
      const db = await getDb();
      if (cfg.type === "strength") {
        // body_part filter (new priority selection); exercise remains optional
        const bpFilter = cfg.bodyPart    ? " AND ss.body_part=?"      : "";
        const bpP      = cfg.bodyPart    ? [cfg.bodyPart]             : [];
        const exFilter = cfg.exerciseName ? " AND ss.exercise_name=?" : "";
        const exP      = cfg.exerciseName ? [cfg.exerciseName]        : [];
        const extra    = bpFilter + exFilter;
        const extraP   = [...bpP, ...exP];
        if (cfg.metric === "max_weight") {
          return await db.select(`SELECT ss.log_date as date, MAX(st.weight_kg) as value FROM strength_session ss JOIN strength_set st ON st.session_id=ss.id WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ?${extra} GROUP BY ss.log_date ORDER BY ss.log_date`, [profile.user_id, from, to, ...extraP]);
        } else if (cfg.metric === "total_volume") {
          return await db.select(`SELECT ss.log_date as date, ROUND(SUM(st.weight_kg*st.reps),1) as value FROM strength_session ss JOIN strength_set st ON st.session_id=ss.id WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ?${extra} GROUP BY ss.log_date ORDER BY ss.log_date`, [profile.user_id, from, to, ...extraP]);
        } else {
          // total_reps — kept for backward-compat with existing saved configs
          return await db.select(`SELECT ss.log_date as date, SUM(st.reps) as value FROM strength_session ss JOIN strength_set st ON st.session_id=ss.id WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ?${extra} GROUP BY ss.log_date ORDER BY ss.log_date`, [profile.user_id, from, to, ...extraP]);
        }
      } else if (cfg.type === "cardio") {
        const sub = cfg.exerciseName ?? "running";
        const nameLike = sub === "swimming" ? CARDIO_SWIM_LIKE
                       : sub === "cycling"  ? CARDIO_CYCLE_LIKE
                       : CARDIO_RUN_LIKE;
        // Combine generic cardio (exercise_log, matched by name) with structured
        // cardio (running_session/interval, matched by cardio_type) so every
        // metric reflects ALL of this cardio type's data.
        const rows = await db.select<{ date: string; kcal: number; mins: number; km: number }[]>(
          `SELECT date, ROUND(SUM(kcal),1) as kcal, SUM(mins) as mins, ROUND(SUM(km),2) as km FROM (
             SELECT log_date as date,
               COALESCE(SUM(calories_burned),0) as kcal,
               COALESCE(SUM(duration_min),0) as mins,
               COALESCE(SUM(mets * duration_min / 60.0),0) as km
             FROM exercise_log
             WHERE user_id=? AND log_date BETWEEN ? AND ? AND ${nameLike} GROUP BY log_date
             UNION ALL
             SELECT log_date as date, COALESCE(SUM(calories_burned),0) as kcal, 0 as mins, 0 as km
             FROM running_session
             WHERE user_id=? AND log_date BETWEEN ? AND ? AND COALESCE(cardio_type,'running')=? GROUP BY log_date
             UNION ALL
             SELECT rs.log_date as date, 0 as kcal,
               COALESCE(SUM(ri.duration_min),0) as mins, COALESCE(SUM(ri.distance_km),0) as km
             FROM running_session rs JOIN running_interval ri ON ri.session_id=rs.id
             WHERE rs.user_id=? AND rs.log_date BETWEEN ? AND ? AND COALESCE(rs.cardio_type,'running')=? GROUP BY rs.log_date
           ) GROUP BY date ORDER BY date`,
          [profile.user_id, from, to, profile.user_id, from, to, sub, profile.user_id, from, to, sub]);
        const pick = (r: { kcal: number; mins: number; km: number }) =>
          cfg.metric === "distance_km"  ? r.km
          : cfg.metric === "duration_min" ? r.mins
          : cfg.metric === "avg_speed"    ? (r.mins > 0 ? Math.round((r.km / (r.mins / 60)) * 100) / 100 : 0)
          : r.kcal; // calories_burned (default)
        return rows.map(r => ({ date: r.date, value: pick(r) }));
      } else if (cfg.type === "body") {
        if (cfg.metric === "weight_kg") {
          return await db.select(
            `SELECT log_date as date, AVG(weight_kg) as value FROM weight_log
             WHERE user_id=? AND log_date BETWEEN ? AND ?
             GROUP BY log_date ORDER BY log_date`,
            [profile.user_id, from, to]);
        } else if (cfg.metric === "water_ml") {
          return await db.select(
            `SELECT log_date as date, COALESCE(SUM(amount_ml), 0) as value FROM water_log
             WHERE user_id=? AND log_date BETWEEN ? AND ?
             GROUP BY log_date ORDER BY log_date`,
            [profile.user_id, from, to]);
        } else {
          // sleep_hours
          return await db.select(
            `SELECT sleep_date as date, AVG(duration_hours) as value FROM sleep_log
             WHERE user_id=? AND sleep_date BETWEEN ? AND ? AND duration_hours IS NOT NULL
             GROUP BY sleep_date ORDER BY sleep_date`,
            [profile.user_id, from, to]);
        }
      } else if (cfg.type === "diet") {
        const colMap: Record<string, string> = {
          total_calories: "fd.calories_kcal",
          carbs_g:        "fd.carbohydrates_g",
          protein_g:      "fd.protein_g",
          fat_g:          "fd.fat_g",
        };
        const col = colMap[cfg.metric] ?? "fd.calories_kcal";
        return await db.select(
          `SELECT ml.log_date as date, ROUND(SUM(ml.quantity / fd.base_quantity * ${col}), 1) as value
           FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
           WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
           GROUP BY ml.log_date ORDER BY ml.log_date`,
          [profile.user_id, from, to]);
      } else if (cfg.type === "burn") {
        // Total exercise burn = generic (exercise_log) + structured cardio
        // (running_session) + strength estimate (5 MET, 3 min/set).
        const wt = profile.weight_kg || 70;
        return await db.select(
          `SELECT date, ROUND(SUM(kcal), 1) as value FROM (
             SELECT log_date as date, COALESCE(SUM(calories_burned), 0) as kcal
             FROM exercise_log WHERE user_id=? AND log_date BETWEEN ? AND ? GROUP BY log_date
             UNION ALL
             SELECT log_date as date, COALESCE(SUM(calories_burned), 0) as kcal
             FROM running_session WHERE user_id=? AND log_date BETWEEN ? AND ? GROUP BY log_date
             UNION ALL
             SELECT ss.log_date as date, (5.0 * ? * 3.0 / 60.0 * COUNT(st.id)) as kcal
             FROM strength_session ss JOIN strength_set st ON st.session_id=ss.id
             WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ? GROUP BY ss.log_date
           ) GROUP BY date ORDER BY date`,
          [profile.user_id, from, to, profile.user_id, from, to, wt, profile.user_id, from, to]);
      } else {
        // other
        if (cfg.metric === "calories_burned") {
          return await db.select(`SELECT log_date as date, ROUND(SUM(calories_burned),1) as value FROM exercise_log WHERE user_id=? AND log_date BETWEEN ? AND ? GROUP BY log_date ORDER BY log_date`, [profile.user_id, from, to]);
        } else {
          return await db.select(`SELECT log_date as date, SUM(duration_min) as value FROM exercise_log WHERE user_id=? AND log_date BETWEEN ? AND ? GROUP BY log_date ORDER BY log_date`, [profile.user_id, from, to]);
        }
      }
    } catch { return []; }
  };

  const loadAdvChart = async (goal: MetricCfg, vars: VarCard[], slot: 1 | 2 = 1) => {
    if (!profile) return;
    setAdvChartLoading(true);
    const setPearson  = slot === 1 ? setAdvPearsonResults  : setAdv2PearsonResults;
    const setDensity  = slot === 1 ? setAdvGoalDensity     : setAdv2GoalDensity;
    try {
      const { from, to } = getFromTo();
      const confirmedVars = vars.filter(v => v.confirmed && v.cfg);
      const allCfgs: { id: string; cfg: MetricCfg }[] = [
        { id: "__goal__", cfg: goal },
        ...confirmedVars.map(v => ({ id: v.id, cfg: v.cfg! })),
      ];
      const rawRows: Record<string, { date: string; value: number }[]> = {};
      for (const { id, cfg } of allCfgs) {
        rawRows[id] = await queryCustomMetric(cfg, from, to);
      }
      const goalValues = rawRows["__goal__"].map(r => r.value);
      const pearsonMap: Record<string, { r: number | null; density: number; reliability: Reliability }> = {};
      for (const v of confirmedVars) {
        const varValues = rawRows[v.id].map(r => r.value);
        const res = computePearsonAligned(goalValues, varValues);
        pearsonMap[v.id] = {
          r: res?.r ?? null,
          reliability: res?.reliability ?? 'insufficient',
          density: rangeTotal > 0 ? Math.round((rawRows[v.id].length / rangeTotal) * 100) : 0,
        };
      }
      setPearson(pearsonMap);
      setDensity(rangeTotal > 0 ? Math.round((rawRows["__goal__"].length / rangeTotal) * 100) : 0);
    } catch (e) { logError("Statistics.loadAdvChart", e); }
    setAdvChartLoading(false);
  };

  const saveAdvGoal = async (cfg: MetricCfg, dir: "up" | "down", vars: VarCard[], slot: 1 | 2 = 1) => {
    const confirmedVars = vars.filter(v => v.confirmed && v.cfg);
    if (slot === 1) {
      await patchAdvConfig(
        "custom_v2",
        JSON.stringify({ ...cfg, direction: dir }),
        JSON.stringify(confirmedVars.map(v => ({ id: v.id, ...v.cfg }))),
      );
    } else {
      await patchAdv2Config(
        JSON.stringify({ ...cfg, direction: dir }),
        JSON.stringify(confirmedVars.map(v => ({ id: v.id, ...v.cfg }))),
      );
    }
  };

  // ── Advanced stats helpers — slot 1 ──────────────────────────────────────────

  const addVarCard = () => {
    if (advVarCards.length >= 5) return;
    setAdvVarCards(prev => [...prev, { id: Math.random().toString(36).slice(2), cfg: null, confirmed: false, open: true }]);
  };
  const removeVarCard = (id: string) => setAdvVarCards(prev => prev.filter(v => v.id !== id));
  const confirmVar = (id: string, cfg: MetricCfg) => {
    const updated = advVarCards.map(v => v.id === id ? { ...v, cfg, confirmed: true, open: false } : v);
    setAdvVarCards(updated);
    if (advGoalCfg && advGoalConfirmed) { saveAdvGoal(advGoalCfg, advGoalDir, updated, 1); loadAdvChart(advGoalCfg, updated, 1); }
  };
  const confirmGoal = (cfg: MetricCfg) => {
    setAdvGoalCfg(cfg); setAdvGoalConfirmed(true); setAdvGoalOpen(false);
    saveAdvGoal(cfg, advGoalDir, advVarCards, 1); loadAdvChart(cfg, advVarCards, 1);
  };
  const updateDir = (dir: "up" | "down") => {
    setAdvGoalDir(dir);
    if (advGoalCfg && advGoalConfirmed) saveAdvGoal(advGoalCfg, dir, advVarCards, 1);
  };

  // ── Advanced stats helpers — slot 2 ──────────────────────────────────────────

  const addVar2Card = () => {
    if (adv2VarCards.length >= 5) return;
    setAdv2VarCards(prev => [...prev, { id: Math.random().toString(36).slice(2), cfg: null, confirmed: false, open: true }]);
  };
  const removeVar2Card = (id: string) => setAdv2VarCards(prev => prev.filter(v => v.id !== id));
  const confirmVar2 = (id: string, cfg: MetricCfg) => {
    const updated = adv2VarCards.map(v => v.id === id ? { ...v, cfg, confirmed: true, open: false } : v);
    setAdv2VarCards(updated);
    if (adv2GoalCfg && adv2GoalConfirmed) { saveAdvGoal(adv2GoalCfg, adv2GoalDir, updated, 2); loadAdvChart(adv2GoalCfg, updated, 2); }
  };
  const confirmGoal2 = (cfg: MetricCfg) => {
    setAdv2GoalCfg(cfg); setAdv2GoalConfirmed(true); setAdv2GoalOpen(false);
    saveAdvGoal(cfg, adv2GoalDir, adv2VarCards, 2); loadAdvChart(cfg, adv2VarCards, 2);
  };
  const updateDir2 = (dir: "up" | "down") => {
    setAdv2GoalDir(dir);
    if (adv2GoalCfg && adv2GoalConfirmed) saveAdvGoal(adv2GoalCfg, dir, adv2VarCards, 2);
  };

  const renderAdvancedStats = (slot: 1 | 2 = 1) => {
    const { from, to } = getFromTo();
    const goalCfg       = slot === 1 ? advGoalCfg       : adv2GoalCfg;
    const goalDir       = slot === 1 ? advGoalDir       : adv2GoalDir;
    const goalOpen      = slot === 1 ? advGoalOpen      : adv2GoalOpen;
    const goalConfirmed = slot === 1 ? advGoalConfirmed : adv2GoalConfirmed;
    const varCards      = slot === 1 ? advVarCards      : adv2VarCards;
    const pearsonResults= slot === 1 ? advPearsonResults: adv2PearsonResults;
    const goalDensity   = slot === 1 ? advGoalDensity   : adv2GoalDensity;
    const onSetGoalOpen = slot === 1 ? setAdvGoalOpen   : setAdv2GoalOpen;
    const onSetVarCards = slot === 1 ? setAdvVarCards   : setAdv2VarCards;
    const onAddVar      = slot === 1 ? addVarCard       : addVar2Card;
    const onRemoveVar   = slot === 1 ? removeVarCard    : removeVar2Card;
    const onConfirmGoal = slot === 1 ? confirmGoal      : confirmGoal2;
    const onUpdateDir   = slot === 1 ? updateDir        : updateDir2;
    const confirmedVars = varCards.filter(v => v.confirmed && v.cfg);

    return (
      <div className="space-y-4">

        {/* ── GOAL SECTION ───────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[var(--text-on-surface)] flex items-center gap-1.5">
              <Target size={14} className="text-[var(--text-accent)]" />
              {lang === "zh" ? "觀察目標" : "Goal"}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-on-surface-muted)]">
                {lang === "zh" ? `最低須該區間 ${STATS_MIN_DAYS} 天有效資料` : `Min. ${STATS_MIN_DAYS} days of data required`}
              </span>
              {goalConfirmed && !goalOpen && (
                <button
                  onClick={() => onSetGoalOpen(true)}
                  className="p-1.5 text-gray-400 hover:text-yellow-500 transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          </div>

          {goalConfirmed && !goalOpen && goalCfg ? (
            <div className={clsx(
              "flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--surface-container-low)] border border-[var(--surface-border)]",
              goalDensity < 50 && "opacity-50"
            )}>
              <div className="w-2 h-2 rounded-full bg-[var(--text-accent)] shrink-0" />
              <p className="flex-1 text-sm font-semibold text-[var(--text-on-surface)] truncate">
                {metricLabel(goalCfg, lang)}
              </p>
              <button
                onClick={() => onUpdateDir(goalDir === "up" ? "down" : "up")}
                className="p-1 transition-opacity hover:opacity-60"
              >
                <span style={{
                  display: "inline-block",
                  transform: goalDir === "up" ? "rotate(-90deg)" : "rotate(90deg)",
                  color: goalDir === "up" ? "#10b981" : "#ef4444",
                  fontWeight: "bold",
                  fontSize: "20px",
                  lineHeight: 1,
                }}>»</span>
              </button>
              {(() => {
                const dc = densityColor(goalDensity);
                const dcClx = dc === "green" ? "text-green-500" : dc === "yellow" ? "text-amber-400" : "text-red-400";
                return (
                  <div className="flex items-baseline gap-0.5 shrink-0">
                    <span className="text-[9px] text-[var(--text-on-surface-muted)] leading-none">
                      {lang === "zh" ? "資料密度" : "Density"}:
                    </span>
                    <span className={clsx("text-sm font-bold leading-none ml-0.5", dcClx)}>{goalDensity}%</span>
                  </div>
                );
              })()}
            </div>
          ) : (
            <MetricPicker
              userId={profile!.user_id}
              from={from} to={to}
              value={goalCfg}
              onConfirm={onConfirmGoal}
              onCancel={goalConfirmed ? () => onSetGoalOpen(false) : undefined}
              showDirection
              direction={goalDir}
              onDirectionChange={onUpdateDir}
              excludeKeys={[]}
              lang={lang}
            />
          )}
        </div>

        {/* ── PEARSON BAR CHART ───────────────────────────────────────── */}
        {goalConfirmed && confirmedVars.length > 0 && (() => {
          const chartData = confirmedVars
            .map(v => ({
              label: metricLabel(v.cfg!, lang),
              r: pearsonResults[v.id]?.r ?? null,
              dir: goalDir,
            }))
            .filter(d => d.r !== null)
            .sort((a, b) => Math.abs(b.r!) - Math.abs(a.r!));
          if (chartData.length === 0) return null;
          return <PearsonBarChart data={chartData} lang={lang}
            colorFor={d => (d as any).dir === "up" ? (d.r ?? 0) > 0 : (d.r ?? 0) < 0} />;
        })()}

        {/* ── VARIABLES SECTION ───────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--text-on-bg)]">
              {lang === "zh" ? "變數" : "Variables"}
              <span className="ml-1.5 text-xs font-normal text-[var(--text-on-bg)]">
                {confirmedVars.length}/5
              </span>
            </p>
            {varCards.length < 5 && (
              <button
                onClick={onAddVar}
                className="btn-primary flex items-center gap-1 text-xs"
              >
                <Plus size={12} />
                {lang === "zh" ? "新增觀察對象" : "Add variable"}
              </button>
            )}
          </div>

          {varCards.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-sm text-[var(--text-on-surface-muted)]">
                {lang === "zh" ? "點擊「新增觀察對象」加入要觀察的指標" : "Click \"Add variable\" to add metrics to observe"}
              </p>
            </div>
          )}

          {/* Confirmed cards — insight style, sorted by |r| desc */}
          {(() => {
            const confirmed = varCards.filter(v => v.confirmed && !v.open && v.cfg);
            const sorted = [...confirmed].sort((a, b) => {
              const ra = Math.abs(pearsonResults[a.id]?.r ?? 0);
              const rb = Math.abs(pearsonResults[b.id]?.r ?? 0);
              const na = pearsonResults[a.id]?.r == null;
              const nb = pearsonResults[b.id]?.r == null;
              if (na && nb) return 0;
              if (na) return 1;
              if (nb) return -1;
              return rb - ra;
            });
            return sorted.map((card) => {
              const stat = pearsonResults[card.id];
              const r = stat?.r ?? null;
              const density = stat?.density ?? 0;
              const reliability: Reliability = stat?.reliability ?? 'insufficient';
              const reliabilityBadge =
                r === null ? null
                : reliability === 'low'    ? (lang === "zh" ? "樣本較少" : "Low sample")
                : reliability === 'medium' ? (lang === "zh" ? "中可信度" : "Moderate")
                : null;
              const isGood = r === null ? false : goalDir === "up" ? r > 0 : r < 0;
              const abs = r !== null ? Math.abs(r) : 0;
              const strength = abs > 0.5 ? (lang === "zh" ? "強" : "strong") : abs > 0.3 ? (lang === "zh" ? "中等" : "moderate") : (lang === "zh" ? "輕微" : "weak");
              const insight = r === null
                ? (lang === "zh" ? `資料密度 ${density}% 資料不足` : `Density ${density}% – Insufficient data`)
                : abs <= 0.1 ? (lang === "zh" ? "與目標無明顯相關" : "No clear correlation")
                : isGood ? `${lang === "zh" ? "與目標正向相關" : "Positively correlated"}（${strength}）`
                : `${lang === "zh" ? "可能影響目標" : "May affect goal"}（${strength}）`;
              const dc = densityColor(density);
              const dcClx = dc === "green" ? "text-green-500" : dc === "yellow" ? "text-amber-400" : "text-red-400";
              return (
                <FactorInsightCard key={card.id} label={metricLabel(card.cfg!, lang)} r={r} density={density}
                  isGood={isGood} insight={insight} dcClx={dcClx} lang={lang} reliabilityBadge={reliabilityBadge}
                  onEdit={() => onSetVarCards(prev => prev.map(v => v.id === card.id ? { ...v, open: true } : v))}
                  onRemove={() => {
                    onRemoveVar(card.id);
                    if (goalCfg && goalConfirmed) {
                      const remaining = varCards.filter(v => v.id !== card.id);
                      saveAdvGoal(goalCfg, goalDir, remaining, slot);
                      loadAdvChart(goalCfg, remaining, slot);
                    }
                  }} />
              );
            });
          })()}

        </div>

      </div>
    );
  };

  if (!profile) return <NoProfile />;

  return (
    <>
    <div className="page-body max-w-2xl mx-auto space-y-5 pb-36 md:pb-6" {...statSwipe}>
      {/* Sticky header */}
      <StickyHeader spaceY>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-on-bg)]">{t("stats.title")}</h1>
            <p className="text-[var(--text-on-bg-muted)] font-bold text-sm mt-0.5">
              {modeCustom && customRange.start && customRange.end
                ? `${format(new Date(customRange.start), "M/d")} — ${format(new Date(customRange.end), "M/d")}`
                : (lang === "zh" ? `近 ${dStr(days)}` : `Last ${dStr(days)}`)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { loadPearson(); loadTrend(); }} disabled={loading || patternsLoading}
              className={clsx("p-2 rounded-xl transition-all border border-white/30 text-white bg-white/10",
                (loading || patternsLoading) ? "animate-spin opacity-40 cursor-wait" : "hover:bg-white/20")}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <DateRangePills
          days={days} modeCustom={modeCustom} showCustom={showCustom}
          onSelectPreset={selectPreset}
          onToggleCustom={() => setShowCustom(v => !v)}
          pillPx="px-2.5"
        />
      </StickyHeader>

      {showCustom && (
        <DateRangePickerCard
          customRange={customRange} activeDates={activeDates}
          onRangeChange={r => { setCustomRange(r); setModeCustom(!!(r.start && r.end)); }}
          onApply={() => setShowCustom(false)}
          titleKey="stats.pickRange"
          pickStartKey="stats.pickStart"
          pickEndKey="stats.pickEnd"
          applyKey="stats.applyRange"
        />
      )}

      {/* Tabs */}
      <div className="pill-bar">
        <PillButton onClick={() => setActiveTab("pearson")} isActive={activeTab === "pearson"}
          className="flex-1 py-2 text-sm">
          {modeSettings?.mode === "custom"
            ? (lang === "zh" ? "進階" : "Adv.")
            : (lang === "zh" ? "基礎" : "Basic")}
        </PillButton>
        <PillButton onClick={() => setActiveTab("advanced")} isActive={activeTab === "advanced"}
          className="flex-1 py-2 text-sm flex items-center justify-center gap-1">
          {modeSettings?.mode === "custom"
            ? (lang === "zh" ? "進階2" : "Adv.2")
            : t("stats.tab.advanced")}
        </PillButton>
        <PillButton onClick={() => setActiveTab("patterns")} isActive={activeTab === "patterns"}
          className="flex-1 py-2 text-sm">
          {lang === "zh" ? "規律" : "Patterns"}
        </PillButton>
      </div>

      {/* ── Compact mode badge — visible on all tabs ─────────────────────── */}
      {modeInfo && modeSettings && (
        <div className={clsx(
          "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold",
          modeInfo.accentBg, modeInfo.accentText,
        )}>
          <BarChart2 size={11} />
          <span>{lang === "zh" ? "模式" : "Mode"}</span>
          <span className="opacity-40">{">>"}</span>
          <span>{modeLabelI18n}</span>
          <span className="opacity-40">{">>"}</span>
          {goalMode === "cut"
            ? <span style={{ display: "inline-block", transform: "rotate(90deg)",  color: "#ef4444", fontWeight: "bold", fontSize: "18px", lineHeight: 1 }}>»</span>
            : goalMode === "bulk"
            ? <span style={{ display: "inline-block", transform: "rotate(-90deg)", color: "#10b981", fontWeight: "bold", fontSize: "18px", lineHeight: 1 }}>»</span>
            : modeSettings.mode === "custom"
            ? <User size={18} />
            : <span style={{ display: "inline-block", transform: "rotate(0deg)", color: "#9ca3af", fontWeight: "bold", fontSize: "18px", lineHeight: 1 }}>»</span>}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: 體重影響因子 (Pearson)
          — when mode is "custom", show advanced stats instead
      ══════════════════════════════════════════ */}
      {activeTab === "pearson" && modeSettings?.mode === "custom" && renderAdvancedStats(1)}

      {activeTab === "pearson" && modeSettings?.mode !== "custom" && (
        <div className="space-y-4">
          {/* ── Fixed weight goal card ─────────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-[var(--text-on-surface)] flex items-center gap-1.5">
                <Target size={14} className="text-[var(--text-accent)]" />
                {lang === "zh" ? "觀察目標" : "Goal"}
              </p>
              <span className="text-[10px] text-[var(--text-on-surface-muted)]">
                {lang === "zh" ? `最低須該區間 ${STATS_MIN_DAYS} 天有效資料` : `Min. ${STATS_MIN_DAYS} days of data required`}
              </span>
            </div>
            {(() => {
              const wDensity = rangeTotal > 0 ? Math.round((daysWithData / rangeTotal) * 100) : 0;
              const dc = densityColor(wDensity);
              const dcClx = dc === "green" ? "text-green-500" : dc === "yellow" ? "text-amber-400" : "text-red-400";
              const daysUntilUnlock = Math.max(0, RELIABILITY_THRESHOLDS.MIN_PAIRS - daysWithData);
              return (
                <>
                  <div className={clsx(
                    "flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--surface-container-low)] border border-[var(--surface-border)]",
                    dc === "red" && "opacity-50"
                  )}>
                    <div className="w-2 h-2 rounded-full bg-[var(--text-accent)] shrink-0" />
                    <p className="flex-1 text-sm font-semibold text-[var(--text-on-surface)] truncate">
                      {lang === "zh" ? "體重 (kg)" : "Weight (kg)"}
                    </p>
                    <span style={{
                      display: "inline-block",
                      transform: goalMode === "bulk" ? "rotate(-90deg)" : goalMode === "cut" ? "rotate(90deg)" : "rotate(0deg)",
                      color: goalMode === "bulk" ? "#10b981" : goalMode === "cut" ? "#ef4444" : "#9ca3af",
                      fontWeight: "bold",
                      fontSize: "20px",
                      lineHeight: 1,
                    }}>»</span>
                    <div className="flex items-baseline gap-0.5 shrink-0">
                      <span className="text-[9px] text-[var(--text-on-surface-muted)] leading-none">
                        {lang === "zh" ? "資料密度" : "Density"}:
                      </span>
                      <span className={clsx("text-sm font-bold leading-none ml-0.5", dcClx)}>{wDensity}%</span>
                    </div>
                  </div>
                  {daysUntilUnlock > 0 && (
                    <p className="text-[11px] text-amber-500 mt-2 font-medium">
                      {lang === "zh"
                        ? `再記錄 ${daysUntilUnlock} 天體重即可解鎖統計分析`
                        : `${daysUntilUnlock} more day(s) of weight logs to unlock analysis`}
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          {/* ── Correlation ranking chart ────────────────────────── */}
          {(() => {
            const chartData = [...basicFactors]
              .filter(f => f.r !== null)
              .sort((a, b) => Math.abs(b.r!) - Math.abs(a.r!));
            if (chartData.length === 0) return null;
            return <PearsonBarChart data={chartData} lang={lang}
              colorFor={d => goalMode === "cut" ? (d.r ?? 0) < 0
                : goalMode === "bulk" ? (d.r ?? 0) > 0
                : (d.r ?? 0) > 0} />;
          })()}

          {/* ── Factor cards (all 9, always shown) ─────────────────── */}
          <div className="space-y-3">
            {(() => {
              const sorted = [...basicFactors].sort((a, b) => {
                if (a.r === null && b.r === null) return 0;
                if (a.r === null) return 1;
                if (b.r === null) return -1;
                return Math.abs(b.r) - Math.abs(a.r);
              });
              return sorted.map(item => {
                const { r, density } = item;
                const isGood = r === null ? false
                  : goalMode === "cut" ? r < 0
                  : goalMode === "bulk" ? r > 0
                  : r > 0;
                const abs = r !== null ? Math.abs(r) : 0;
                const strength = abs > 0.5 ? (lang === "zh" ? "強" : "strong") : abs > 0.3 ? (lang === "zh" ? "中等" : "moderate") : (lang === "zh" ? "輕微" : "weak");
                const insight = r === null
                  ? (lang === "zh" ? `資料密度 ${density}% 資料不足` : `Density ${density}% – Insufficient data`)
                  : abs <= 0.1 ? (lang === "zh" ? "與體重變化無明顯相關" : "No clear correlation with weight")
                  : isGood ? `${lang === "zh" ? "有助達成目標" : "Supports your goal"}（${strength}）`
                  : `${lang === "zh" ? "可能影響目標" : "May affect goal"}（${strength}）`;
                const dc = densityColor(density);
                const dcClx = dc === "green" ? "text-green-500" : dc === "yellow" ? "text-amber-400" : "text-red-400";
                return <FactorInsightCard key={item.factor} label={item.label} r={r} density={density}
                  isGood={isGood} insight={insight} dcClx={dcClx} lang={lang} />;
              });
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: 規律 (Patterns) — Trend + Lag
      ══════════════════════════════════════════ */}
      {activeTab === "patterns" && (() => {
        if (!trendData) return (
          <div className="card text-center py-10">
            <p className="text-sm text-[var(--text-on-surface-muted)]">
              {patternsLoading
                ? (lang === "zh" ? "載入中…" : "Loading…")
                : (lang === "zh" ? "尚無資料" : "No data")}
            </p>
          </div>
        );

        const { chartPoints, trends, lagSections } = trendData;
        const xInterval = Math.max(6, Math.floor(rangeTotal / 7) - 1);

        // Trend symbol helper
        const trendSymbol = (t: { slope: number; significant: boolean } | null) => {
          if (!t) return { sym: "—", cls: "text-gray-400" };
          if (!t.significant) return { sym: "→", cls: "text-gray-400" };
          return t.slope > 0
            ? { sym: "↑", cls: "text-red-400" }    // weight up = bad for cut; use neutral red
            : { sym: "↓", cls: "text-emerald-500" };
        };
        const wSym = trendSymbol(trends.weight);
        const sSym = trendSymbol(trends.sleep);
        const cSym = trendSymbol(trends.calories);

        return (
          <div className="space-y-4">

            {/* ── Trend chart ───────────────────────────────────────────── */}
            <div className="card">
              <p className="text-xs text-[var(--text-on-surface-muted)] mb-3">
                {lang === "zh"
                  ? "Z-score 標準化 · 虛線為實際數值，空白為無記錄"
                  : "Z-score normalized · dashed = recorded, gap = no data"}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartPoints} margin={{ top: 4, right: 4, bottom: 0, left: -32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    interval={xInterval}
                    tickFormatter={d => format(new Date(d), "M/d")}
                    tick={{ fontSize: 10, fill: "var(--text-on-surface-muted)" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis hide />
                  <ReferenceLine y={0} stroke="var(--surface-border)" strokeDasharray="4 4" />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const pt = chartPoints.find(p => p.date === label);
                      if (!pt) return null;
                      return (
                        <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl px-3 py-2 text-xs shadow-lg space-y-0.5">
                          <p className="font-semibold text-[var(--text-on-surface)] mb-1">{label}</p>
                          {pt.wRaw != null && <p style={{ color: "#60a5fa" }}>{lang === "zh" ? "體重" : "Weight"}: {pt.wRaw.toFixed(1)} kg</p>}
                          {pt.sRaw != null && <p style={{ color: "#c084fc" }}>{lang === "zh" ? "睡眠" : "Sleep"}: {pt.sRaw.toFixed(1)} hr</p>}
                          {pt.cRaw != null && <p style={{ color: "#fb923c" }}>{lang === "zh" ? "熱量" : "Cal"}: {Math.round(pt.cRaw)} kcal</p>}
                        </div>
                      );
                    }}
                  />
                  <Line dataKey="w" stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} connectNulls={false} name={lang === "zh" ? "體重" : "Weight"} />
                  <Line dataKey="s" stroke="#c084fc" strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} connectNulls={false} name={lang === "zh" ? "睡眠" : "Sleep"} />
                  <Line dataKey="c" stroke="#fb923c" strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} connectNulls={false} name={lang === "zh" ? "熱量" : "Cal"} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── Trend chips ───────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: lang === "zh" ? "體重" : "Weight", color: "#60a5fa", sym: wSym },
                { label: lang === "zh" ? "睡眠" : "Sleep",  color: "#c084fc", sym: sSym },
                { label: lang === "zh" ? "熱量" : "Calories", color: "#fb923c", sym: cSym },
              ].map(({ label, color, sym }) => (
                <div key={label} className="card py-2.5 px-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs text-[var(--text-on-surface-muted)] truncate">{label}</span>
                  <span className={clsx("text-base font-bold ml-auto", sym.cls)}>{sym.sym}</span>
                </div>
              ))}
            </div>

            {/* ── Lag sections ─────────────────────────────────────────── */}
            {lagSections.map((section) => (
              <div key={section.targetLabel} className="card space-y-0 divide-y divide-[var(--surface-border)]">
                <p className="text-xs font-semibold text-[var(--text-on-surface)] pb-2">
                  {lang === "zh" ? "延遲影響" : "Lag Impact"}
                  <span className="ml-1.5 text-[var(--text-accent)]">{section.targetLabel}</span>
                  <span className="ml-1 font-normal text-[var(--text-on-surface-muted)]">(0–7d)</span>
                </p>
                {section.rows.map((row) => {
                  const r    = row.best?.r   ?? null;
                  const lag  = row.best?.lag ?? null;
                  const n    = row.sampleSize;
                  const dotClx = densityDotCls(row.density);
                  const sym  = r == null ? "—" : Math.abs(r) <= 0.1 ? "→" : r > 0 ? "↑" : "↓";
                  const rClx = r == null ? "text-gray-400" : r > 0.1 ? "text-red-400" : r < -0.1 ? "text-emerald-500" : "text-gray-400";
                  const lowR = r !== null && n < RELIABILITY_THRESHOLDS.MIN_PAIRS;
                  return (
                    <div key={row.factor} className={clsx("flex items-center gap-2 py-2", lowR && "opacity-60")}>
                      <p className="text-xs font-medium text-[var(--text-on-surface)] w-20 shrink-0 truncate">{row.label}</p>
                      <span className={clsx("text-base font-bold w-5 text-center shrink-0", rClx)}>{sym}</span>
                      <p className="text-[11px] text-[var(--text-on-surface-muted)] flex-1">
                        {r == null
                          ? (lang === "zh" ? "不足" : "n/a")
                          : lag === 0
                            ? (lang === "zh" ? "當天" : "same day")
                            : `lag ${lag}d`}
                        {r !== null && <span className="ml-1 text-gray-400">n={n}</span>}
                      </p>
                      {r !== null && (
                        <span className={clsx("text-xs font-mono font-bold shrink-0", rClx)}>
                          {r >= 0 ? "+" : ""}{r.toFixed(2)}
                        </span>
                      )}
                      <span className={clsx("text-base leading-none shrink-0", dotClx)}>●</span>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ── Density legend ────────────────────────────────────────── */}
            <div className="flex items-center gap-4 px-1 pb-1">
              <p className="text-[10px] text-white shrink-0">
                {lang === "zh" ? "資料密度" : "Data density"}:
              </p>
              {[
                { clx: "text-green-500",  label: lang === "zh" ? "≥80%" : "≥80%" },
                { clx: "text-amber-400",  label: lang === "zh" ? "50–79%" : "50–79%" },
                { clx: "text-red-400",    label: lang === "zh" ? "<50%" : "<50%" },
              ].map(({ clx, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <span className={clsx("text-xs leading-none", clx)}>●</span>
                  <span className="text-[10px] text-white">{label}</span>
                </div>
              ))}
            </div>

          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          TAB: 進階統計 (Advanced) — v2
      ══════════════════════════════════════════ */}
      {activeTab === "advanced" && renderAdvancedStats(modeSettings?.mode === "custom" ? 2 : 1)}
    </div>

    {/* ── MetricPicker bottom sheet modal (variable picker) — both slots ── */}
    {[
      ...advVarCards.filter(v => !v.confirmed || v.open).map(card => ({ card, slot: 1 as const })),
      ...adv2VarCards.filter(v => !v.confirmed || v.open).map(card => ({ card, slot: 2 as const })),
    ].map(({ card, slot }) => {
      const { from, to } = getFromTo();
      const slotCards   = slot === 1 ? advVarCards   : adv2VarCards;
      const slotGoalCfg = slot === 1 ? advGoalCfg    : adv2GoalCfg;
      const onClose     = slot === 1
        ? () => { if (card.confirmed) setAdvVarCards(prev => prev.map(v => v.id === card.id ? { ...v, open: false } : v)); else removeVarCard(card.id); }
        : () => { if (card.confirmed) setAdv2VarCards(prev => prev.map(v => v.id === card.id ? { ...v, open: false } : v)); else removeVar2Card(card.id); };
      const onConfirmCfg = slot === 1
        ? (cfg: MetricCfg) => confirmVar(card.id, cfg)
        : (cfg: MetricCfg) => confirmVar2(card.id, cfg);
      const onCancelCfg  = card.confirmed
        ? (slot === 1
          ? () => setAdvVarCards(prev => prev.map(v => v.id === card.id ? { ...v, open: false } : v))
          : () => setAdv2VarCards(prev => prev.map(v => v.id === card.id ? { ...v, open: false } : v)))
        : undefined;
      const goalKey = slotGoalCfg ? metricKey(slotGoalCfg) : null;
      const cardExclude = [
        ...(goalKey ? [goalKey] : []),
        ...slotCards.filter(v => v.id !== card.id && v.confirmed && v.cfg).map(v => metricKey(v.cfg!)),
      ];
      const globalIdx = slotCards.findIndex(v => v.id === card.id);
      return (
        <div key={`${slot}-${card.id}`} className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center pb-16 md:pb-4">
          <div className="bg-[var(--surface)] w-full max-w-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--surface-border)] shrink-0">
              <p className="text-sm font-semibold text-[var(--text-on-surface)]">
                {lang === "zh" ? `變數 ${globalIdx + 1}` : `Variable ${globalIdx + 1}`}
              </p>
              <button onClick={onClose} className="p-2 -mr-1 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <MetricPicker
                userId={profile!.user_id}
                from={from} to={to}
                value={card.cfg}
                onConfirm={onConfirmCfg}
                onCancel={onCancelCfg}
                excludeKeys={cardExclude}
                lang={lang}
              />
            </div>
          </div>
        </div>
      );
    })}
    </>
  );
}
