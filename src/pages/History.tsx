import { useState, useEffect, type ReactNode } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { format, subDays, parseISO, startOfWeek, getISOWeek } from "date-fns";
import { fmtDay as fmtDayFn } from "@/lib/dateFormat";
import {
  TrendingDown, TrendingUp, Minus, Scale, Flame, Droplets,
  Dumbbell, Activity, Timer, Footprints, Moon,
} from "lucide-react";
import { clsx } from "clsx";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";
import { getWeightHistory, getCalorieHistory, getMealCountHistory, getActiveDates } from "@/lib/db/queries/stats";
import { calculateNutritionTargets } from "@/lib/calculations/strategy";
import { strengthEstKcal } from "@/lib/calculations/exercise";
import { NoProfile } from "@/components/common/NoProfile";
import { EmptyState } from "@/components/common/EmptyState";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { PillButton } from "@/components/common/PillButton";
import { CardHeader } from "@/components/common/CardHeader";
import { DateRangePills, DateRangePickerCard } from "@/components/common/DateRangePicker";
import { useDateRange } from "@/hooks/useDateRange";
import { computeTdee } from "@/lib/calculations/metabolism";
import { MACRO_COLORS, BODY_PART_COLORS, BODY_PARTS, BODY_PART_EN, CARDIO_LABEL, CARDIO_SWIM_LIKE, CARDIO_CYCLE_LIKE, CARDIO_RUN_LIKE, CARDIO_OTHER_EXCL, type BodyPart } from "@/constants";
import type { WeightChartPoint, CalorieChartPoint } from "@/types";
import { useSwipeTabs } from "@/hooks/useSwipe";

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = "overview" | "strength" | "cardio" | "other" | "body";
type CardioFilter = "all" | "running" | "swimming" | "cycling";
type StrengthSubTab = "volume" | "freq" | "maxweight";
const GRID_STROKE   = { strokeDasharray: "3 3" as const, stroke: "#f3f4f6" };
const TICK_STYLE    = { fontSize: 11, fill: "#9ca3af" };
const AXIS_COMMON   = { axisLine: false, tickLine: false, tick: TICK_STYLE } as const;

// Per-cardio-type colors for the stacked distance chart
const CARDIO_COLORS = {
  running:  "#3b82f6", // blue
  swimming: "#06b6d4", // cyan
  cycling:  "#22c55e", // green
} as const;

interface StrengthDayRow {
  log_date: string;
  body_part: string | null;
  daily_volume: number;
  session_count: number;
  avg_sets: number;
}

interface WeeklyStrength {
  week: string;    // "W14"
  weekStart: string;
  volume: number;
  sessions: number;
}

interface BodyPartStats {
  body_part: string;
  total_sessions: number;
  total_sets: number;
  avg_sets_per_session: number;
  total_volume: number;
}

interface RunDayRow {
  log_date: string;
  total_min: number;
  total_kcal: number;
  est_km: number;
  session_count: number;
  // per-type distance (km) for the stacked distance chart
  km_running: number;
  km_swimming: number;
  km_cycling: number;
}

interface OtherDayRow {
  log_date: string;
  total_min: number;
  total_kcal: number;
  session_count: number;
  categories: string;
  exercise_names: string;
  exercise_names_en: string | null;
}

interface MealCountPoint {
  date: string;
  meals: number;
}

interface BodyCompPoint {
  date: string;
  body_fat: number | null;
  muscle: number | null;
  water: number | null;
  visceral: number | null;
  waist: number | null;
}

type SleepQuality = "good" | "normal" | "poor";
interface BodySleepPoint {
  date: string;
  quality: number; // 3=good, 2=normal, 1=poor
  qualityLabel: string;
  hours: number | null;
  color: string;
}

type BodyChartMetric = "body_fat" | "muscle" | "water" | "visceral" | "waist";

const BODY_SLEEP_COLORS: Record<SleepQuality, string> = {
  good: "#10b981", normal: "#f59e0b", poor: "#ef4444",
};

const fmt = (d: string) => format(parseISO(d), "M/d");

const HISTORY_MAIN_TABS: MainTab[] = ["overview", "strength", "cardio", "other", "body"];

// ─── Helper: group daily rows into weeks ─────────────────────────────────────

