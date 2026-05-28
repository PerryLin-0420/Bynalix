import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { fmtDay } from "@/lib/dateFormat";
import { Droplets, Dumbbell, Scale, TrendingDown, TrendingUp, Minus, Flame, Wheat } from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { calculateNutritionTargets } from "@/lib/calculations/strategy";
import { bmr, neat, tdeeBasic } from "@/lib/calculations/metabolism";
import { getDashboardTotals, type DashboardTotals } from "@/lib/db/queries/log";
import { getDashboardExtras, type DashboardExtras } from "@/lib/db/queries/dashboard";
import { linearTrend } from "@/lib/statistics/trend";
import { logError } from "@/lib/error";
import { clsx } from "clsx";


const MODE_INFO: Record<string, { label: string; color: string; icon: typeof TrendingDown }> = {
  cut_slow:        { label: "慢速減脂", color: "text-red-600 bg-red-50",   icon: TrendingDown },
  cut_normal:      { label: "標準減脂", color: "text-red-600 bg-red-50",   icon: TrendingDown },
  cut_aggressive:  { label: "積極減脂", color: "text-red-700 bg-red-100",  icon: TrendingDown },
  bulk_lean:       { label: "精實增肌", color: "text-blue-600 bg-blue-50", icon: TrendingUp },
  bulk_normal:     { label: "標準增肌", color: "text-blue-600 bg-blue-50", icon: TrendingUp },
  bulk_aggressive: { label: "積極增肌", color: "text-blue-700 bg-blue-100", icon: TrendingUp },
  maintain:        { label: "維持體重", color: "text-green-600 bg-green-50", icon: Minus },
  custom:          { label: "自訂目標", color: "text-purple-600 bg-purple-50", icon: Minus },
};

const MODE_LABEL_KEY: Record<string, string> = {
  cut_slow: "profile.mode.cutSlow", cut_normal: "profile.mode.cutNormal",
  cut_aggressive: "profile.mode.cutAggressive", bulk_lean: "profile.mode.bulkLean",
  bulk_normal: "profile.mode.bulkNormal", bulk_aggressive: "profile.mode.bulkAggressive",
  maintain: "profile.mode.maintain", custom: "profile.mode.custom",
};

