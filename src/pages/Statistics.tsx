import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import { format, parseISO } from "date-fns";
import { BarChart2, TrendingDown, TrendingUp, Minus, RefreshCw, Activity, Target, Pencil, Plus, X, User } from "lucide-react";
import { MetricPicker, metricKey, metricLabel, type MetricCfg } from "@/components/stats/MetricPicker";
import { MiniCalendar } from "@/components/common/MiniCalendar";
import { CHART_DATE_RANGES } from "@/constants";
import { subDays } from "date-fns";
import { clsx } from "clsx";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { useSwipeTabs } from "@/hooks/useSwipe";
import { getDailyStatsRecords, getActiveDates } from "@/lib/db/queries/stats";
import { getDb } from "@/lib/db";
import { computeInfluenceRanking, FACTOR_LABELS, FACTOR_LABELS_EN, type Factor } from "@/lib/statistics/pearson";
import { MODE_GOAL, MODE_META, STATS_MIN_DAYS } from "@/constants";
import type { DailyStatsRecord } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatTab = "pearson" | "body" | "advanced";

interface BodyPoint {
  date: string;
  body_fat: number | null;
  muscle: number | null;
  water: number | null;
  visceral: number | null;
}

interface AdvResult {
  varKey: string;
  label: string;
  r: number | null;        // null = insufficient paired data
  daysWithData: number;    // actual (non-interpolated) data days
  density: number;         // 0-100 percentage
  densityColor: "green" | "yellow" | "red";
}

// ─── Constants ────────────────────────────────────────────────────────────────



const fmtDate = (d: string) => format(parseISO(d), "M/d");

// ─── Helper: linear interpolation over a date-keyed map ────────────────────

function linearInterpolate(dataMap: Map<string, number>, allDates: string[]): Map<string, number> {
  const result = new Map<string, number>();
  const knownDates = [...dataMap.keys()].sort();
  if (knownDates.length === 0) return result;
  if (knownDates.length === 1) {
    result.set(knownDates[0], dataMap.get(knownDates[0])!);
    return result;
  }
  for (const date of allDates) {
    if (dataMap.has(date)) {
      result.set(date, dataMap.get(date)!);
      continue;
    }
    // Find nearest known surrounding dates
    let prev: string | undefined;
    let next: string | undefined;
    for (const kd of knownDates) {
      if (kd <= date) prev = kd;
      else if (!next) { next = kd; break; }
    }
    if (prev && next) {
      const pv = dataMap.get(prev)!;
      const nv = dataMap.get(next)!;
      const pt = new Date(prev).getTime();
      const nt = new Date(next).getTime();
      const dt = new Date(date).getTime();
      const t  = (dt - pt) / (nt - pt);
      result.set(date, pv + t * (nv - pv));
    } else if (prev) {
      result.set(date, dataMap.get(prev)!);
    } else if (next) {
      result.set(date, dataMap.get(next)!);
    }
  }
  return result;
}

