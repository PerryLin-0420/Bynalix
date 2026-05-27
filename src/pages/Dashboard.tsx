import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { fmtDay } from "@/lib/dateFormat";
import { Droplets, Dumbbell, Scale, TrendingDown, TrendingUp, Minus, Flame, Wheat } from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { calculateNutritionTargets } from "@/lib/calculations/strategy";
import { bmr, neat, tdeeBasic } from "@/lib/calculations/metabolism";
import { getDashboardTotals, type DashboardTotals } from "@/lib/db/queries/log";
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

  useEffect(() => { loadUser(); }, []);

  useEffect(() => {
    if (!profile) return;
    loadTotals();
  }, [profile, today]);

  const loadTotals = async () => {
    try {
      setTotals(await getDashboardTotals(profile!.user_id, today));
    } catch { /* no data yet */ }
  };

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
        </div>

      </div>
    </>
  );
}