export function Dashboard() {
  const { profile, modeSettings, loadUser, isLoading } = useUserStore();
  const { t, lang } = useLangStore();
  const today = format(new Date(), "yyyy-MM-dd");
  const todayLabel = fmtDay(today, lang);

  const [totals, setTotals] = useState<DashboardTotals>({
    calories: 0, protein: 0, carb: 0, fat: 0,
    water_ml: 0, exercise_kcal: 0, weight_kg: null,
  });
  const [extras, setExtras] = useState<DashboardExtras | null>(null);

  useEffect(() => { loadUser(); }, []);

  const targets = (() => {
    if (!profile || !modeSettings) return null;
    try {
      const b = bmr(profile.weight_kg, profile.height_cm, profile.age, profile.sex);
      const n = neat(b, profile.activity_level as any);
      const tdee = tdeeBasic(b, n);
      return calculateNutritionTargets({
        weightKg: profile.weight_kg, mode: modeSettings.mode, tdee,
        targetCalories: modeSettings.custom_calories ?? undefined,
        customRatio: modeSettings.mode === "custom" && modeSettings.custom_protein_g
          ? { protein: modeSettings.custom_protein_g, carb: modeSettings.custom_carb_g ?? 1, fat: modeSettings.custom_fat_g ?? 1 }
          : undefined,
      });
    } catch { return null; }
  })();

  useEffect(() => {
    if (!profile) return;
    loadTotals();
    loadExtras();
  }, [profile, today, targets?.total_kcal, targets?.protein_g, modeSettings?.water_goal_ml]);

  const loadTotals = async () => {
    try {
      setTotals(await getDashboardTotals(profile!.user_id, today));
    } catch (e) { logError("Dashboard.loadTotals", e); }
  };

  const loadExtras = async () => {
    if (!profile) return;
    try {
      setExtras(await getDashboardExtras(
        profile.user_id,
        today,
        {
          calories: targets?.total_kcal ?? 2000,
          protein:  targets?.protein_g  ?? 150,
          water_ml: modeSettings?.water_goal_ml ?? 2000,
        },
      ));
    } catch (e) { logError("Dashboard.loadExtras", e); }
  };

  const modeInfo = modeSettings ? MODE_INFO[modeSettings.mode] : null;
  const ModeIcon = modeInfo?.icon ?? Minus;

  const titleRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    let size = 24;
    el.style.fontSize = size + "px";
    while (el.scrollWidth > parent.clientWidth && size > 13) {
      size -= 0.5;
      el.style.fontSize = size + "px";
    }
  }, [profile?.name, lang]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-[var(--text-on-bg)]">{t("common.loading")}</div>
  );

  if (!profile) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
        <Scale size={28} className="text-[var(--text-on-bg)]" />
      </div>
      <div>
        <p className="text-lg font-semibold text-[var(--text-on-bg)]">{t("common.noProfile")}</p>
        <p className="text-sm text-[var(--text-on-bg-muted)] mt-1">前往「個人」頁面填入身體數據與目標模式</p>
      </div>
    </div>
  );

  const netCalories = totals.calories - totals.exercise_kcal;

  // ── Stat card sub-components ────────────────────────────────────────────────

  const waterGoal   = modeSettings?.water_goal_ml ?? 2000;
  const waterOver   = totals.water_ml > waterGoal;
  const waterRemain = Math.max(0, waterGoal - totals.water_ml);

  const WaterCard = (
    <div className="card">
      <div className="flex items-center gap-1.5 text-blue-500">
        <Droplets size={16} />
        <span className="text-xs font-medium">{t("dashboard.water")}</span>
      </div>
      <p className={clsx("text-xl font-bold", waterOver ? "text-blue-600" : "text-[var(--text-on-surface)]")}>
        {(totals.water_ml / 1000).toFixed(1)}
      </p>
      <p className="text-xs text-[var(--text-on-surface-muted)]">/ {(waterGoal / 1000).toFixed(1)} L</p>
      <div className="h-1.5 bg-[var(--surface-container)] rounded-full overflow-hidden">
        <div className={clsx("h-full rounded-full transition-all", waterOver ? "bg-blue-600" : "bg-blue-400")}
          style={{ width: `${Math.min((totals.water_ml / waterGoal) * 100, 100)}%` }} />
      </div>
      {waterOver
        ? <p className="text-[10px] text-blue-500 font-medium">✓ 達標 +{Math.round(totals.water_ml - waterGoal)} ml</p>
        : <p className="text-[10px] text-[var(--text-on-surface-muted)]">{t("dashboard.remaining")} {(waterRemain / 1000).toFixed(2).replace(/\.?0+$/, "")} L</p>
      }
    </div>
  );

  const ExerciseCard = (
    <div className="card">
      <div className="flex items-center gap-1.5 text-orange-500">
        <Dumbbell size={16} />
        <span className="text-xs font-medium">{t("dashboard.exercise")}</span>
      </div>
      <p className="text-xl font-bold text-[var(--text-on-surface)]">{Math.round(totals.exercise_kcal)}</p>
      <p className="text-xs text-[var(--text-on-surface-muted)]">{t("dashboard.burned")}</p>
      <div className="h-1.5 bg-[var(--surface-container)] rounded-full overflow-hidden">
        <div className="h-full bg-orange-400 rounded-full transition-all"
          style={{ width: `${Math.min((totals.exercise_kcal / 500) * 100, 100)}%` }} />
      </div>
    </div>
  );

  const WeightCard = (
    <div className="card">
      <div className="flex items-center gap-1.5 text-[var(--text-on-surface-sub)]">
        <Scale size={16} />
        <span className="text-xs font-medium">{t("dashboard.weight")}</span>
      </div>
      {totals.weight_kg != null ? (
        <>
          <p className="text-xl font-bold text-[var(--text-on-surface)]">{totals.weight_kg}</p>
          <p className="text-xs text-[var(--text-on-surface-muted)]">{t("dashboard.weightToday")}</p>
        </>
      ) : (
        <>
          <p className="text-xl font-bold text-[var(--text-on-surface)]">—</p>
          <p className="text-xs text-[var(--text-on-surface-muted)]">{t("dashboard.notLogged")}</p>
        </>
      )}
      {modeSettings?.target_weight_kg && (
        <p className="text-[10px] text-[var(--text-on-surface-muted)]">
          {t("dashboard.target")} {modeSettings.target_weight_kg} kg
        </p>
      )}
    </div>
  );

  const calTarget = targets?.total_kcal ?? 2000;

  // Concentric ring definitions: outer → inner
  const concentricRings = [
    {
      key: "calories",
      label: lang === "zh" ? "總熱" : "Calories",
      val: totals.calories, target: calTarget, unit: "kcal",
      r: 82, sw: 11,
      color: "#38bdf8", track: "rgba(56,189,248,0.10)",
      Icon: Flame,
    },
    {
      key: "carb",
      label: t("dashboard.carb"),
      val: totals.carb, target: targets?.carb_g ?? 200, unit: "g",
      r: 64, sw: 11,
      color: "#4ade80", track: "rgba(74,222,128,0.10)",
      Icon: Wheat,
    },
    {
      key: "protein",
      label: t("dashboard.protein"),
      val: totals.protein, target: targets?.protein_g ?? 150, unit: "g",
      r: 46, sw: 11,
      color: "#c084fc", track: "rgba(192,132,252,0.10)",
      Icon: Dumbbell,
    },
    {
      key: "fat",
      label: t("dashboard.fat"),
      val: totals.fat, target: targets?.fat_g ?? 60, unit: "g",
      r: 28, sw: 11,
      color: "#fb923c", track: "rgba(251,146,60,0.10)",
      Icon: Droplets,
    },
  ];

  const svgSize = 188;
  const svgCx   = svgSize / 2;

  const CalorieCard = (
    <div className="card p-5 relative overflow-hidden">
      {/* Scan-line texture */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.018) 3px,rgba(255,255,255,0.018) 4px)" }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative">
        <p className="text-base font-bold text-[var(--text-on-surface)]">
          {lang === "zh" ? "今日攝取" : "Daily Intake"}
        </p>
        {targets && (
          <p className="text-[10px] font-mono text-[var(--text-on-surface-muted)]">
            {lang === "zh" ? "目標" : "Target"} {Math.round(targets.total_kcal)} kcal
          </p>
        )}
      </div>

      {/* ── Top section: circles + current values ── */}
      <div className="flex gap-4 relative">
        {/* Concentric rings */}
        <div className="relative shrink-0" style={{ width: svgSize, height: svgSize }}>
          <svg width={svgSize} height={svgSize}
            style={{ transform: "rotate(-90deg)", filter: "drop-shadow(0 0 8px rgba(56,189,248,0.18))" }}>
            {concentricRings.map(ring => {
              const circ           = 2 * Math.PI * ring.r;
              const pct            = ring.target > 0 ? ring.val / ring.target : 0;
              const over           = pct > 1;
              const normalOffset   = circ * (1 - Math.min(pct, 1));
              const overflowOffset = circ * (1 - Math.min(pct - 1, 1));
              return (
                <g key={ring.key}>
                  <circle cx={svgCx} cy={svgCx} r={ring.r} fill="none" stroke={ring.track} strokeWidth={ring.sw} />
                  <circle cx={svgCx} cy={svgCx} r={ring.r} fill="none"
                    stroke={ring.color} strokeWidth={ring.sw}
                    strokeDasharray={circ} strokeDashoffset={normalOffset}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.5s ease" }}
                  />
                  {over && (
                    <circle cx={svgCx} cy={svgCx} r={ring.r} fill="none"
                      stroke="#ef4444" strokeWidth={ring.sw}
                      strokeDasharray={circ} strokeDashoffset={overflowOffset}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 0.5s ease" }}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Current values panel — right of circles, height matched to SVG */}
        <div className="flex-1 flex flex-col" style={{ height: svgSize }}>
          {/* 已攝取 / Consumed header */}
          <p className="text-xs font-bold text-[var(--text-on-surface)] pl-2 pb-2 shrink-0">
            {lang === "zh" ? "已攝取" : "Consumed"}
          </p>
          <div className="flex-1 flex flex-col">
          {concentricRings.map((ring, idx) => {
            const over = ring.val > ring.target;
            return (
              <div key={ring.key}
                className={clsx(
                  "flex-1 flex flex-col justify-center pl-2",
                  idx > 0 && "border-t border-[var(--surface-border)]"
                )}>
                {/* Item label */}
                <p className="text-[10px] font-semibold tracking-wide leading-none mb-1"
                  style={{ color: ring.color }}>
                  {ring.label}
                </p>
                {/* Bold current value */}
                <p className={clsx(
                  "text-[15px] font-mono font-bold tabular-nums leading-none",
                  over ? "text-red-400" : "text-[var(--text-on-surface)]"
                )}>
                  {Math.round(ring.val)}
                  <span className="text-[11px] font-normal ml-1 text-[var(--text-on-surface-muted)]">
                    {ring.unit}
                  </span>
                </p>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* ── Remaining section ── */}
      <div className="mt-4 pt-3 border-t border-[var(--surface-border)]">
        <p className="text-xs font-bold text-[var(--text-on-surface)] mb-3">
          {lang === "zh" ? "剩餘" : "Remaining"}
        </p>
        <div className="flex justify-around items-start">
          {concentricRings.map(ring => {
            const over = ring.val > ring.target;
            const diff = Math.round(Math.abs(ring.val - ring.target));
            return (
              <div key={ring.key} className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-0.5">
                  <ring.Icon size={10} style={{ color: over ? "#ef4444" : ring.color }} />
                  <span className={clsx(
                    "text-[12px] font-mono font-bold tabular-nums leading-none",
                    over ? "text-red-400" : "text-[var(--text-on-surface)]"
                  )}>
                    {over ? "+" : ""}{diff}
                  </span>
                  <span className="text-[9px] text-[var(--text-on-surface-muted)] ml-0.5">
                    {ring.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Net calories */}
      {totals.exercise_kcal > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--surface-border)] flex justify-between text-[10px] font-mono text-[var(--text-on-surface-muted)] relative">
          <span>{t("dashboard.intake")} {Math.round(totals.calories)}</span>
          <span className="text-green-500">−EX {Math.round(totals.exercise_kcal)}</span>
          <span className="text-[var(--text-on-surface)] font-bold">NET {Math.round(netCalories)} kcal</span>
        </div>
      )}
    </div>
  );

  // ── New cards (additive, depend on extras) ─────────────────────────────────

  const checks = [
    { key: "meal",     done: totals.calories > 0,         label: lang === "zh" ? "飲食" : "Meal",     icon: "🍽" },
    { key: "water",    done: totals.water_ml > 0,         label: lang === "zh" ? "飲水" : "Water",    icon: "💧" },
    { key: "exercise", done: totals.exercise_kcal > 0,    label: lang === "zh" ? "運動" : "Exercise", icon: "🏃" },
    { key: "weight",   done: totals.weight_kg != null,    label: lang === "zh" ? "體重" : "Weight",   icon: "⚖️" },
    { key: "sleep",    done: extras?.hasSleep ?? false,   label: lang === "zh" ? "睡眠" : "Sleep",    icon: "🌙" },
  ];
  const doneCount = checks.filter(c => c.done).length;
  const allDone   = doneCount === checks.length;

  const TodayChecklistCard = (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--text-on-surface)]">
          {lang === "zh" ? "今日記錄" : "Today's Log"}
        </p>
        <span className={clsx(
          "text-xs font-bold px-2 py-0.5 rounded-full",
          allDone ? "bg-green-50 text-green-600"
                  : "bg-[var(--surface-container)] text-[var(--text-on-surface-muted)]"
        )}>
          {doneCount}/{checks.length}
        </span>
      </div>
      <div className="flex justify-around">
        {checks.map(c => (
          <div key={c.key} className="flex flex-col items-center gap-1">
            <div className={clsx(
              "w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all",
              c.done ? "bg-green-50 border border-green-200"
                     : "bg-[var(--surface-container)] border border-transparent opacity-40"
            )}>
              {c.icon}
            </div>
            <span className={clsx(
              "text-[10px] font-medium",
              c.done ? "text-green-600" : "text-[var(--text-on-surface-muted)]"
            )}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const StreakCard = (() => {
    const streak = extras?.streak ?? 0;
    const message = streak === 0
      ? (lang === "zh" ? "今天開始記錄吧" : "Start logging today")
      : streak < 3   ? (lang === "zh" ? "繼續保持！" : "Keep it up!")
      : streak < 7   ? (lang === "zh" ? "狀態不錯！" : "Great progress!")
      : streak < 30  ? (lang === "zh" ? "養成習慣了！" : "Building a habit!")
                     : (lang === "zh" ? "驚人的堅持力！" : "Incredible consistency!");
    const fullCycles = Math.floor(streak / 7);
    const cumulative = streak > 7;

    // ── Cumulative mode (> 7 days) ───────────────────────────────────────────
    if (cumulative) {
      const MILESTONES = [7, 14, 30, 60, 100, 365];
      const next = MILESTONES.find(m => m > streak) ?? MILESTONES[MILESTONES.length - 1];
      const prev = [...MILESTONES].reverse().find(m => m <= streak) ?? 0;
      const span = Math.max(1, next - prev);
      const milestonePct = Math.min(100, ((streak - prev) / span) * 100);
      const remaining = Math.max(0, next - streak);

      return (
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-[var(--text-on-surface-muted)]">
                  {lang === "zh" ? "連續記錄" : "Logging Streak"}
                </p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                  {lang === "zh" ? "累計" : "Cumulative"}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-black text-[var(--text-accent)] leading-none">{streak}</span>
                <span className="text-sm font-medium text-[var(--text-on-surface-muted)]">
                  {lang === "zh" ? "天" : "days"}
                </span>
              </div>
              <p className="text-xs text-[var(--text-on-surface-muted)] mt-1">{message}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-[var(--text-on-surface-muted)] mb-0.5">
                {lang === "zh" ? "週循環" : "Cycles"}
              </p>
              <p className="text-lg font-bold text-[var(--text-accent)] leading-none">
                ×{fullCycles}
              </p>
              <p className="text-base mt-0.5">
                {"🔥".repeat(Math.min(fullCycles, 5))}
                {fullCycles > 5 && <span className="text-[10px] text-[var(--text-on-surface-muted)] ml-0.5">+{fullCycles - 5}</span>}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-[var(--text-on-surface-muted)] font-mono">{prev}d</span>
              <span className="text-[10px] text-[var(--text-on-surface)] font-bold">
                {lang === "zh" ? `下一里程碑 ${next} 天` : `Next milestone ${next}d`}
              </span>
              <span className="text-[10px] text-[var(--text-on-surface-muted)] font-mono">{next}d</span>
            </div>
            <div className="h-2 bg-[var(--surface-container)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500"
                style={{ width: `${milestonePct}%` }} />
            </div>
            <p className="text-[10px] text-[var(--text-on-surface-muted)] mt-1">
              {remaining > 0
                ? (lang === "zh" ? `還差 ${remaining} 天` : `${remaining} day(s) to go`)
                : (lang === "zh" ? "已達成所有里程碑 🎉" : "All milestones reached 🎉")}
            </p>
          </div>
        </div>
      );
    }

    // ── First-week mode (≤ 7 days) ──────────────────────────────────────────
    const cycleLen = 7;
    const cyclePct = streak > 0 ? ((streak % cycleLen) || cycleLen) / cycleLen : 0;
    const circ = 2 * Math.PI * 22;
    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--text-on-surface-muted)]">
              {lang === "zh" ? "連續記錄" : "Logging Streak"}
            </p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-3xl font-black text-[var(--text-accent)]">{streak}</span>
              <span className="text-sm font-medium text-[var(--text-on-surface-muted)]">
                {lang === "zh" ? "天" : "days"}
              </span>
            </div>
            <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">{message}</p>
          </div>
          <div className="relative w-14 h-14 shrink-0">
            <svg width={56} height={56} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={28} cy={28} r={22} fill="none"
                stroke="var(--surface-container)" strokeWidth={5} />
              <circle cx={28} cy={28} r={22} fill="none"
                stroke="var(--color-primary)" strokeWidth={5}
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - cyclePct)}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] font-bold text-[var(--text-accent)]">
                {streak > 0 ? `${((streak % cycleLen) || cycleLen)}/${cycleLen}` : "0/7"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          {Array.from({ length: 7 }).map((_, i) => {
            const daysAgo   = 6 - i;
            const hasRecord = streak > daysAgo;
            return (
              <div key={i} className={clsx(
                "flex-1 h-2 rounded-full transition-all",
                hasRecord ? "bg-[var(--color-primary)]" : "bg-[var(--surface-container)]"
              )} />
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-[var(--text-on-surface-muted)]">
            {lang === "zh" ? "7 天前" : "7d ago"}
          </span>
          <span className="text-[9px] text-[var(--text-on-surface-muted)]">
            {lang === "zh" ? "今天" : "Today"}
          </span>
        </div>
      </div>
    );
  })();

  const WeeklyAdherenceCard = (() => {
    if (!extras) return null;
    const items = [
      { label: lang === "zh" ? "熱量"   : "Calories", hit: extras.weekly.calorie,  color: "#38bdf8" },
      { label: lang === "zh" ? "蛋白質" : "Protein",  hit: extras.weekly.protein,  color: "#c084fc" },
      { label: lang === "zh" ? "飲水"   : "Water",    hit: extras.weekly.water,    color: "#60a5fa" },
      { label: lang === "zh" ? "運動"   : "Exercise", hit: extras.weekly.exercise, color: "#fb923c" },
    ];
    return (
      <div className="card">
        <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-3">
          {lang === "zh" ? "近 7 天達標率" : "7-Day Adherence"}
        </p>
        <div className="space-y-2.5">
          {items.map(item => {
            const pct = (item.hit / 7) * 100;
            return (
              <div key={item.label}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-[var(--text-on-surface-sub)]">{item.label}</span>
                  <span className="text-xs font-mono font-bold text-[var(--text-on-surface)]">
                    {item.hit}/7
                  </span>
                </div>
                <div className="h-1.5 bg-[var(--surface-container)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: item.color }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text-on-surface-muted)] mt-3">
          {lang === "zh" ? "熱量達標：攝取在目標的 80–110% 範圍內"
                        : "Calorie goal: within 80–110% of target"}
        </p>
      </div>
    );
  })();

  const WeightTrendCard = (() => {
    if (!extras || extras.weightPoints.length < 4) return null;
    const trend = linearTrend(extras.weightPoints);
    if (!trend) return null;

    const perWeek = trend.slopePerWeek;
    const isGain  = perWeek >  0.05;
    const isLoss  = perWeek < -0.05;
    const isFlat  = !isGain && !isLoss;

    const goalMode = modeSettings ? (
      ["cut_slow","cut_normal","cut_aggressive"].includes(modeSettings.mode) ? "cut"
      : ["bulk_lean","bulk_normal","bulk_aggressive"].includes(modeSettings.mode) ? "bulk"
      : "maintain"
    ) : "maintain";

    const isOnTrack =
      (goalMode === "cut"      && isLoss) ||
      (goalMode === "bulk"     && isGain) ||
      (goalMode === "maintain" && isFlat);

    const trendText = isFlat
      ? (lang === "zh" ? "持平" : "Stable")
      : `${perWeek > 0 ? "+" : ""}${perWeek.toFixed(2)} kg/${lang === "zh" ? "週" : "wk"}`;

    const trendColor = isOnTrack ? "text-green-500"
                     : isFlat    ? "text-[var(--text-on-surface-muted)]"
                                 : "text-amber-500";

    const r2Label = trend.r2 > 0.7 ? (lang === "zh" ? "趨勢穩定" : "Stable trend")
                  : trend.r2 > 0.4 ? (lang === "zh" ? "趨勢波動中" : "Some fluctuation")
                                   : (lang === "zh" ? "波動較大" : "High variance");

    const pts  = extras.weightPoints;
    const vals = pts.map(p => p.value);
    const min  = Math.min(...vals);
    const max  = Math.max(...vals);
    const range = max - min || 1;
    const W = 80, H = 36;
    const polyPoints = pts.map((p, i) => {
      const x = (i / Math.max(1, pts.length - 1)) * W;
      const y = H - ((p.value - min) / range) * H;
      return `${x},${y}`;
    }).join(" ");

    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--text-on-surface-muted)]">
              {lang === "zh" ? "體重趨勢（近 14 天）" : "Weight Trend (14d)"}
            </p>
            <p className={clsx("text-2xl font-black mt-0.5", trendColor)}>
              {trendText}
            </p>
            <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">
              {r2Label}
              {" · "}
              {isOnTrack ? (lang === "zh" ? "✓ 符合目標方向" : "✓ On track")
                         : (lang === "zh" ? "注意趨勢方向"   : "Check your trend")}
            </p>
          </div>
          <svg width={W} height={H} className="shrink-0 opacity-70">
            <polyline points={polyPoints} fill="none"
              stroke={isOnTrack ? "#10b981" : "#f59e0b"}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    );
  })();

  return (
    <>
      <div className="h-full flex flex-col max-w-4xl mx-auto p-3 md:p-6 overflow-hidden">
        <div
          className="relative z-30 -mx-3 md:-mx-6 px-3 md:px-6 pb-4 pt-1 md:pt-4 flex items-center justify-between shrink-0"
          style={{ background: 'var(--bg-main)', backgroundAttachment: 'fixed' }}
        >
          <div className="flex-1 min-w-0 overflow-hidden">
            <h1 ref={titleRef} className="font-bold text-[var(--text-on-bg)] whitespace-nowrap" style={{ fontSize: 24 }}>
              {profile.name ? `${t("dashboard.greeting")}${profile.name}` : t("dashboard.title")}
            </h1>
            <p className="font-bold text-[var(--text-on-bg-muted)] text-sm mt-0.5">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {modeInfo && modeSettings && (
              <div className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold", modeInfo.color)}>
                <ModeIcon size={12} />
                {t(MODE_LABEL_KEY[modeSettings.mode] as any)}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-28 pt-2">
          {CalorieCard}

          <div className="grid grid-cols-3 gap-3">
            {WaterCard}
            {ExerciseCard}
            {WeightCard}
          </div>

          {TodayChecklistCard}
          {extras && StreakCard}
          {extras && WeeklyAdherenceCard}
          {extras && WeightTrendCard}
        </div>

      </div>
    </>
  );
}