function toWeeklyVolume(rows: StrengthDayRow[]): WeeklyStrength[] {
  const map = new Map<string, WeeklyStrength>();
  for (const r of rows) {
    const d    = parseISO(r.log_date);
    const ws   = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const wKey = `W${getISOWeek(d)}`;
    if (!map.has(ws)) map.set(ws, { week: wKey, weekStart: ws, volume: 0, sessions: 0 });
    const entry = map.get(ws)!;
    entry.volume   += r.daily_volume;
    entry.sessions += r.session_count;
  }
  return Array.from(map.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function weeklyFreq(rows: { log_date: string; session_count: number }[], days: number): number {
  if (rows.length === 0) return 0;
  const weeks = Math.max(days / 7, 1);
  const total = rows.reduce((s, r) => s + r.session_count, 0);
  return Math.round((total / weeks) * 10) / 10;
}

// ─── Sleep helpers ───────────────────────────────────────────────────────────

const sleepDot = (props: any) => {
  const { cx, cy, payload } = props;
  return <circle key={payload.date} cx={cx} cy={cy} r={4} fill={payload.color} stroke="white" strokeWidth={1.5} />;
};

function SleepQualityLegend({ t }: { t: (key: any) => string }) {
  return (
    <div className="flex gap-4 justify-center mt-3">
      {(["good", "normal", "poor"] as SleepQuality[]).map(q => (
        <div key={q} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: BODY_SLEEP_COLORS[q] }} />
          <span className="text-xs text-[var(--text-on-surface-muted)]">{t(`body.sleep.${q}` as any)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryStatCard({ label, value, unit, color = "text-[var(--text-on-surface)]", sub }: {
  label: ReactNode; value: ReactNode; unit: ReactNode;
  color?: string; sub?: ReactNode;
}) {
  return (
    <div className="card">
      <p className="text-xs text-[var(--text-on-surface-muted)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>
        {value}
        <span className="text-sm font-normal text-[var(--text-on-surface-muted)] ml-1">{unit}</span>
      </p>
      {sub && <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, unit, trend, color, trendFlat, trendDown, trendUp }: {
  icon: typeof Scale; label: string; value: string; unit: string;
  trend?: "up" | "down" | "flat"; color: string;
  trendFlat?: string; trendDown?: string; trendUp?: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <div className="card flex flex-col gap-1 !p-3">
      <div className={clsx("flex items-center gap-1 text-xs font-medium whitespace-nowrap", color)}>
        <Icon size={12} />{label}
      </div>
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <span className="text-xl font-bold text-[var(--text-on-surface)]">{value}</span>
        <span className="text-xs text-[var(--text-on-surface-muted)]">{unit}</span>
      </div>
      {trend && (
        <div className={clsx("flex items-center gap-1 text-xs",
          trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-[var(--text-on-surface-muted)]")}>
          <TrendIcon size={12} />
          <span>{trend === "flat" ? (trendFlat ?? "持平") : trend === "down" ? (trendDown ?? "下降中") : (trendUp ?? "上升中")}</span>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function History() {
  const { profile, modeSettings, lbmKg } = useUserStore();
  const { t, lang } = useLangStore();
  const dStr = (n: number) => lang === "zh" ? `${n}天` : `${n} days`;
  const fmtDay = (d: string) => fmtDayFn(d, lang);
  const { days, showCustom, setShowCustom, customRange, setCustomRange, modeCustom, setModeCustom, getFromTo, rangeTotal, selectPreset } = useDateRange(30);
  const [mainTab, setMainTab] = useState<MainTab>("overview");
  const [strSubTab, setStrSubTab] = useState<StrengthSubTab>("volume");
  const [selPart, setSelPart]    = useState<BodyPart | "全部">("全部");
  const [cardioFilter, setCardioFilter] = useState<CardioFilter>("all");
  const mainSwipe = useSwipeTabs(HISTORY_MAIN_TABS, mainTab, setMainTab as (t: string) => void);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());

  // Overview data
  const [weightData, setWeightData] = useState<WeightChartPoint[]>([]);
  const [calData, setCalData]       = useState<CalorieChartPoint[]>([]);
  const [mealCountData, setMealCountData] = useState<MealCountPoint[]>([]);
  const [loading, setLoading]       = useState(false);

  // Strength data
  const [strengthRows, setStrengthRows] = useState<StrengthDayRow[]>([]);
  const [partStats, setPartStats]       = useState<BodyPartStats[]>([]);

  // Max weight data
  interface MaxWeightExercise { exercise_name: string; body_part: string | null }
  interface MaxWeightPoint    { log_date: string; max_kg: number }
  const [maxWeightExercises, setMaxWeightExercises] = useState<MaxWeightExercise[]>([]);
  const [selMaxExs, setSelMaxExs]                   = useState<string[]>([]);
  const [maxWeightDataMap, setMaxWeightDataMap]     = useState<Record<string, MaxWeightPoint[]>>({});
  const [maxExPickerOpen, setMaxExPickerOpen]       = useState(false);

  // Running data
  const [runRows, setRunRows] = useState<RunDayRow[]>([]);

  // Other data
  const [otherRows, setOtherRows] = useState<OtherDayRow[]>([]);

  // Body composition & sleep data (for Body tab)
  const [bodyCompPoints, setBodyCompPoints] = useState<BodyCompPoint[]>([]);
  const [sleepPoints, setSleepPoints]       = useState<BodySleepPoint[]>([]);
  const [activeBodyChart, setActiveBodyChart] = useState<BodyChartMetric>("body_fat");

  const targets = (() => {
    if (!profile || !modeSettings) return null;
    try {
      const w = Math.round(profile.weight_kg);
      return calculateNutritionTargets({
        weightKg: w, lbmKg, mode: modeSettings.mode,
        tdee: computeTdee(profile, lbmKg),
        targetCalories: modeSettings.custom_calories ?? undefined,
      });
    } catch { return null; }
  })();

  // Compute from/to from current selection

  useEffect(() => {
    if (!profile) return;
    loadOverview();
    loadStrength();
    loadCardio();
    loadOther();
    loadMaxWeightExercises();
    loadBodyComp();
    loadBodySleep();
  }, [profile, days, modeCustom, customRange]);

  useEffect(() => {
    if (profile) loadCardio();
  }, [cardioFilter]);


  // Load active dates for calendar when custom mode is shown
  useEffect(() => {
    if (showCustom && profile) {
      loadActiveDates();
    }
  }, [showCustom, profile]);

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadActiveDates = async () => {
    if (!profile) return;
    try {
      setActiveDates(await getActiveDates(profile.user_id, ["meal", "exercise", "weight"]));
    } catch (e) { logError("History", e); }
  };

  const loadOverview = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { from, to } = getFromTo();
      const rangeDays = Math.max(
        Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1,
        1
      );
      if (modeCustom && customRange.start && customRange.end) {
        // Fetch weight and calorie data between from/to using direct DB queries
        const db = await getDb();
        const wRows = await db.select<{ log_date: string; weight_kg: number; body_fat_pct: number | null }[]>(`
          SELECT log_date, AVG(weight_kg) as weight_kg, AVG(body_fat_pct) as body_fat_pct
          FROM weight_log WHERE user_id=? AND log_date BETWEEN ? AND ? AND measurement_type='fasting'
          GROUP BY log_date ORDER BY log_date`, [profile.user_id, from, to]);
        const cRows = await db.select<{ log_date: string; calories: number; protein: number; carb: number; fat: number }[]>(`
          SELECT ml.log_date,
            ROUND(SUM(ml.quantity / fd.base_quantity * fd.calories_kcal), 0) as calories,
            ROUND(SUM(ml.quantity / fd.base_quantity * fd.protein_g), 0) as protein,
            ROUND(SUM(ml.quantity / fd.base_quantity * fd.carbohydrates_g), 0) as carb,
            ROUND(SUM(ml.quantity / fd.base_quantity * fd.fat_g), 0) as fat
          FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
          WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
          GROUP BY ml.log_date`, [profile.user_id, from, to]);
        const wMap = new Map(wRows.map(r => [r.log_date, r]));
        const cMap = new Map(cRows.map(r => [r.log_date, r]));
        // Build date array
        const dateArr: string[] = [];
        let cur = new Date(from);
        const end = new Date(to);
        while (cur <= end) {
          dateArr.push(format(cur, "yyyy-MM-dd"));
          cur = new Date(cur.getTime() + 86400000);
        }
        setWeightData(dateArr.map(d => ({
          date: d,
          weight:   wMap.get(d)?.weight_kg    ?? null,
          body_fat: wMap.get(d)?.body_fat_pct ?? null,
        })));
        setCalData(dateArr.map(d => ({
          date:     d,
          calories: cMap.get(d)?.calories ?? 0,
          target:   targets?.total_kcal ?? 2000,
          protein:  cMap.get(d)?.protein  ?? 0,
          carb:     cMap.get(d)?.carb     ?? 0,
          fat:      cMap.get(d)?.fat      ?? 0,
        })));

        const mRows = await db.select<{ log_date: string; meals: number }[]>(`
          SELECT ml.log_date, COUNT(DISTINCT ml.meal_type) as meals
          FROM meal_log ml
          WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
          GROUP BY ml.log_date`, [profile.user_id, from, to]);
        const mMap = new Map(mRows.map(r => [r.log_date, r.meals]));
        setMealCountData(dateArr.map(d => ({ date: d, meals: mMap.get(d) ?? 0 })));
      } else {
        const [w, c, m] = await Promise.all([
          getWeightHistory(profile.user_id, rangeDays),
          getCalorieHistory(profile.user_id, rangeDays, targets?.total_kcal ?? 2000),
          getMealCountHistory(profile.user_id, rangeDays),
        ]);
        setWeightData(w);
        setCalData(c);
        setMealCountData(m);
      }
    } catch (e) { logError("History", e); }
    setLoading(false);
  };

  const loadStrength = async () => {
    if (!profile) return;
    try {
      const db  = await getDb();
      const { from, to } = getFromTo();
      const rows = await db.select<StrengthDayRow[]>(`
        SELECT ss.log_date, ss.body_part,
          ROUND(SUM(st.weight_kg * st.reps), 1) as daily_volume,
          COUNT(DISTINCT ss.id) as session_count,
          ROUND(CAST(COUNT(st.id) AS REAL) / COUNT(DISTINCT ss.id), 1) as avg_sets
        FROM strength_session ss
        JOIN strength_set st ON st.session_id = ss.id
        WHERE ss.user_id=? AND ss.log_date >= ? AND ss.log_date <= ?
        GROUP BY ss.log_date, ss.body_part
        ORDER BY ss.log_date ASC`, [profile.user_id, from, to]);
      setStrengthRows(rows);

      // Per-body-part stats
      const bpMap = new Map<string, BodyPartStats>();
      for (const r of rows) {
        const p = r.body_part ?? "其他";
        if (!bpMap.has(p)) bpMap.set(p, { body_part: p, total_sessions: 0, total_sets: 0, avg_sets_per_session: 0, total_volume: 0 });
        const entry = bpMap.get(p)!;
        entry.total_sessions += r.session_count;
        entry.total_sets     += Math.round(r.avg_sets * r.session_count);
        entry.total_volume   += r.daily_volume;
      }
      for (const v of bpMap.values()) {
        v.avg_sets_per_session = v.total_sessions > 0 ? Math.round(v.total_sets / v.total_sessions) : 0;
      }
      setPartStats(Array.from(bpMap.values()).sort((a, b) => b.total_sessions - a.total_sessions));
    } catch (e) { logError("History", e); }
  };

  const loadMaxWeightExercises = async () => {
    if (!profile) return;
    try {
      const db = await getDb();
      const { from, to } = getFromTo();
      const rows = await db.select<MaxWeightExercise[]>(
        `SELECT DISTINCT exercise_name, body_part FROM strength_session
         WHERE user_id=? AND log_date BETWEEN ? AND ?
         ORDER BY exercise_name`, [profile.user_id, from, to]);
      setMaxWeightExercises(rows);
      // Remove any previously selected exercises that no longer exist in this range
      const validNames = new Set(rows.map(r => r.exercise_name));
      setSelMaxExs(prev => prev.filter(n => validNames.has(n)));
    } catch (e) { logError("History", e); }
  };

  const loadMaxWeightForExercise = async (exName: string): Promise<MaxWeightPoint[]> => {
    if (!profile || !exName) return [];
    try {
      const db = await getDb();
      const { from, to } = getFromTo();
      return await db.select<MaxWeightPoint[]>(
        `SELECT ss.log_date, MAX(st.weight_kg) as max_kg
         FROM strength_session ss
         JOIN strength_set st ON st.session_id = ss.id
         WHERE ss.user_id=? AND ss.exercise_name=? AND ss.log_date BETWEEN ? AND ?
         GROUP BY ss.log_date
         ORDER BY ss.log_date ASC`, [profile.user_id, exName, from, to]);
    } catch { return []; }
  };

  const toggleMaxExercise = async (exName: string) => {
    const isSelected = selMaxExs.includes(exName);
    if (isSelected) {
      setSelMaxExs(prev => prev.filter(n => n !== exName));
      setMaxWeightDataMap(prev => { const next = { ...prev }; delete next[exName]; return next; });
    } else {
      const data = await loadMaxWeightForExercise(exName);
      setSelMaxExs(prev => [...prev, exName]);
      setMaxWeightDataMap(prev => ({ ...prev, [exName]: data }));
    }
  };

  const loadCardio = async () => {
    if (!profile) return;
    try {
      const db   = await getDb();
      const { from, to } = getFromTo();
      // Build sub-filter clause
      let subFilter = "";
      if (cardioFilter === "running")       subFilter = " AND " + CARDIO_RUN_LIKE;
      else if (cardioFilter === "swimming") subFilter = " AND " + CARDIO_SWIM_LIKE;
      else if (cardioFilter === "cycling")  subFilter = " AND " + CARDIO_CYCLE_LIKE;
      const rows = await db.select<{ log_date: string; total_min: number; total_kcal: number; swim_mets_min: number; cycle_mets_min: number; total_mets_min: number; session_count: number }[]>(`
        SELECT log_date,
          SUM(duration_min) as total_min,
          ROUND(SUM(calories_burned), 1) as total_kcal,
          ROUND(SUM(CASE WHEN ${CARDIO_SWIM_LIKE}  THEN mets * duration_min ELSE 0 END), 2) as swim_mets_min,
          ROUND(SUM(CASE WHEN ${CARDIO_CYCLE_LIKE} THEN mets * duration_min ELSE 0 END), 2) as cycle_mets_min,
          ROUND(SUM(mets * duration_min), 2) as total_mets_min,
          COUNT(*) as session_count
        FROM exercise_log
        WHERE user_id=? AND log_date >= ? AND log_date <= ?
          AND (
            category = '有氧'
            OR ${CARDIO_RUN_LIKE} OR ${CARDIO_SWIM_LIKE} OR ${CARDIO_CYCLE_LIKE}
          )${subFilter}
        GROUP BY log_date
        ORDER BY log_date ASC`, [profile.user_id, from, to]);
      // Merge by date. Start with exercise_log rows.
      // est distance: speed ≈ mets km/h → km = mets_min / 60, split per type.
      const mk = (log_date: string): RunDayRow => ({
        log_date, total_min: 0, total_kcal: 0, est_km: 0, session_count: 0,
        km_running: 0, km_swimming: 0, km_cycling: 0,
      });
      const byDate = new Map<string, RunDayRow>();
      for (const r of rows) {
        const swimKm  = Math.round((r.swim_mets_min  / 60) * 10) / 10;
        const cycleKm = Math.round((r.cycle_mets_min / 60) * 10) / 10;
        const totKm   = Math.round((r.total_mets_min / 60) * 10) / 10;
        const runKm   = Math.max(0, Math.round((totKm - swimKm - cycleKm) * 10) / 10);
        byDate.set(r.log_date, {
          log_date:      r.log_date,
          total_min:     r.total_min,
          total_kcal:    r.total_kcal,
          est_km:        totKm,
          session_count: r.session_count,
          km_running:    runKm,
          km_swimming:   swimKm,
          km_cycling:    cycleKm,
        });
      }

      // Also include structured cardio logged via running_session / running_interval.
      // Distance/duration come from the intervals; calories are read from the
      // pre-computed running_session.calories_burned (METS-by-type model, kept
      // in sync by the activity page + a startup backfill). Calories live on the
      // session while distance lives on intervals, so they are queried separately
      // to avoid the join multiplying calories by the interval count.
      let typeFilter = "";
      const typeParams: string[] = [];
      if (cardioFilter === "running" || cardioFilter === "swimming" || cardioFilter === "cycling") {
        typeFilter = " AND COALESCE(rs.cardio_type,'running') = ?";
        typeParams.push(cardioFilter);
      }
      // Distance & duration per date AND cardio_type (real interval data).
      const runDist = await db.select<{ log_date: string; ct: string; total_min: number; total_km: number; session_count: number }[]>(`
        SELECT rs.log_date, COALESCE(rs.cardio_type,'running') as ct,
          SUM(ri.duration_min) as total_min,
          ROUND(SUM(ri.distance_km), 2) as total_km,
          COUNT(DISTINCT rs.id) as session_count
        FROM running_session rs
        JOIN running_interval ri ON ri.session_id = rs.id
        WHERE rs.user_id=? AND rs.log_date >= ? AND rs.log_date <= ?${typeFilter}
        GROUP BY rs.log_date, ct`, [profile.user_id, from, to, ...typeParams]);
      const runKcal = await db.select<{ log_date: string; total_kcal: number }[]>(`
        SELECT rs.log_date, ROUND(SUM(COALESCE(rs.calories_burned, 0)), 1) as total_kcal
        FROM running_session rs
        WHERE rs.user_id=? AND rs.log_date >= ? AND rs.log_date <= ?${typeFilter}
        GROUP BY rs.log_date`, [profile.user_id, from, to, ...typeParams]);
      const kcalByDate = new Map(runKcal.map(r => [r.log_date, r.total_kcal]));
      const kcalApplied = new Set<string>();

      for (const r of runDist) {
        const km  = r.total_km || 0;
        const ex  = byDate.get(r.log_date) ?? mk(r.log_date);
        ex.total_min     += r.total_min;
        ex.est_km        += km;
        ex.session_count += r.session_count;
        if (r.ct === "swimming")      ex.km_swimming += km;
        else if (r.ct === "cycling")  ex.km_cycling  += km;
        else                          ex.km_running  += km;
        // calories are per-session (not per type-group) — add once per date
        if (!kcalApplied.has(r.log_date)) {
          ex.total_kcal += kcalByDate.get(r.log_date) ?? 0;
          kcalApplied.add(r.log_date);
        }
        byDate.set(r.log_date, ex);
      }

      setRunRows([...byDate.values()].sort((a, b) => a.log_date.localeCompare(b.log_date)));
    } catch (e) { logError("History", e); }
  };

  const loadOther = async () => {
    if (!profile) return;
    try {
      const db   = await getDb();
      const { from, to } = getFromTo();
      const rows = await db.select<{ log_date: string; total_min: number; total_kcal: number; session_count: number; categories: string; exercise_names: string; exercise_names_en: string | null }[]>(`
        SELECT log_date,
          SUM(duration_min) as total_min,
          ROUND(SUM(calories_burned), 1) as total_kcal,
          COUNT(*) as session_count,
          GROUP_CONCAT(DISTINCT category) as categories,
          GROUP_CONCAT(DISTINCT exercise_name) as exercise_names,
          GROUP_CONCAT(DISTINCT COALESCE(NULLIF(name_en, ''), exercise_name)) as exercise_names_en
        FROM exercise_log
        WHERE user_id=? AND log_date >= ? AND log_date <= ?
          AND category != '重訓'
          AND category != '有氧'
          ${CARDIO_OTHER_EXCL}
        GROUP BY log_date
        ORDER BY log_date ASC`, [profile.user_id, from, to]);
      setOtherRows(rows);
    } catch (e) { logError("History", e); }
  };

  const loadBodyComp = async () => {
    if (!profile) return;
    try {
      const db = await getDb();
      const { from, to } = getFromTo();
      const rows = await db.select<{
        log_date: string; body_fat_pct: number | null; skeletal_muscle_kg: number | null;
        muscle_trunk_kg: number | null; muscle_left_arm_kg: number | null; muscle_right_arm_kg: number | null;
        muscle_left_leg_kg: number | null; muscle_right_leg_kg: number | null;
        body_water_pct: number | null; visceral_fat_level: number | null; waist_cm: number | null;
      }[]>(
        `SELECT log_date, body_fat_pct, skeletal_muscle_kg,
           muscle_trunk_kg, muscle_left_arm_kg, muscle_right_arm_kg, muscle_left_leg_kg, muscle_right_leg_kg,
           body_water_pct, visceral_fat_level, waist_cm
         FROM body_composition_log
         WHERE user_id=? AND log_date BETWEEN ? AND ?
         ORDER BY log_date ASC`,
        [profile.user_id, from, to]);
      const points: BodyCompPoint[] = rows.map(r => {
        const muscleParts = [
          r.muscle_trunk_kg, r.muscle_left_arm_kg, r.muscle_right_arm_kg,
          r.muscle_left_leg_kg, r.muscle_right_leg_kg,
        ].filter((v): v is number => v != null);
        const totalMuscle = muscleParts.length > 0
          ? muscleParts.reduce((s, v) => s + v, 0)
          : r.skeletal_muscle_kg;
        return {
          date:     r.log_date,
          body_fat: r.body_fat_pct,
          muscle:   totalMuscle,
          water:    r.body_water_pct,
          visceral: r.visceral_fat_level,
          waist:    r.waist_cm,
        };
      });
      setBodyCompPoints(points);
    } catch (e) { logError("History", e); }
  };

  const loadBodySleep = async () => {
    if (!profile) return;
    try {
      const db = await getDb();
      const { from, to } = getFromTo();
      const rows = await db.select<{ sleep_date: string; quality: SleepQuality; duration_hours: number | null }[]>(
        `SELECT sleep_date, quality, duration_hours FROM sleep_log
         WHERE user_id=? AND sleep_date BETWEEN ? AND ?
         ORDER BY sleep_date ASC`,
        [profile.user_id, from, to]);
      const sleepLabelMap: Record<SleepQuality, string> = {
        good:   t("body.sleep.good"),
        normal: t("body.sleep.normal"),
        poor:   t("body.sleep.poor"),
      };
      setSleepPoints(rows.map(r => ({
        date:         r.sleep_date,
        quality:      r.quality === "good" ? 3 : r.quality === "normal" ? 2 : 1,
        qualityLabel: sleepLabelMap[r.quality],
        hours:        r.duration_hours,
        color:        BODY_SLEEP_COLORS[r.quality],
      })));
    } catch (e) { logError("History", e); }
  };

  // ── Derived stats ────────────────────────────────────────────────────────────

  const weightPoints = weightData.filter(d => d.weight != null);
  const calPoints    = calData.filter(d => d.calories > 0);

  const avgWeight  = weightPoints.length ? (weightPoints.reduce((s, d) => s + d.weight!, 0) / weightPoints.length).toFixed(1) : "—";
  const avgCalorie = calPoints.length ? Math.round(calPoints.reduce((s, d) => s + d.calories, 0) / calPoints.length) : 0;
  const totalMeals = mealCountData.reduce((s, d) => s + d.meals, 0);

  const weightTrend = (() => {
    if (weightPoints.length < 4) return "flat" as const;
    const first = weightPoints.slice(0, 3).reduce((s, d) => s + d.weight!, 0) / 3;
    const last  = weightPoints.slice(-3).reduce((s, d) => s + d.weight!, 0) / 3;
    const diff  = last - first;
    if (diff < -0.3) return "down" as const;
    if (diff > 0.3)  return "up"   as const;
    return "flat" as const;
  })();

  const effectiveDays = Math.max(rangeTotal, 1);

  const avgMealCount = effectiveDays ? Math.round((totalMeals / effectiveDays) * 10) / 10 : 0;

  const filteredStrRows = selPart === "全部" ? strengthRows : strengthRows.filter(r => r.body_part === selPart);
  const weeklyStr       = toWeeklyVolume(filteredStrRows);
  const strFreqPerWeek  = weeklyFreq(filteredStrRows, effectiveDays);

  const totalRunKm     = runRows.reduce((s, r) => s + r.est_km, 0);
  const totalRunKcal   = runRows.reduce((s, r) => s + r.total_kcal, 0);
  const avgRunMin      = runRows.length ? Math.round(runRows.reduce((s, r) => s + r.total_min, 0) / runRows.length) : 0;
  const runFreqPerWeek = weeklyFreq(runRows, effectiveDays);

  const totalOtherKcal   = otherRows.reduce((s, r) => s + r.total_kcal, 0);
  const otherFreqPerWeek = weeklyFreq(otherRows, effectiveDays);

  const tickInterval = effectiveDays <= 7 ? 0 : effectiveDays <= 30 ? 4 : 13;

  const strKcalPerSession = (bpStats: BodyPartStats): number =>
    strengthEstKcal(bpStats.avg_sets_per_session, profile?.weight_kg ?? 70);

  // Freq per week for body part stats (uses effectiveDays)
  const bpFreqPerWeek = (ps: BodyPartStats): number =>
    Math.round((ps.total_sessions / Math.max(effectiveDays / 7, 1)) * 10) / 10;

  const MAIN_TABS = [
    { key: "overview"  as MainTab, label: t("history.tab.overview")  },
    { key: "strength"  as MainTab, label: t("history.tab.strength")  },
    { key: "cardio"    as MainTab, label: t("history.tab.cardio")    },
    { key: "other"     as MainTab, label: t("history.tab.other")     },
    { key: "body"      as MainTab, label: t("history.tab.body")      },
  ];


  if (!profile) return <NoProfile />;

  return (
    <>
    <div className="page-body max-w-3xl mx-auto space-y-5 pb-20 md:pb-6" {...mainSwipe}>
      {/* Sticky header */}
      <StickyHeader spaceY>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-on-bg)]">{t("history.title")}</h1>
            <p className="text-[var(--text-on-bg-muted)] font-bold text-sm mt-0.5">
              {modeCustom && customRange.start && customRange.end
                ? `${format(parseISO(customRange.start), "M/d")} — ${format(parseISO(customRange.end), "M/d")}`
                : `${format(subDays(new Date(), days - 1), "M/d")} — ${format(new Date(), "M/d")}`}
            </p>
          </div>
        </div>
        <DateRangePills
          days={days} modeCustom={modeCustom} showCustom={showCustom}
          onSelectPreset={selectPreset}
          onToggleCustom={() => setShowCustom(v => !v)}
        />
      </StickyHeader>

      {showCustom && (
        <DateRangePickerCard
          customRange={customRange} activeDates={activeDates}
          onRangeChange={r => { setCustomRange(r); setModeCustom(!!(r.start && r.end)); }}
          onApply={() => setShowCustom(false)}
          titleKey="history.pickRange"
          pickStartKey="history.pickStart"
          pickEndKey="history.pickEnd"
          applyKey="history.applyRange"
        />
      )}

      {/* Main tabs — scrollable on small screens */}
      <div className="pill-bar overflow-x-auto overscroll-x-contain">
        {MAIN_TABS.map(({ key, label }) => (
          <PillButton key={key} onClick={() => setMainTab(key)} isActive={mainTab === key}
            className="shrink-0 flex-1 min-w-[52px] py-2 text-xs whitespace-nowrap">
            {label}
          </PillButton>
        ))}
      </div>

      {/* ══════════════════════════════════════════════
          OVERVIEW TAB (existing content)
      ══════════════════════════════════════════════ */}
      {mainTab === "overview" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={Scale}    label={t("history.avgWeight")} value={avgWeight} unit="kg" trend={weightTrend} color="text-gray-600" trendFlat={t("history.trend.flat")} trendDown={t("history.trend.down")} trendUp={t("history.trend.up")} />
            <StatCard icon={Flame}    label={t("history.avgCalories")} value={avgCalorie > 0 ? String(avgCalorie) : "—"} unit="kcal" color="text-orange-500" />
            <StatCard icon={Droplets} label={t("history.recordDays")} value={String(calPoints.length)} unit={`/ ${dStr(days)}`} color="text-blue-500" />
          </div>

          <div className="card">
            <CardHeader title={t("history.weightTrend")}
              action={modeSettings?.target_weight_kg && modeSettings?.mode !== "custom"
                ? <span className="text-xs text-[var(--text-on-surface-muted)]">{t("history.targetLabel")} {modeSettings.target_weight_kg} kg</span>
                : undefined} />
            {loading ? (
              <div className="h-48 flex items-center justify-center text-[var(--text-on-surface-muted)] text-sm">{t("common.loading")}</div>
            ) : weightPoints.length < 2 ? (
              <EmptyState icon={Scale} message={t("history.noWeight")} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weightData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid {...GRID_STROKE} />
                  <XAxis dataKey="date" tickFormatter={fmt} interval={tickInterval}
                    {...AXIS_COMMON} />
                  <YAxis domain={["auto", "auto"]}
                    {...AXIS_COMMON} />
                  <Tooltip
                    labelFormatter={v => fmtDay(v as string)}
                    formatter={(v: number) => [`${v} kg`, t("history.weightLabel")]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  {modeSettings?.target_weight_kg && modeSettings?.mode !== "custom" && (
                    <ReferenceLine y={modeSettings.target_weight_kg} stroke="#10b981"
                      strokeDasharray="4 4" label={{ value: t("history.targetLabel"), fill: "#10b981", fontSize: 11 }} />
                  )}
                  <Line type="monotone" dataKey="weight" stroke={MACRO_COLORS.calories}
                    strokeWidth={2} dot={days <= 14} connectNulls activeDot={{ r: 4, fill: "#111827" }} />
                  {weightData.some(d => d.body_fat != null) && (
                    <Line type="monotone" dataKey="body_fat" stroke="#8b5cf6"
                      strokeWidth={1.5} dot={false} connectNulls strokeDasharray="5 5" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <CardHeader title={t("history.dailyCalories")}
              action={targets ? <span className="text-xs text-[var(--text-on-surface-muted)]">{t("history.targetLabel")} {Math.round(targets.total_kcal)} kcal</span> : undefined} />
            {calPoints.length < 2 ? (
              <EmptyState icon={Flame} message={t("history.noFood")} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={calData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid {...GRID_STROKE} />
                  <XAxis dataKey="date" tickFormatter={fmt} interval={tickInterval}
                    {...AXIS_COMMON} />
                  <YAxis {...AXIS_COMMON}
                    domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]} />
                  <Tooltip
                    labelFormatter={v => format(parseISO(v as string), "M/d")}
                    formatter={(v: number, name: string) => {
                      const labels: Record<string, string> = { calories: t("history.dailyCalories"), target: t("history.targetLabel") };
                      return [`${Math.round(v)} kcal`, labels[name] ?? name];
                    }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  {targets && <ReferenceLine y={Math.round(targets.total_kcal)} stroke="#10b981" strokeDasharray="4 4" />}
                  <Line type="monotone" dataKey="calories" stroke="#111827"
                    strokeWidth={2} dot={days <= 14} connectNulls activeDot={{ r: 4, fill: "#111827" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

            <div className="card">
              <CardHeader title={lang === "zh" ? "每日餐次" : "Meals per Day"}
                action={<span className="text-xs text-[var(--text-on-surface-muted)]">{lang === "zh" ? `均次數：${avgMealCount}/次` : `Avg: ${avgMealCount}/day`}</span>} />
              {mealCountData.length < 2 ? (
                <EmptyState icon={Flame} message={t("history.noFood")} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={mealCountData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid {...GRID_STROKE} />
                    <XAxis dataKey="date" tickFormatter={fmt} interval={tickInterval}
                      {...AXIS_COMMON} />
                    <YAxis type="number" dataKey="meals" {...AXIS_COMMON}
                      domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]} />
                    <Tooltip
                      labelFormatter={v => format(parseISO(v as string), "M/d")}
                      formatter={(v: number) => [`${v} 次`, lang === "zh" ? "餐次" : "Meals"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Line type="monotone" dataKey="meals" stroke="#111827"
                      strokeWidth={2} dot={days <= 14} connectNulls activeDot={{ r: 4, fill: "#111827" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          {calPoints.length >= 2 && (
            <div className="card">
              <CardHeader title={t("history.macroDist")} />
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={calData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid {...GRID_STROKE} />
                  <XAxis dataKey="date" tickFormatter={fmt} interval={tickInterval}
                    {...AXIS_COMMON} />
                  <YAxis {...AXIS_COMMON}
                    domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]} />
                  <Tooltip
                    labelFormatter={v => format(parseISO(v as string), "M/d")}
                    formatter={(v: number, name: string) => {
                      const l: Record<string, string> = { protein: t("dashboard.protein"), carb: t("dashboard.carb"), fat: t("dashboard.fat") };
                      return [`${Math.round(v)} g`, l[name] ?? name];
                    }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  <Area type="monotone" dataKey="protein" stackId="1" stroke={MACRO_COLORS.protein} fill={MACRO_COLORS.protein} fillOpacity={0.7} />
                  <Area type="monotone" dataKey="carb"    stackId="1" stroke={MACRO_COLORS.carb}    fill={MACRO_COLORS.carb}    fillOpacity={0.7} />
                  <Area type="monotone" dataKey="fat"     stackId="1" stroke={MACRO_COLORS.fat}     fill={MACRO_COLORS.fat}     fillOpacity={0.7} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-3 justify-center">
                {[[t("dashboard.protein"), MACRO_COLORS.protein], [t("dashboard.carb"), MACRO_COLORS.carb], [t("dashboard.fat"), MACRO_COLORS.fat]].map(([label, color]) => (
                  <div key={label as string} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color as string }} />
                    <span className="text-xs text-[var(--text-on-surface-muted)]">{label as string}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sleep trend */}
          <div className="card">
            <CardHeader title={lang === "zh" ? "睡眠趨勢" : "Sleep Trend"} />
            {sleepPoints.length < 2 ? (
              <EmptyState icon={Moon} message={t("body.noSleepRecord")} height="h-36" />
            ) : (
              <>
                {sleepPoints.some(p => p.hours != null) ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={sleepPoints} margin={{ top: 4, right: 8, bottom: 0, left: -25 }}>
                      <CartesianGrid {...GRID_STROKE} />
                      <XAxis dataKey="date" tickFormatter={fmt} interval={tickInterval}
                        {...AXIS_COMMON} />
                      <YAxis domain={["auto", "auto"]}
                        {...AXIS_COMMON} />
                      <Tooltip
                        labelFormatter={v => fmtDay(v as string)}
                        formatter={(v: number, _: string, entry: any) => [
                          `${v}h · ${entry.payload.qualityLabel}`,
                          lang === "zh" ? "睡眠" : "Sleep",
                        ]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                      <Line type="monotone" dataKey="hours" stroke="#6366f1" strokeWidth={2} connectNulls
                        dot={sleepDot} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={sleepPoints} margin={{ top: 4, right: 8, bottom: 0, left: -25 }}>
                      <CartesianGrid {...GRID_STROKE} />
                      <XAxis dataKey="date" tickFormatter={fmt} interval={tickInterval}
                        {...AXIS_COMMON} />
                      <YAxis domain={[0, 3]} ticks={[1, 2, 3]}
                        {...AXIS_COMMON} />
                      <Tooltip
                        labelFormatter={v => fmtDay(v as string)}
                        formatter={(_: number, __: string, entry: any) => [entry.payload.qualityLabel, lang === "zh" ? "睡眠" : "Sleep"]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                      <Line type="monotone" dataKey="quality" stroke="#6366f1" strokeWidth={2} connectNulls
                        dot={sleepDot} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                <SleepQualityLegend t={t} />
              </>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          STRENGTH TAB
      ══════════════════════════════════════════════ */}
      {mainTab === "strength" && (
        <>
          {/* Sub-tabs */}
          <div className="pill-bar">
            {([{ key: "volume", label: t("history.str.volume") }, { key: "freq", label: t("history.str.freq") }, { key: "maxweight", label: t("history.str.maxWeight") }] as const).map(stab => (
              <PillButton key={stab.key}
                onClick={() => { setStrSubTab(stab.key); if (stab.key === "maxweight") loadMaxWeightExercises(); }}
                isActive={strSubTab === stab.key}
                className="flex-1 py-2 text-xs whitespace-nowrap">
                {stab.label}
              </PillButton>
            ))}
          </div>

          {strSubTab === "volume" && (
            <>
              {/* Body part filter */}
              <div className="flex gap-1.5 flex-wrap">
                {(["全部", ...BODY_PARTS] as const).map(p => {
                  const chipLabel = p === "全部"
                    ? (lang === "zh" ? "全部" : "All")
                    : (lang === "zh" ? p : (BODY_PART_EN[p] ?? p));
                  return (
                    <button key={p} onClick={() => setSelPart(p)}
                      className={clsx("px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                        selPart === p ? "text-white" : "bg-white/10 text-[var(--text-on-bg-muted)] hover:bg-white/20")}
                      style={selPart === p && p !== "全部"
                        ? { backgroundColor: BODY_PART_COLORS[p] }
                        : selPart === p
                          ? { backgroundColor: "var(--color-primary)" }
                          : {}}>
                      {chipLabel}
                    </button>
                  );
                })}
              </div>

              {/* Summary stats */}
              {filteredStrRows.length > 0 && (() => {
                const totalVol  = filteredStrRows.reduce((s, r) => s + r.daily_volume, 0);
                const totalSess = filteredStrRows.reduce((s, r) => s + r.session_count, 0);
                const avg = totalSess > 0 ? totalVol / totalSess : 0;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <SummaryStatCard label={t("history.str.avgVol")}
                      value={avg >= 1000 ? (avg / 1000).toFixed(1) : Math.round(avg)}
                      unit={`${avg >= 1000 ? "t" : "kg"}/${lang === "zh" ? "次" : "sess"}`}
                      color="text-violet-600"
                      sub={`${lang === "zh" ? "總量" : "Total"} ${totalVol >= 1000 ? `${(totalVol/1000).toFixed(1)}t` : `${Math.round(totalVol)}kg`}`} />
                    <SummaryStatCard label={t("history.str.weeklyFreq")} value={strFreqPerWeek}
                      unit={t("common.perWeek")} sub={`${t("history.str.sessions")} ${totalSess}`} />
                  </div>
                );
              })()}

              {/* Weekly volume chart */}
              {weeklyStr.length >= 1 ? (
                <div className="card">
                  <CardHeader title={`${t("history.str.weeklyVol")}${selPart !== "全部" ? ` — ${selPart}` : ""}`} />
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={weeklyStr} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="week" {...AXIS_COMMON} />
                      <YAxis {...AXIS_COMMON}
                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v}`} />
                      <Tooltip
                        formatter={(v: number) => [`${Math.round(v)} kg`, t("history.volumeLabel")]}
                        labelFormatter={w => `${w} ${t("history.weekLabel")}`}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                      <Bar dataKey="volume" radius={[4, 4, 0, 0]} maxBarSize={40}
                        fill={selPart !== "全部" ? BODY_PART_COLORS[selPart] : "#8b5cf6"} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="card bg-[var(--surface)] text-center py-10">
                  <Dumbbell size={32} className="mx-auto mb-2 text-[var(--text-on-surface-muted)]" />
                  <p className="text-sm text-[var(--text-on-surface-muted)]">{t("history.noStrengthData")}</p>
                </div>
              )}

              {/* Recent sessions list (per day) */}
              {filteredStrRows.length > 0 && (
                <div className="card">
                  <CardHeader title={t("history.recentSessions")} mb="mb-3" />
                  <div className="space-y-2">
                    {[...filteredStrRows].reverse().slice(0, 10).map((r, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--surface-border)] last:border-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: r.body_part ? BODY_PART_COLORS[r.body_part] + "20" : "var(--surface-container)" }}>
                          <Dumbbell size={14} style={{ color: r.body_part ? BODY_PART_COLORS[r.body_part] : "var(--text-on-surface-muted)" }} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--text-on-surface)]">{fmt(r.log_date)}</span>
                            {r.body_part && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: BODY_PART_COLORS[r.body_part] }}>
                                {r.body_part}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-on-surface-muted)]">{r.session_count} {lang === "zh" ? "個動作" : "exercises"} · {Math.round(r.avg_sets)} {lang === "zh" ? "組均" : "avg sets"}</p>
                        </div>
                        <p className="text-sm font-bold text-violet-600">{Math.round(r.daily_volume)} kg</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {strSubTab === "maxweight" && (
            <>
              {maxWeightExercises.length === 0 ? (
                <div className="card bg-[var(--surface)] text-center py-10">
                  <Dumbbell size={32} className="mx-auto mb-2 text-[var(--text-on-surface-muted)]" />
                  <p className="text-sm text-[var(--text-on-surface-muted)]">{t("history.noStrengthRange")}</p>
                </div>
              ) : (
                <>
                  {/* Multi-select picker field */}
                  <div className="relative mb-4">
                    <button
                      onClick={() => setMaxExPickerOpen(o => !o)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] hover:border-[var(--color-outline-variant)] transition-colors text-sm">
                      <span className={selMaxExs.length === 0 ? "text-[var(--text-on-surface-muted)]" : "text-[var(--text-on-surface)] font-medium"}>
                        {selMaxExs.length === 0
                          ? t("history.selectExercises")
                          : selMaxExs.join("、")}
                      </span>
                      <span className="text-[var(--text-on-surface-muted)] text-xs ml-2 shrink-0">▾</span>
                    </button>

                    {maxExPickerOpen && (
                      <div className="absolute z-20 mt-1 w-full bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                        {maxWeightExercises.map(e => {
                          const checked = selMaxExs.includes(e.exercise_name);
                          const color = e.body_part ? (BODY_PART_COLORS[e.body_part] ?? "#8b5cf6") : "#8b5cf6";
                          return (
                            <button
                              key={e.exercise_name}
                              onClick={() => toggleMaxExercise(e.exercise_name)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-container-low)] transition-colors text-left">
                              <div className={clsx(
                                "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                checked ? "border-transparent" : "border-[var(--surface-border)]"
                              )} style={checked ? { backgroundColor: color } : {}}>
                                {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                              </div>
                              <span className="flex-1 text-sm text-[var(--text-on-surface)]">{e.exercise_name}</span>
                              {e.body_part && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: color + "20", color }}>
                                  {e.body_part}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Charts for each selected exercise */}
                  {selMaxExs.length === 0 ? (
                    <div className="card bg-[var(--surface)] text-center py-10">
                      <Dumbbell size={28} className="mx-auto mb-2 text-[var(--text-on-surface-muted)]" />
                      <p className="text-sm text-[var(--text-on-surface-muted)]">{t("history.noExSelected")}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selMaxExs.map(exName => {
                        const data = maxWeightDataMap[exName] ?? [];
                        const exInfo = maxWeightExercises.find(e => e.exercise_name === exName);
                        const color = exInfo?.body_part ? (BODY_PART_COLORS[exInfo.body_part] ?? "#8b5cf6") : "#8b5cf6";
                        return (
                          <div key={exName} className="card">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-[var(--text-on-surface-muted)]">{exName} · {t("history.maxLabel")}</p>
                              {data.length > 0 && (
                                <p className="text-lg font-bold text-[var(--text-on-surface)]">
                                  {Math.max(...data.map(d => d.max_kg))} kg
                                  <span className="text-xs font-normal text-[var(--text-on-surface-muted)] ml-1">{t("history.allTimeHigh")}</span>
                                </p>
                              )}
                            </div>
                            {data.length >= 2 ? (
                              <ResponsiveContainer width="100%" height={140}>
                                <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                                  <CartesianGrid {...GRID_STROKE} />
                                  <XAxis dataKey="log_date" tickFormatter={fmt}
                                    {...AXIS_COMMON} />
                                  <YAxis domain={["auto", "auto"]}
                                    {...AXIS_COMMON} />
                                  <Tooltip
                                    labelFormatter={v => fmtDay(v as string)}
                                    formatter={(v: number) => [`${v} kg`, t("history.maxLabel")]}
                                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                                  <Line type="monotone" dataKey="max_kg" stroke={color}
                                    strokeWidth={2} dot={{ r: 4, fill: color }} connectNulls activeDot={{ r: 5 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : data.length === 1 ? (
                              <p className="text-center py-3 text-xs text-[var(--text-on-surface-muted)]">
                                {data[0].max_kg} kg — {fmtDay(data[0].log_date)}
                              </p>
                            ) : (
                              <p className="text-center py-3 text-xs text-[var(--text-on-surface-muted)]">{t("history.noMaxWeightData")}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {strSubTab === "freq" && (
            <>
              <p className="text-xs text-[var(--text-on-bg-muted)]">{lang === "zh" ? "各部位週均頻率 · 均時長 · 均消耗（依訓練組數估算）" : "Per body part: weekly freq · avg duration · avg burn (estimated from sets)"}</p>

              {partStats.length === 0 ? (
                <div className="card bg-[var(--surface)] text-center py-10">
                  <Activity size={32} className="mx-auto mb-2 text-[var(--text-on-surface-muted)]" />
                  <p className="text-sm text-[var(--text-on-surface-muted)]">尚無重訓資料</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {partStats.map(ps => {
                    const freqPw  = bpFreqPerWeek(ps);
                    const avgMin  = ps.avg_sets_per_session * 3;
                    const avgKcal = strKcalPerSession(ps);
                    const color   = BODY_PART_COLORS[ps.body_part] ?? "#9ca3af";
                    return (
                      <div key={ps.body_part} className="card">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: color }}>
                            {ps.body_part}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-[var(--text-on-surface)]">{ps.body_part}</p>
                            <p className="text-xs text-[var(--text-on-surface-muted)]">{lang === "zh" ? `共 ${ps.total_sessions} 次訓練` : `${ps.total_sessions} sessions`}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold" style={{ color }}>
                              {freqPw}
                            </p>
                            <p className="text-xs text-[var(--text-on-surface-muted)]">次/週</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--surface-border)]">
                          <div className="text-center">
                            <Timer size={12} className="mx-auto mb-0.5 text-[var(--text-on-surface-muted)]" />
                            <p className="text-sm font-bold text-[var(--text-on-surface)]">{avgMin}</p>
                            <p className="text-[10px] text-[var(--text-on-surface-muted)]">{lang === "zh" ? "均時長（分）" : "Avg min"}</p>
                          </div>
                          <div className="text-center">
                            <Dumbbell size={12} className="mx-auto mb-0.5 text-[var(--text-on-surface-muted)]" />
                            <p className="text-sm font-bold text-[var(--text-on-surface)]">{ps.avg_sets_per_session}</p>
                            <p className="text-[10px] text-[var(--text-on-surface-muted)]">{lang === "zh" ? "均組數" : "Avg sets"}</p>
                          </div>
                          <div className="text-center">
                            <Flame size={12} className="mx-auto mb-0.5 text-[var(--text-on-surface-muted)]" />
                            <p className="text-sm font-bold text-[var(--text-on-surface)]">{avgKcal}</p>
                            <p className="text-[10px] text-[var(--text-on-surface-muted)]">{lang === "zh" ? "均消耗（kcal）" : "Avg burn (kcal)"}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════
          CARDIO TAB
      ══════════════════════════════════════════════ */}
      {mainTab === "cardio" && (
        <>
          {/* Cardio sub-filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "running", "swimming", "cycling"] as CardioFilter[]).map(f => {
              const labelMap: Record<CardioFilter, string> = {
                all:      lang === "zh" ? "全部" : "All",
                running:  lang === "zh" ? CARDIO_LABEL.running.zh  : CARDIO_LABEL.running.en,
                swimming: lang === "zh" ? CARDIO_LABEL.swimming.zh : CARDIO_LABEL.swimming.en,
                cycling:  lang === "zh" ? CARDIO_LABEL.cycling.zh  : CARDIO_LABEL.cycling.en,
              };
              return (
                <button key={f} onClick={() => setCardioFilter(f)}
                  className={clsx("px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                    cardioFilter === f ? "bg-[var(--color-primary)] text-white" : "bg-white/10 text-[var(--text-on-bg-muted)] hover:bg-white/20")}>
                  {labelMap[f]}
                </button>
              );
            })}
          </div>

          {runRows.length === 0 ? (
            <div className="card bg-[var(--surface)] text-center py-12">
              <Footprints size={36} className="mx-auto mb-2 text-[var(--text-on-surface-muted)]" />
              <p className="text-sm text-[var(--text-on-surface-muted)]">{t("history.noRunning")}</p>
              <p className="text-xs text-[var(--text-on-surface-muted)] mt-1">{t("history.noRunningDesc")}</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <SummaryStatCard label={t("history.totalDistKm")} value={totalRunKm.toFixed(1)} unit="km" />
                <SummaryStatCard label={t("history.runFreq")} value={runFreqPerWeek} unit={t("common.perWeek")} />
                <SummaryStatCard label={t("history.avgDuration")} value={avgRunMin} unit={lang === "zh" ? "分鐘/次" : "min/sess"} />
                <SummaryStatCard label={t("history.totalBurned")} value={Math.round(totalRunKcal)} unit="kcal" color="text-orange-500" />
              </div>

              {/* Distance trend */}
              <div className="card">
                <CardHeader title={t("history.distTitle")} />
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={runRows} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="log_date" tickFormatter={fmt}
                      {...AXIS_COMMON} />
                    <YAxis {...AXIS_COMMON} />
                    <Tooltip
                      labelFormatter={v => fmtDay(v as string)}
                      formatter={(v: number, name: string) => {
                        const l: Record<string, string> = {
                          est_km:      lang === "zh" ? "距離" : "Distance",
                          km_running:  lang === "zh" ? "跑步" : "Running",
                          km_swimming: lang === "zh" ? "游泳" : "Swimming",
                          km_cycling:  lang === "zh" ? "自行車" : "Cycling",
                        };
                        return [`${v} km`, l[name] ?? name];
                      }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    {cardioFilter === "all" ? (
                      <>
                        <Bar dataKey="km_running"  stackId="d" fill={CARDIO_COLORS.running}  maxBarSize={24} />
                        <Bar dataKey="km_swimming" stackId="d" fill={CARDIO_COLORS.swimming} maxBarSize={24} />
                        <Bar dataKey="km_cycling"  stackId="d" fill={CARDIO_COLORS.cycling}  radius={[4, 4, 0, 0]} maxBarSize={24} />
                      </>
                    ) : (
                      <Bar dataKey={`km_${cardioFilter}`} fill={CARDIO_COLORS[cardioFilter as keyof typeof CARDIO_COLORS]} radius={[4, 4, 0, 0]} maxBarSize={24} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                {cardioFilter === "all" && (
                  <div className="flex gap-4 mt-2 justify-center">
                    {([["running", lang === "zh" ? "跑步" : "Running"], ["swimming", lang === "zh" ? "游泳" : "Swimming"], ["cycling", lang === "zh" ? "自行車" : "Cycling"]] as const).map(([k, label]) => (
                      <div key={k} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CARDIO_COLORS[k] }} />
                        <span className="text-xs text-[var(--text-on-surface-muted)]">{label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Time + kcal line chart */}
              <div className="card">
                <CardHeader title={t("history.durationKcal")} />
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={runRows} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid {...GRID_STROKE} />
                    <XAxis dataKey="log_date" tickFormatter={fmt}
                      {...AXIS_COMMON} />
                    <YAxis yAxisId="min" orientation="left"
                      {...AXIS_COMMON} width={28} />
                    <YAxis yAxisId="kcal" orientation="right"
                      tick={{ fontSize: 11, fill: "#f97316" }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      labelFormatter={v => fmtDay(v as string)}
                      formatter={(v: number, name: string) => {
                        const l: Record<string, string> = { total_min: lang === "zh" ? "時長" : "Duration", total_kcal: lang === "zh" ? "消耗" : "Burn" };
                        const u: Record<string, string> = { total_min: lang === "zh" ? " 分" : " min", total_kcal: " kcal" };
                        return [`${Math.round(v)}${u[name] ?? ""}`, l[name] ?? name];
                      }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Line yAxisId="min"  type="monotone" dataKey="total_min"  stroke="#111827" strokeWidth={2} dot={false} connectNulls />
                    <Line yAxisId="kcal" type="monotone" dataKey="total_kcal" stroke="#f97316" strokeWidth={2} dot={false} connectNulls strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 justify-center">
                  {[[lang === "zh" ? "時長" : "Duration", "#111827", "solid"], [lang === "zh" ? "消耗" : "Burn", "#f97316", "dashed"]].map(([label, color, style]) => (
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
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════
          OTHER TAB
      ══════════════════════════════════════════════ */}
      {mainTab === "other" && (
        <>
          {otherRows.length === 0 ? (
            <div className="card bg-[var(--surface)] text-center py-12">
              <Activity size={36} className="mx-auto mb-2 text-[var(--text-on-surface-muted)]" />
              <p className="text-sm text-[var(--text-on-surface-muted)]">{t("history.noOther")}</p>
              <p className="text-xs text-[var(--text-on-surface-muted)] mt-1">{t("history.noOtherDesc")}</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              {(() => {
                const totalActs = otherRows.reduce((s, r) => s + r.session_count, 0);
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <SummaryStatCard label={t("history.runFreq")} value={otherFreqPerWeek} unit={t("common.perWeek")}
                      sub={lang === "zh" ? `共 ${totalActs} 次活動` : `${totalActs} activities`} />
                    <SummaryStatCard label={t("history.totalBurned")} value={Math.round(totalOtherKcal)} unit="kcal" color="text-orange-500" />
                  </div>
                );
              })()}

              {/* Kcal trend */}
              <div className="card">
                <CardHeader title={t("history.dailyActivityBurn")} />
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={otherRows} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="log_date" tickFormatter={fmt}
                      {...AXIS_COMMON} />
                    <YAxis {...AXIS_COMMON} />
                    <Tooltip
                      labelFormatter={v => fmtDay(v as string)}
                      formatter={(v: number) => [`${Math.round(v)} kcal`, lang === "zh" ? "消耗" : "Burn"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Bar dataKey="total_kcal" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Activity log */}
              <div className="card">
                <CardHeader title={t("history.recentSessions")} mb="mb-3" />
                <div className="space-y-2">
                  {[...otherRows].reverse().slice(0, 12).map((r, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--surface-border)] last:border-0">
                      <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                        <Activity size={14} className="text-orange-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[var(--text-on-surface)]">{fmt(r.log_date)}</p>
                        <p className="text-xs text-[var(--text-on-surface-muted)]">
                          {r.session_count} {t("history.items")} · {r.total_min} {t("exercise.min")}
                          {(() => {
                            const names = lang === "en" && r.exercise_names_en ? r.exercise_names_en : r.exercise_names;
                            return names ? ` · ${names}` : "";
                          })()}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-orange-500">{Math.round(r.total_kcal)} kcal</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════
          BODY TAB (body composition + sleep)
      ══════════════════════════════════════════════ */}
      {mainTab === "body" && (() => {
        const bodyChartOpts: { key: BodyChartMetric; label: string; color: string }[] = [
          { key: "body_fat", label: t("body.bodyFat"),    color: "#f97316" },
          { key: "muscle",   label: t("body.muscleMass"), color: "#10b981" },
          { key: "water",    label: t("body.water"),      color: "#0ea5e9" },
          { key: "visceral", label: t("body.visceralFat"), color: "#8b5cf6" },
          { key: "waist",    label: t("body.waist"),      color: "#ec4899" },
        ];
        const activeBodyOpt = bodyChartOpts.find(o => o.key === activeBodyChart)!;
        const hasBodyData   = bodyCompPoints.filter(p => p[activeBodyChart] != null).length >= 2;

        return (
          <>
            {/* Body composition chart */}
            <div className="card">
              <CardHeader title={t("body.tab.composition")} mb="mb-3" />
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {bodyChartOpts.map(o => (
                  <button key={o.key} onClick={() => setActiveBodyChart(o.key)}
                    className={clsx("px-3 py-1 rounded-full text-xs font-medium transition-all",
                      activeBodyChart === o.key ? "text-white" : "bg-[var(--surface-container)] text-[var(--text-on-surface-muted)] hover:bg-[var(--surface-container-low)]")}
                    style={activeBodyChart === o.key ? { backgroundColor: o.color } : {}}>
                    {o.label}
                  </button>
                ))}
              </div>
              {!hasBodyData ? (
                <EmptyState icon={Activity} message={t("body.chartMinData")} height="h-40" />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={bodyCompPoints} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid {...GRID_STROKE} />
                    <XAxis dataKey="date" tickFormatter={fmt} interval={tickInterval}
                      {...AXIS_COMMON} />
                    <YAxis domain={["auto", "auto"]}
                      {...AXIS_COMMON} />
                    <Tooltip
                      labelFormatter={v => fmtDay(v as string)}
                      formatter={(v: number) => [`${v}`, activeBodyOpt.label]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Line type="monotone" dataKey={activeBodyChart} stroke={activeBodyOpt.color}
                      strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Sleep quality chart */}
            <div className="card">
              <CardHeader title={t("body.tab.sleepRecord")} mb="mb-3" />
              {sleepPoints.length < 3 ? (
                <EmptyState icon={Moon} message={t("body.noSleepRecord")} height="h-32" iconSize={24} />
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={sleepPoints} margin={{ top: 4, right: 8, bottom: 0, left: -25 }}>
                    <CartesianGrid {...GRID_STROKE} />
                    <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), "M/d")} interval={tickInterval}
                      tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 3]} ticks={[1, 2, 3]}
                      tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      labelFormatter={v => fmtDay(v as string)}
                      formatter={(_: number, __: string, entry: any) => [entry.payload.qualityLabel, t("body.tab.sleepRecord")]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Bar dataKey="quality" radius={[4, 4, 0, 0]}>
                      {sleepPoints.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

              {/* Sleep duration line */}
              {sleepPoints.some(p => p.hours != null) && (
                <div className="mt-3">
                  <p className="text-xs text-[var(--text-on-surface-muted)] mb-2">{lang === "zh" ? "睡眠時長" : "Sleep duration"}</p>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={sleepPoints} margin={{ top: 4, right: 8, bottom: 0, left: -25 }}>
                      <CartesianGrid {...GRID_STROKE} />
                      <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), "M/d")} interval={tickInterval}
                        tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        labelFormatter={v => fmtDay(v as string)}
                        formatter={(v: number) => [`${v}h`, lang === "zh" ? "時長" : "Duration"]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                      <Line type="monotone" dataKey="hours" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Sleep quality legend */}
              <SleepQualityLegend t={t} />
            </div>
          </>
        );
      })()}
    </div>
    </>
  );
}