function computePearsonAligned(
  goalPts: number[],
  varPts: number[],
  rangeDays: number,
): number | null {
  const threshold = rangeDays / 2;
  if (goalPts.length <= threshold || varPts.length <= threshold) return null;
  const nMin = Math.min(goalPts.length, varPts.length);
  // Always trim from head (oldest) of the larger series
  const g = goalPts.length > nMin ? goalPts.slice(goalPts.length - nMin) : goalPts;
  const v = varPts.length > nMin ? varPts.slice(varPts.length - nMin) : varPts;
  return pearsonFromArrays(g, v);
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

function buildDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const d = new Date(from);
  while (format(d, "yyyy-MM-dd") <= to) {
    dates.push(format(d, "yyyy-MM-dd"));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ─── Goal metric label (bilingual) ──────────────────────────────────────────

function getGoalMetricLabel(
  cfg: { category?: string; metric?: string; agg?: string },
  lang: string,
): string {
  const zh: Record<string, string> = {
    "distance_km":      "有氧距離 (km)",
    "duration_min":     "有氧時長 (min)",
    "avg_speed":        "平均速度 (km/h)",
    "max_weight":       "最大重量 (kg)",
    "total_volume":     "總訓練量 (kg)",
    "total_reps":       "總次數",
    "calories_burned":  "消耗熱量 (kcal)",
    "body_fat_pct":     "體脂率 (%)",
    "skeletal_muscle_kg": "骨骼肌 (kg)",
    "body_water_pct":   "身體水分 (%)",
    "visceral_fat_level": "內臟脂肪等級",
  };
  const en: Record<string, string> = {
    "distance_km":      "Cardio distance (km)",
    "duration_min":     "Cardio duration (min)",
    "avg_speed":        "Avg speed (km/h)",
    "max_weight":       "Max weight (kg)",
    "total_volume":     "Total volume (kg)",
    "total_reps":       "Total reps",
    "calories_burned":  "Calories burned (kcal)",
    "body_fat_pct":     "Body fat (%)",
    "skeletal_muscle_kg": "Skeletal muscle (kg)",
    "body_water_pct":   "Body water (%)",
    "visceral_fat_level": "Visceral fat level",
  };
  const dict = lang === "zh" ? zh : en;
  const m = cfg.metric ?? "";
  return dict[m] ?? m;
}

// ─── Stat variable query helpers ─────────────────────────────────────────────

async function queryStatVar(
  varKey: string,
  userId: number,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const map = new Map<string, number>();
  let rows: { log_date: string; value: number }[] = [];

  switch (varKey) {
    case "weight":
      rows = await db.select(
        `SELECT log_date, AVG(weight_kg) as value FROM weight_log
         WHERE user_id=? AND log_date BETWEEN ? AND ?
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "bodyFat":
      // Prefer body_composition_log, fallback to weight_log
      rows = await db.select(
        `SELECT date, AVG(bf) as value FROM (
           SELECT log_date as date, body_fat_pct as bf FROM body_composition_log
             WHERE user_id=? AND log_date BETWEEN ? AND ? AND body_fat_pct IS NOT NULL
           UNION ALL
           SELECT log_date as date, body_fat_pct as bf FROM weight_log
             WHERE user_id=? AND log_date BETWEEN ? AND ? AND body_fat_pct IS NOT NULL
         ) GROUP BY date`,
        [userId, from, to, userId, from, to]);
      rows = rows.map(r => ({ log_date: (r as any).date, value: r.value }));
      break;
    case "calories":
      rows = await db.select(
        `SELECT ml.log_date, ROUND(SUM(ml.quantity / fd.base_quantity * fd.calories_kcal), 1) as value
         FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
         WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
         GROUP BY ml.log_date`,
        [userId, from, to]);
      break;
    case "protein":
      rows = await db.select(
        `SELECT ml.log_date, ROUND(SUM(ml.quantity / fd.base_quantity * fd.protein_g), 1) as value
         FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
         WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
         GROUP BY ml.log_date`,
        [userId, from, to]);
      break;
    case "water":
      rows = await db.select(
        `SELECT log_date, SUM(amount_ml) as value FROM water_log
         WHERE user_id=? AND log_date BETWEEN ? AND ?
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "sleep":
      rows = await db.select(
        `SELECT sleep_date as log_date, AVG(duration_hours) as value FROM sleep_log
         WHERE user_id=? AND sleep_date BETWEEN ? AND ? AND duration_hours IS NOT NULL
         GROUP BY sleep_date`,
        [userId, from, to]);
      break;
    case "exerciseCal":
      rows = await db.select(
        `SELECT log_date, ROUND(SUM(calories_burned), 1) as value FROM exercise_log
         WHERE user_id=? AND log_date BETWEEN ? AND ?
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "steps":
      // Proxy: total cardio duration in minutes
      rows = await db.select(
        `SELECT log_date, SUM(duration_min) as value FROM exercise_log
         WHERE user_id=? AND log_date BETWEEN ? AND ?
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "carb":
      rows = await db.select(
        `SELECT ml.log_date, ROUND(SUM(ml.quantity / fd.base_quantity * fd.carbohydrates_g), 1) as value
         FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
         WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
         GROUP BY ml.log_date`,
        [userId, from, to]);
      break;
    case "fat":
      rows = await db.select(
        `SELECT ml.log_date, ROUND(SUM(ml.quantity / fd.base_quantity * fd.fat_g), 1) as value
         FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
         WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
         GROUP BY ml.log_date`,
        [userId, from, to]);
      break;
    case "muscleTotal":
      rows = await db.select(
        `SELECT log_date, AVG(skeletal_muscle_kg) as value FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ? AND skeletal_muscle_kg IS NOT NULL
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "muscleTrunk":
      rows = await db.select(
        `SELECT log_date, AVG(muscle_trunk_kg) as value FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ? AND muscle_trunk_kg IS NOT NULL
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "muscleLeftArm":
      rows = await db.select(
        `SELECT log_date, AVG(muscle_left_arm_kg) as value FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ? AND muscle_left_arm_kg IS NOT NULL
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "muscleRightArm":
      rows = await db.select(
        `SELECT log_date, AVG(muscle_right_arm_kg) as value FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ? AND muscle_right_arm_kg IS NOT NULL
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "muscleLeg":
      rows = await db.select(
        `SELECT log_date, AVG((COALESCE(muscle_left_leg_kg,0) + COALESCE(muscle_right_leg_kg,0)) / 2.0) as value
         FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ?
           AND (muscle_left_leg_kg IS NOT NULL OR muscle_right_leg_kg IS NOT NULL)
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "waist":
      rows = await db.select(
        `SELECT log_date, AVG(waist_cm) as value FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ? AND waist_cm IS NOT NULL
         GROUP BY log_date`,
        [userId, from, to]);
      break;
    case "visceralFat":
      rows = await db.select(
        `SELECT log_date, AVG(visceral_fat_level) as value FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ? AND visceral_fat_level IS NOT NULL
         GROUP BY log_date`,
        [userId, from, to]);
      break;
  }

  for (const r of rows) {
    if (r.value != null) map.set(r.log_date, r.value);
  }
  return map;
}

async function queryGoalMetric(
  advGoalType: string,
  cfg: { category?: string; metric?: string; agg?: string; exerciseName?: string },
  userId: number,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const map = new Map<string, number>();
  let rows: { log_date: string; value: number }[] = [];

  if (advGoalType === "body_composition") {
    const field = cfg.metric ?? "body_fat_pct";
    rows = await db.select(
      `SELECT log_date, AVG(${field}) as value
       FROM body_composition_log
       WHERE user_id=? AND log_date BETWEEN ? AND ? AND ${field} IS NOT NULL
       GROUP BY log_date ORDER BY log_date`,
      [userId, from, to]);
  } else if (advGoalType === "exercise_performance") {
    const cat = cfg.category ?? "running";
    const metric = cfg.metric ?? "duration_min";
    const exName = cfg.exerciseName?.trim() ?? "";
    if (cat === "running") {
      if (metric === "distance_km") {
        rows = await db.select(
          `SELECT rs.log_date, SUM(ri.distance_km) as value
           FROM running_session rs JOIN running_interval ri ON ri.session_id = rs.id
           WHERE rs.user_id=? AND rs.log_date BETWEEN ? AND ?
           GROUP BY rs.log_date ORDER BY rs.log_date`,
          [userId, from, to]);
      } else if (metric === "duration_min") {
        rows = await db.select(
          `SELECT rs.log_date, SUM(ri.duration_min) as value
           FROM running_session rs JOIN running_interval ri ON ri.session_id = rs.id
           WHERE rs.user_id=? AND rs.log_date BETWEEN ? AND ?
           GROUP BY rs.log_date ORDER BY rs.log_date`,
          [userId, from, to]);
      } else if (metric === "avg_speed") {
        rows = await db.select(
          `SELECT rs.log_date,
             ROUND(SUM(ri.distance_km) / (SUM(ri.duration_min) / 60.0), 2) as value
           FROM running_session rs JOIN running_interval ri ON ri.session_id = rs.id
           WHERE rs.user_id=? AND rs.log_date BETWEEN ? AND ?
           GROUP BY rs.log_date HAVING SUM(ri.duration_min) > 0
           ORDER BY rs.log_date`,
          [userId, from, to]);
      }
    } else if (cat === "strength") {
      const exFilter = exName ? " AND ss.exercise_name=?" : "";
      const exParams = exName ? [exName] : [];
      if (metric === "max_weight") {
        rows = await db.select(
          `SELECT ss.log_date, MAX(st.weight_kg) as value
           FROM strength_session ss JOIN strength_set st ON st.session_id = ss.id
           WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ?${exFilter}
           GROUP BY ss.log_date ORDER BY ss.log_date`,
          [userId, from, to, ...exParams]);
      } else if (metric === "total_volume") {
        rows = await db.select(
          `SELECT ss.log_date, ROUND(SUM(st.weight_kg * st.reps), 1) as value
           FROM strength_session ss JOIN strength_set st ON st.session_id = ss.id
           WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ?${exFilter}
           GROUP BY ss.log_date ORDER BY ss.log_date`,
          [userId, from, to, ...exParams]);
      } else if (metric === "total_reps") {
        rows = await db.select(
          `SELECT ss.log_date, SUM(st.reps) as value
           FROM strength_session ss JOIN strength_set st ON st.session_id = ss.id
           WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ?${exFilter}
           GROUP BY ss.log_date ORDER BY ss.log_date`,
          [userId, from, to, ...exParams]);
      }
    } else {
      // other cardio
      if (metric === "duration_min") {
        rows = await db.select(
          `SELECT log_date, SUM(duration_min) as value FROM exercise_log
           WHERE user_id=? AND log_date BETWEEN ? AND ?
           GROUP BY log_date ORDER BY log_date`,
          [userId, from, to]);
      } else if (metric === "calories_burned") {
        rows = await db.select(
          `SELECT log_date, ROUND(SUM(calories_burned), 1) as value FROM exercise_log
           WHERE user_id=? AND log_date BETWEEN ? AND ?
           GROUP BY log_date ORDER BY log_date`,
          [userId, from, to]);
      }
    }
  }

  for (const r of rows) {
    if (r.value != null) map.set(r.log_date, r.value);
  }
  return map;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Statistics() {
  const { profile, modeSettings, patchAdvConfig, patchAdv2Config } = useUserStore();
  const { t, lang } = useLangStore();
  const dStr = (n: number) => lang === "zh" ? `${n}天` : `${n} days`;

  const [activeTab, setActiveTab] = useState<StatTab>("pearson");
  const STAT_TABS = ["pearson", "advanced", "body"] as const;
  const statSwipe = useSwipeTabs(STAT_TABS, activeTab, setActiveTab as (t: string) => void);

  // Date range
  const [days, setDays]           = useState(90);
  const [showCustom, setShowCustom]     = useState(false);
  const [customRange, setCustomRange]   = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [modeCustom, setModeCustom]     = useState(false);
  const [activeDates, setActiveDates]   = useState<Set<string>>(new Set());

  // Pearson tab
  const [loading, setLoading]       = useState(false);
  const [daysWithData, setDaysWithData] = useState(0);
  const [basicFactors, setBasicFactors] = useState<{ factor: string; label: string; r: number | null; density: number }[]>([]);
  const [advGoalDensity, setAdvGoalDensity] = useState(100);

  // Body composition tab
  const [bodyPoints, setBodyPoints] = useState<BodyPoint[]>([]);
  const [hasBody, setHasBody]       = useState(false);

  // Advanced tab — legacy correlation
  const [_advResults, setAdvResults]       = useState<AdvResult[] | null>(null);
  const [_advGoalLabel, setAdvGoalLabel]   = useState("");
  const [advLoading, setAdvLoading]        = useState(false);
  const [_advHasInterp, setAdvHasInterp]   = useState(false);

  // Advanced tab — new config UI
  interface VarCard { id: string; cfg: MetricCfg | null; confirmed: boolean; open: boolean }
  const [advGoalCfg, setAdvGoalCfg]           = useState<MetricCfg | null>(null);
  const [advGoalDir, setAdvGoalDir]           = useState<"up" | "down">("up");
  const [advGoalOpen, setAdvGoalOpen]         = useState(false);
  const [advGoalConfirmed, setAdvGoalConfirmed] = useState(false);
  const [advVarCards, setAdvVarCards]         = useState<VarCard[]>([]);
  const [_advChartData, setAdvChartData]       = useState<{ date: string; [k: string]: number | string | null }[]>([]);
  const [_advChartLoading, setAdvChartLoading] = useState(false);
  const [advPearsonResults, setAdvPearsonResults] = useState<Record<string, { r: number | null; density: number }>>({});

  // Advanced tab — slot 2 (custom mode 進階2)
  const [adv2GoalCfg, setAdv2GoalCfg]                 = useState<MetricCfg | null>(null);
  const [adv2GoalDir, setAdv2GoalDir]                 = useState<"up" | "down">("up");
  const [adv2GoalOpen, setAdv2GoalOpen]               = useState(false);
  const [adv2GoalConfirmed, setAdv2GoalConfirmed]     = useState(false);
  const [adv2VarCards, setAdv2VarCards]               = useState<VarCard[]>([]);
  const [adv2PearsonResults, setAdv2PearsonResults]   = useState<Record<string, { r: number | null; density: number }>>({});
  const [adv2GoalDensity, setAdv2GoalDensity]         = useState(100);

  // Total days in the currently selected range (for Pearson density)
  const rangeTotal = modeCustom && customRange.start && customRange.end
    ? Math.round((new Date(customRange.end).getTime() - new Date(customRange.start).getTime()) / 86400000) + 1
    : days;

  const goalMode = modeSettings ? MODE_GOAL[modeSettings.mode] : "maintain";
  const modeInfo = modeSettings ? MODE_META[modeSettings.mode] : null;
  const MODE_LABEL_KEY: Record<string, string> = {
    cut_slow: "profile.mode.cutSlow", cut_normal: "profile.mode.cutNormal",
    cut_aggressive: "profile.mode.cutAggressive", bulk_lean: "profile.mode.bulkLean",
    bulk_normal: "profile.mode.bulkNormal", bulk_aggressive: "profile.mode.bulkAggressive",
    maintain: "profile.mode.maintain", custom: "profile.mode.custom",
  };
  const modeLabelI18n = modeSettings ? t(MODE_LABEL_KEY[modeSettings.mode] as any) : "";

  const getFromTo = () => {
    if (modeCustom && customRange.start && customRange.end)
      return { from: customRange.start, to: customRange.end };
    return {
      from: format(subDays(new Date(), days - 1), "yyyy-MM-dd"),
      to:   format(new Date(), "yyyy-MM-dd"),
    };
  };

  useEffect(() => {
    if (profile) {
      loadPearson(); loadBodyComp(); loadAdvanced();
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
    } catch { }
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
    } catch { }
    setLoading(false);
  };

  const loadBodyComp = async () => {
    if (!profile) return;
    try {
      const db   = await getDb();
      const { from, to } = getFromTo();
      const rows = await db.select<any[]>(
        `SELECT log_date as date, body_fat_pct as body_fat, skeletal_muscle_kg as muscle,
           body_water_pct as water, visceral_fat_level as visceral
         FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ?
         ORDER BY log_date ASC`,
        [profile.user_id, from, to]);
      setBodyPoints(rows);
      setHasBody(rows.length >= 2);
    } catch { }
  };

  const loadAdvanced = async () => {
    if (!profile || !modeSettings?.adv_goal_type) {
      setAdvResults(null);
      return;
    }
    setAdvLoading(true);
    try {
      const { from, to } = getFromTo();
      const allDates = buildDateRange(from, to);
      const totalDays = allDates.length;

      // Parse config
      let cfg: { category?: string; metric?: string; agg?: string } = {};
      try { cfg = JSON.parse(modeSettings.adv_goal_config ?? "{}"); } catch { }

      // Parse selected stat variables
      let statVars: string[] = [];
      try { statVars = JSON.parse(modeSettings.adv_stat_variables ?? "[]"); } catch { }

      // Goal metric label
      const label = getGoalMetricLabel(cfg, lang);
      setAdvGoalLabel(label);

      // Goal metric time series
      const goalMap = await queryGoalMetric(modeSettings.adv_goal_type, cfg, profile.user_id, from, to);
      if (goalMap.size === 0) {
        setAdvResults([]);
        setAdvLoading(false);
        return;
      }

      // Build interpolated goal map
      const goalInterp = linearInterpolate(goalMap, allDates);

      // For each stat variable, compute density + Pearson r
      const advRes: AdvResult[] = [];
      let anyInterp = false;

      // Build i18n label map for stat vars
      const varLabels: Record<string, string> = {
        weight:      t("stat.var.weight"),
        bodyFat:     t("stat.var.bodyFat"),
        calories:    t("stat.var.calories"),
        protein:     t("stat.var.protein"),
        water:       t("stat.var.water"),
        sleep:       t("stat.var.sleep"),
        exerciseCal: t("stat.var.exerciseCal"),
        steps:       t("stat.var.steps"),
        carb:          t("stat.var.carb"),
        fat:           t("stat.var.fat"),
        muscleTotal:   t("stat.var.muscleTotal"),
        muscleTrunk:   t("stat.var.muscleTrunk"),
        muscleLeftArm: t("stat.var.muscleLeftArm"),
        muscleRightArm:t("stat.var.muscleRightArm"),
        muscleLeg:     t("stat.var.muscleLeg"),
        waist:         t("stat.var.waist"),
        visceralFat:   t("stat.var.visceralFat"),
      };

      for (const varKey of statVars) {
        const rawMap = await queryStatVar(varKey, profile.user_id, from, to);
        const daysWithActual = rawMap.size;
        const density = totalDays > 0 ? Math.round((daysWithActual / totalDays) * 100) : 0;
        const densityColor: "green" | "yellow" | "red" =
          density >= 80 ? "green" : density >= 50 ? "yellow" : "red";

        // Interpolate stat var
        const varInterp = linearInterpolate(rawMap, allDates);
        if (rawMap.size < allDates.length) anyInterp = true;

        // Compute Pearson: use dates where BOTH goal (interp) and var (interp) have values
        const xArr: number[] = [];
        const yArr: number[] = [];
        for (const date of allDates) {
          const gv = goalInterp.get(date);
          const vv = varInterp.get(date);
          if (gv != null && vv != null) {
            xArr.push(vv);
            yArr.push(gv);
          }
        }

        const MIN_PAIRS = 14;
        const r = xArr.length >= MIN_PAIRS ? pearsonFromArrays(xArr, yArr) : null;

        advRes.push({
          varKey,
          label: varLabels[varKey] ?? varKey,
          r,
          daysWithData: daysWithActual,
          density,
          densityColor,
        });
      }

      setAdvHasInterp(anyInterp);
      // Sort by |r| descending (null at end)
      advRes.sort((a, b) => {
        if (a.r === null && b.r === null) return 0;
        if (a.r === null) return 1;
        if (b.r === null) return -1;
        return Math.abs(b.r) - Math.abs(a.r);
      });
      setAdvResults(advRes);
    } catch (e) {
      console.error("loadAdvanced error", e);
      setAdvResults([]);
    }
    setAdvLoading(false);
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
        // exercise_log name patterns per cardio type
        const nameLike = sub === "swimming"
          ? "(exercise_name LIKE '%游泳%' OR exercise_name LIKE '%游%')"
          : sub === "cycling"
          ? "(exercise_name LIKE '%自行車%' OR exercise_name LIKE '%單車%' OR exercise_name LIKE '%腳踏車%' OR exercise_name LIKE '%飛輪%')"
          : "(exercise_name LIKE '%跑%' OR exercise_name LIKE '%步機%')";
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
      const allDates = new Set<string>();
      for (const rows of Object.values(rawRows)) for (const r of rows) allDates.add(r.date);
      const sorted = [...allDates].sort();
      const dateMaps: Record<string, Map<string, number>> = {};
      for (const { id } of allCfgs) {
        dateMaps[id] = new Map(rawRows[id].map(r => [r.date, r.value]));
      }
      setAdvChartData(sorted.map(date => {
        const pt: { date: string; [k: string]: number | string | null } = { date };
        for (const { id } of allCfgs) pt[id] = dateMaps[id].get(date) ?? null;
        return pt;
      }));
      const goalValues = rawRows["__goal__"].map(r => r.value);
      const pearsonMap: Record<string, { r: number | null; density: number }> = {};
      for (const v of confirmedVars) {
        const varValues = rawRows[v.id].map(r => r.value);
        pearsonMap[v.id] = {
          r: computePearsonAligned(goalValues, varValues, rangeTotal),
          density: rangeTotal > 0 ? Math.round((rawRows[v.id].length / rangeTotal) * 100) : 0,
        };
      }
      setPearson(pearsonMap);
      setDensity(rangeTotal > 0 ? Math.round((rawRows["__goal__"].length / rangeTotal) * 100) : 0);
    } catch { }
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
                const dc = goalDensity >= 80 ? "green" : goalDensity >= 50 ? "yellow" : "red";
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
          return (
            <div className="card">
              <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-4">
                {lang === "zh" ? "相關係數排名" : "Correlation Ranking"}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 40, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#374151" }}
                    axisLine={false} tickLine={false}
                    angle={-30} textAnchor="end" interval={0} />
                  <YAxis domain={[-1, 1]}
                    tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                    tickFormatter={v => v.toFixed(1)} />
                  <Tooltip
                    formatter={(v: number) => [v.toFixed(3), "Pearson r"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  <Bar dataKey="r" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {chartData.map((d, i) => {
                      const good = d.dir === "up" ? d.r! > 0 : d.r! < 0;
                      return <Cell key={i} fill={good ? "#10b981" : "#f87171"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
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
              const isGood = r === null ? false : goalDir === "up" ? r > 0 : r < 0;
              const abs = r !== null ? Math.abs(r) : 0;
              const strength = abs > 0.5
                ? (lang === "zh" ? "強" : "strong")
                : abs > 0.3
                  ? (lang === "zh" ? "中等" : "moderate")
                  : (lang === "zh" ? "輕微" : "weak");
              const insight = r === null
                ? (lang === "zh" ? `資料密度 ${density}% 資料不足` : `Density ${density}% – Insufficient data`)
                : abs <= 0.1
                  ? (lang === "zh" ? "與目標無明顯相關" : "No clear correlation")
                  : isGood
                    ? `${lang === "zh" ? "與目標正向相關" : "Positively correlated"}（${strength}）`
                    : `${lang === "zh" ? "可能影響目標" : "May affect goal"}（${strength}）`;
              const dc = density >= 80 ? "green" : density >= 50 ? "yellow" : "red";
              const dcClx = dc === "green" ? "text-green-500" : dc === "yellow" ? "text-amber-400" : "text-red-400";
              const Icon = r !== null && r > 0.1 ? TrendingUp : r !== null && r < -0.1 ? TrendingDown : Minus;
              return (
                <div key={card.id}
                  className={clsx("card flex items-start gap-3 border-l-4",
                    r === null ? "border-l-gray-200"
                      : isGood ? "border-l-green-400" : "border-l-red-300")}>
                  <div className={clsx("w-7 h-7 flex items-center justify-center shrink-0 text-base font-black leading-none",
                    r === null ? "text-gray-300"
                      : isGood ? "text-emerald-600" : "text-rose-600")}>
                    ◎
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-on-surface)] truncate">{metricLabel(card.cfg!, lang)}</p>
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
                        <button
                          onClick={() => onSetVarCards(prev => prev.map(v => v.id === card.id ? { ...v, open: true } : v))}
                          className="p-1 text-gray-400 hover:text-yellow-500 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => {
                            onRemoveVar(card.id);
                            if (goalCfg && goalConfirmed) {
                              const remaining = varCards.filter(v => v.id !== card.id);
                              saveAdvGoal(goalCfg, goalDir, remaining, slot);
                              loadAdvChart(goalCfg, remaining, slot);
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">{insight}</p>
                  </div>
                </div>
              );
            });
          })()}

        </div>

      </div>
    );
  };

  if (!profile) return (
    <div className="flex items-center justify-center h-full text-[var(--text-on-bg-muted)] text-sm">
      {t("common.noProfile")}
    </div>
  );

  return (
    <>
    <div className="pt-4 md:pt-6 px-4 md:px-6 max-w-2xl mx-auto space-y-5 pb-36 md:pb-6" {...statSwipe}>
      {/* Sticky header */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 pb-4 pt-1 md:pt-4 space-y-2 shrink-0"
        style={{ background: 'var(--bg-main)', backgroundAttachment: 'fixed' }}>
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
            <button onClick={() => { loadPearson(); loadBodyComp(); loadAdvanced(); }} disabled={loading || advLoading}
              className={clsx("p-2 rounded-xl transition-all border border-white/30 text-white bg-white/10",
                (loading || advLoading) ? "animate-spin opacity-40 cursor-wait" : "hover:bg-white/20")}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        {/* Date range pills — scrollable row */}
        <div className="flex gap-1 bg-white/10 p-1 rounded-xl overflow-x-auto overscroll-x-contain">
          {CHART_DATE_RANGES.map(({ days: d }) => (
            <button key={d} onClick={() => { setDays(d); setModeCustom(false); setShowCustom(false); setCustomRange({ start: null, end: null }); }}
              className={clsx("shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                !modeCustom && days === d ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
              {dStr(d)}
            </button>
          ))}
          <button onClick={() => setShowCustom(v => !v)}
            className={clsx("shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
              showCustom || modeCustom ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
            {t("history.custom")}
          </button>
        </div>
      </div>

      {/* Custom date range picker */}
      {showCustom && (
        <div className="card space-y-3">
          <p className="text-sm font-semibold text-[var(--text-on-surface)]">{t("stats.pickRange")}</p>
          <p className="text-xs text-[var(--text-on-surface-muted)]">
            {!customRange.start ? t("stats.pickStart") : !customRange.end ? t("stats.pickEnd") : `${t("history.selected")}${customRange.start} — ${customRange.end}`}
          </p>
          <MiniCalendar
            activeDates={activeDates}
            mode="range"
            range={customRange}
            onRangeChange={r => {
              setCustomRange(r);
              setModeCustom(!!(r.start && r.end));
            }}
          />
          {customRange.start && customRange.end && (
            <button onClick={() => setShowCustom(false)}
              className="btn-primary w-full text-sm">
              {t("stats.applyRange")}
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white/10 p-1 rounded-xl">
        <button onClick={() => setActiveTab("pearson")}
          className={clsx("flex-1 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "pearson" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
          {modeSettings?.mode === "custom"
            ? (lang === "zh" ? "進階" : "Adv.")
            : (lang === "zh" ? "基礎" : "Basic")}
        </button>
        <button onClick={() => setActiveTab("advanced")}
          className={clsx("flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1",
            activeTab === "advanced" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
          {modeSettings?.mode === "custom"
            ? (lang === "zh" ? "進階2" : "Adv.2")
            : t("stats.tab.advanced")}
        </button>
        <button onClick={() => setActiveTab("body")}
          className={clsx("flex-1 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "body" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
          {t("stats.tab.body")}
        </button>
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
              const dc = wDensity >= 80 ? "green" : wDensity >= 50 ? "yellow" : "red";
              const dcClx = dc === "green" ? "text-green-500" : dc === "yellow" ? "text-amber-400" : "text-red-400";
              return (
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
              );
            })()}
          </div>

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
                const strength = abs > 0.5
                  ? (lang === "zh" ? "強" : "strong")
                  : abs > 0.3
                    ? (lang === "zh" ? "中等" : "moderate")
                    : (lang === "zh" ? "輕微" : "weak");
                const insight = r === null
                  ? (lang === "zh" ? `資料密度 ${density}% 資料不足` : `Density ${density}% – Insufficient data`)
                  : abs <= 0.1
                    ? (lang === "zh" ? "與體重變化無明顯相關" : "No clear correlation with weight")
                    : isGood
                      ? `${lang === "zh" ? "有助達成目標" : "Supports your goal"}（${strength}）`
                      : `${lang === "zh" ? "可能影響目標" : "May affect goal"}（${strength}）`;
                const dc = density >= 80 ? "green" : density >= 50 ? "yellow" : "red";
                const dcClx = dc === "green" ? "text-green-500" : dc === "yellow" ? "text-amber-400" : "text-red-400";
                const Icon = r !== null && r > 0.1 ? TrendingUp : r !== null && r < -0.1 ? TrendingDown : Minus;
                return (
                  <div key={item.factor}
                    className={clsx("card flex items-start gap-3 border-l-4",
                      r === null ? "border-l-gray-200"
                        : isGood ? "border-l-green-400" : "border-l-red-300")}>
                    <div className={clsx("w-7 h-7 flex items-center justify-center shrink-0 text-base font-black leading-none",
                      r === null ? "text-gray-300" : isGood ? "text-emerald-600" : "text-rose-600")}>
                      ◎
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--text-on-surface)] truncate">{item.label}</p>
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
                      </div>
                      <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">{insight}</p>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: 身體組成變化
      ══════════════════════════════════════════ */}
      {activeTab === "body" && (
        <>
          {!hasBody ? (
            <div className="card text-center py-12 space-y-3">
              <Activity size={36} className="mx-auto text-[var(--text-on-surface-muted)]" />
              <p className="text-sm font-medium text-[var(--text-on-surface-sub)]">{t("stats.noBodyComp")}</p>
              <p className="text-xs text-[var(--text-on-surface-muted)]">{t("stats.noBodyCompDesc")}</p>
            </div>
          ) : (
            <>
              {/* Body fat + muscle dual chart */}
              <div className="card">
                <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-4">{t("stats.bodyFatMuscle")}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={bodyPoints} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tickFormatter={fmtDate}
                      tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis domain={["auto", "auto"]}
                      tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      labelFormatter={v => format(parseISO(v as string), "M/d")}
                      formatter={(v: number, name: string) => {
                        const labels: Record<string, string> = { body_fat: t("stats.legendBodyFat"), muscle: t("stats.legendMuscle") };
                        const units: Record<string, string> = { body_fat: "%", muscle: " kg" };
                        return [`${v}${units[name] ?? ""}`, labels[name] ?? name];
                      }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    {bodyPoints.some(p => p.body_fat != null) && (
                      <Line type="monotone" dataKey="body_fat" stroke="#f97316"
                        strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4 }} />
                    )}
                    {bodyPoints.some(p => p.muscle != null) && (
                      <Line type="monotone" dataKey="muscle" stroke="#10b981"
                        strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4 }} strokeDasharray="5 5" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 justify-center">
                  {[[t("stats.legendBodyFat"), "#f97316", "solid"], [t("stats.legendMuscle"), "#10b981", "dashed"]].map(([label, color, style]) => (
                    <div key={label as string} className="flex items-center gap-1.5">
                      <div className="w-6 h-0.5 rounded-full" style={{
                        backgroundColor: color as string,
                        backgroundImage: style === "dashed" ? `repeating-linear-gradient(to right, ${color} 0, ${color} 4px, transparent 4px, transparent 8px)` : undefined,
                      }} />
                      <span className="text-xs text-[var(--text-on-surface-muted)]">{label as string}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Water + visceral */}
              {bodyPoints.some(p => p.water != null || p.visceral != null) && (
                <div className="card">
                  <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-4">{t("stats.waterVisceral")}</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={bodyPoints} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tickFormatter={fmtDate}
                        tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis domain={["auto", "auto"]}
                        tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        labelFormatter={v => format(parseISO(v as string), "M/d")}
                        formatter={(v: number, name: string) => {
                          const labels: Record<string, string> = { water: t("stats.legendWater"), visceral: t("stats.legendVisceral") };
                          const units: Record<string, string>  = { water: "%", visceral: lang === "zh" ? " 級" : "" };
                          return [`${v}${units[name] ?? ""}`, labels[name] ?? name];
                        }}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                      {bodyPoints.some(p => p.water != null) && (
                        <Line type="monotone" dataKey="water" stroke="#0ea5e9"
                          strokeWidth={2} dot={false} connectNulls />
                      )}
                      {bodyPoints.some(p => p.visceral != null) && (
                        <Line type="monotone" dataKey="visceral" stroke="#8b5cf6"
                          strokeWidth={2} dot={false} connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Latest values */}
              {bodyPoints.length > 0 && (() => {
                const last = bodyPoints[bodyPoints.length - 1];
                const first = bodyPoints[0];
                return (
                  <div className="card">
                    <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-3">{lang === "zh" ? "變化摘要" : "Change Summary"}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: "body_fat" as const, label: t("stats.legendBodyFat"), unit: "%", color: "#f97316" },
                        { key: "muscle"   as const, label: t("stats.legendMuscle"),  unit: " kg", color: "#10b981" },
                      ].map(({ key, label, unit, color }) => {
                        const lastVal  = last[key];
                        const firstVal = first[key];
                        if (lastVal == null || firstVal == null) return null;
                        const diff = lastVal - firstVal;
                        return (
                          <div key={key}>
                            <p className="text-xs text-[var(--text-on-surface-muted)]">{label}</p>
                            <p className="text-xl font-bold" style={{ color }}>
                              {lastVal}{unit}
                            </p>
                            <p className={clsx("text-xs mt-0.5",
                              diff === 0 ? "text-[var(--text-on-surface-muted)]"
                              : key === "body_fat" ? (diff < 0 ? "text-green-500" : "text-red-400")
                              : (diff > 0 ? "text-green-500" : "text-red-400"))}>
                              {diff > 0 ? "+" : ""}{diff.toFixed(1)}{unit} {lang === "zh" ? "較" : "vs"} {fmtDate(first.date)}
                            </p>
                          </div>
                        );
                      }).filter(Boolean)}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}

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
