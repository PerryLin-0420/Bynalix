import { useState, useEffect, useCallback } from "react";
import { useSwipeTabs } from "@/hooks/useSwipe";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { calculateNutritionTargets, weeklyWeightChange, type Mode } from "@/lib/calculations/strategy";
import { bmr, bmrKM, tdeeBasic, neat } from "@/lib/calculations/metabolism";
import { checkBound, BOUNDS } from "@/lib/validate";
import { clsx } from "clsx";
import { Save, ChevronRight, Zap, TrendingDown, TrendingUp, Minus, FlaskConical, Target } from "lucide-react";

type GoalCategory  = "cut" | "maintain" | "bulk" | "custom";
type GoalIntensity = "slow" | "normal" | "aggressive";

export function Profile() {
  const { profile, modeSettings, latestWeightLog, loadUser, saveProfile, saveMode, lbmKg } = useUserStore();
  const { t, lang } = useLangStore();

  const ACTIVITY_LEVELS = [
    { value: "sedentary",         label: t("profile.activity.sedentary") },
    { value: "lightly_active",    label: t("profile.activity.light") },
    { value: "moderately_active", label: t("profile.activity.moderate") },
    { value: "very_active",       label: t("profile.activity.active") },
    { value: "extra_active",      label: t("profile.activity.extra") },
  ];

  const [tab, setTab] = useState<"profile" | "mode">("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const PROFILE_TABS = ["profile", "mode"] as const;
  const profileSwipe = useSwipeTabs(PROFILE_TABS, tab, useCallback((t: string) => {
    setTab(t as "profile" | "mode"); setSaveError("");
  }, []));
  // Profile form state
  const [form, setForm] = useState({
    name: "", height_cm: "", weight_kg: "", age: "",
    sex: "male" as "male" | "female",
    activity_level: "moderately_active",
    body_fat_pct: "",
  });
  // True when user actively edits BF% in this session — hides the inferred hint
  const [bfUserEdited, setBfUserEdited] = useState(false);

  // Mode form state — two-tier
  const [goalCategory, setGoalCategory]   = useState<GoalCategory>("maintain");
  const [goalIntensity, setGoalIntensity] = useState<GoalIntensity>("normal");

  // Derive the flat Mode from category + intensity (values stored in DB)
  const selectedMode: Mode =
    goalCategory === "maintain" ? "maintain"
    : goalCategory === "custom"  ? "custom"
    : goalCategory === "cut"
      ? (goalIntensity === "slow" ? "cut_slow" : goalIntensity === "normal" ? "cut_normal" : "cut_aggressive")
      : (goalIntensity === "slow" ? "bulk_lean" : goalIntensity === "normal" ? "bulk_normal" : "bulk_aggressive");

  const [targetWeight, setTargetWeight] = useState("");
  const [_customCal, _setCustomCal]   = useState("");
  const [customP, setCustomP]         = useState("");
  const [customC, setCustomC]         = useState("");
  const [customF, setCustomF]         = useState("");
  const [waterGoal, setWaterGoal]     = useState("");
  const [mlPerKg, setMlPerKg]         = useState("30");

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? "",
        height_cm: String(profile.height_cm),
        weight_kg: String(profile.weight_kg),
        age: String(profile.age),
        sex: profile.sex,
        activity_level: profile.activity_level,
        body_fat_pct: profile.body_fat_pct != null ? String(profile.body_fat_pct) : "",
      });
      setBfUserEdited(false); // reset on fresh load
    }
    if (modeSettings) {
      // Reverse-map flat mode → two-tier category + intensity
      const modeToCat: Record<string, GoalCategory> = {
        cut_slow: "cut", cut_normal: "cut", cut_aggressive: "cut",
        bulk_lean: "bulk", bulk_normal: "bulk", bulk_aggressive: "bulk",
        maintain: "maintain",
        custom: "custom",
      };
      const modeToInt: Record<string, GoalIntensity> = {
        cut_slow: "slow", cut_normal: "normal", cut_aggressive: "aggressive",
        bulk_lean: "slow", bulk_normal: "normal", bulk_aggressive: "aggressive",
        maintain: "normal", custom: "normal",
      };
      setGoalCategory(modeToCat[modeSettings.mode] ?? "maintain");
      setGoalIntensity(modeToInt[modeSettings.mode] ?? "normal");

      setTargetWeight(modeSettings.target_weight_kg ? String(modeSettings.target_weight_kg) : "");
      setCustomP(modeSettings.custom_protein_g ? String(modeSettings.custom_protein_g) : "");
      setCustomC(modeSettings.custom_carb_g ? String(modeSettings.custom_carb_g) : "");
      setCustomF(modeSettings.custom_fat_g ? String(modeSettings.custom_fat_g) : "");
      setWaterGoal(modeSettings.water_goal_ml ? String(modeSettings.water_goal_ml) : "");
    }
  }, [profile, modeSettings]);

  // Calculate preview targets
  // Auto-compute calories from macros (for custom category)
  const customCalFromMacros = (() => {
    const p = parseFloat(customP) || 0;
    const c = parseFloat(customC) || 0;
    const f = parseFloat(customF) || 0;
    if (!p && !c && !f) return null;
    return Math.round(p * 4 + c * 4 + f * 9);
  })();

  const previewTargets = (() => {
    try {
      const w  = parseFloat(form.weight_kg);
      const h  = parseFloat(form.height_cm);
      const a  = parseInt(form.age);
      const bf = form.body_fat_pct ? parseFloat(form.body_fat_pct) : null;
      if (!w || !h || !a) return null;
      // Preview LBM: computed from current form values (not yet persisted)
      const previewLbm = bf != null && bf > 0 ? w * (1 - bf / 100) : null;
      const wRounded = Math.round(w);
      const bmrVal  = previewLbm != null
        ? bmrKM(previewLbm)
        : bmr(wRounded, h, a, form.sex);
      const neatVal = neat(bmrVal, form.activity_level as any);
      const tdee    = tdeeBasic(bmrVal, neatVal);
      const targetCal = goalCategory === "custom"
        ? (customCalFromMacros ?? undefined)
        : undefined;
      return calculateNutritionTargets({
        weightKg: wRounded,
        lbmKg: previewLbm,
        mode: selectedMode,
        tdee,
        targetCalories: targetCal,
        customRatio: goalCategory === "custom" && customP && customC && customF
          ? { protein: parseFloat(customP), carb: parseFloat(customC), fat: parseFloat(customF) }
          : undefined,
      });
    } catch { return null; }
  })();

  const handleSaveProfile = async () => {
    setSaveError("");
    // Validate all required fields before hitting the DB
    const h = parseFloat(form.height_cm);
    const w = parseFloat(form.weight_kg);
    const a = parseInt(form.age);
    if (!form.name.trim())                       { setSaveError(t("profile.err.name")); return; }
    if (!form.height_cm || isNaN(h) || h <= 0)  { setSaveError(t("profile.err.height")); return; }
    if (h > 250)                                 { setSaveError(checkBound(form.height_cm,    BOUNDS.height,  lang)!); return; }
    if (!form.weight_kg || isNaN(w) || w <= 0)  { setSaveError(t("profile.err.weight")); return; }
    if (w > 300)                                 { setSaveError(checkBound(form.weight_kg,    BOUNDS.weight,  lang)!); return; }
    if (!form.age || isNaN(a) || a <= 0)         { setSaveError(t("profile.err.age")); return; }
    if (a > 130)                                 { setSaveError(checkBound(form.age,          BOUNDS.age,     lang)!); return; }
    if (form.body_fat_pct) {
      const bfErr = checkBound(form.body_fat_pct, BOUNDS.bodyFat, lang);
      if (bfErr)                                 { setSaveError(bfErr); return; }
    }

    setSaving(true);
    try {
      await saveProfile({
        name: form.name,
        height_cm: h,
        weight_kg: w,
        age: a,
        sex: form.sex,
        activity_level: form.activity_level,
        body_fat_pct: form.body_fat_pct ? parseFloat(form.body_fat_pct) : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setSaveError(`儲存失敗：${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMode = async () => {
    setSaveError("");
    const modeErr =
      (targetWeight ? checkBound(targetWeight, BOUNDS.targetWeight, lang) : null) ??
      (waterGoal   ? checkBound(waterGoal,    BOUNDS.waterGoal,    lang) : null) ??
      (mlPerKg     ? checkBound(mlPerKg,      BOUNDS.mlPerKg,      lang) : null) ??
      (customP     ? checkBound(customP,      BOUNDS.macroRatio,   lang) : null) ??
      (customC     ? checkBound(customC,      BOUNDS.macroRatio,   lang) : null) ??
      (customF     ? checkBound(customF,      BOUNDS.macroRatio,   lang) : null);
    if (modeErr) { setSaveError(modeErr); return; }
    setSaving(true);
    try {
      // For custom category, derive calories from macros
      const finalCustomCal = goalCategory === "custom"
        ? (customCalFromMacros ?? null)
        : null;

      await saveMode({
        mode: selectedMode,
        target_weight_kg: targetWeight ? parseFloat(targetWeight) : null,
        custom_calories: finalCustomCal,
        custom_protein_g: customP ? parseFloat(customP) : null,
        custom_carb_g: customC ? parseFloat(customC) : null,
        custom_fat_g: customF ? parseFloat(customF) : null,
        water_goal_ml: waterGoal ? parseInt(waterGoal) : null,
        goal_type: null,
        goal_amount_kg: null,
        goal_weeks: null,
        goal_is_fat: null,
        // Preserve advanced config set in Statistics page
        adv_goal_type: modeSettings?.adv_goal_type ?? null,
        adv_goal_config: modeSettings?.adv_goal_config ?? null,
        adv_stat_variables: modeSettings?.adv_stat_variables ?? null,
        adv2_goal_config: modeSettings?.adv2_goal_config ?? null,
        adv2_stat_variables: modeSettings?.adv2_stat_variables ?? null,
      });
      await loadUser(); // re-sync store so water goal propagates immediately
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setSaveError(`儲存失敗：${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-10 max-w-2xl mx-auto" {...profileSwipe}>
      {/* Sticky header + tabs */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 pb-4 pt-1 md:pt-4 shrink-0"
        style={{ background: 'var(--bg-main)', backgroundAttachment: 'fixed' }}>
        <h1 className="text-2xl font-bold text-[var(--text-on-bg)] mb-1">{t("profile.title")}</h1>
        <p className="text-[var(--text-on-bg-muted)] text-sm mb-4">{t("profile.subtitle")}</p>
        {/* Tabs */}
        <div className="pill-bar w-fit">
          {(["profile", "mode"] as const).map(tabKey => (
            <button key={tabKey} onClick={() => { setTab(tabKey); setSaveError(""); }}
              className={clsx("px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                tab === tabKey ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
              {tabKey === "profile" ? t("profile.tab.profile") : t("profile.tab.mode")}
            </button>
          ))}
        </div>
      </div>

      {tab === "profile" && (
        <div className="space-y-5">
          {/* Name */}
          <div className="card">
            <label className="block text-sm font-medium text-[var(--text-on-surface)] mb-1.5">{t("profile.name")}</label>
            <input className="input-base" placeholder="你的名字" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          {/* Body metrics */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-[var(--text-on-surface)]">{t("profile.bodyMetrics")}</p>
              {latestWeightLog && (
                <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                  {t("profile.syncedFrom")} {latestWeightLog.log_date} {t("profile.syncedRecord")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "height_cm",    label: t("profile.height"),  unit: "cm", placeholder: "175" },
                { key: "weight_kg",    label: t("profile.weight"),  unit: "kg", placeholder: "70" },
                { key: "age",          label: t("profile.age"),     unit: lang === "zh" ? "歲" : "y/o", placeholder: "25" },
                { key: "body_fat_pct", label: t("profile.bodyFat"), unit: "%",  placeholder: "15" },
              ].map(({ key, label, unit, placeholder }) => {
                const synced =
                  latestWeightLog &&
                  (key === "weight_kg" || (key === "body_fat_pct" && latestWeightLog.body_fat_pct != null));
                return (
                  <div key={key}>
                    <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">
                      {label}
                      {synced && <span className="ml-1 text-teal-500">↑</span>}
                    </label>
                    <div className="relative">
                      <input
                        className={clsx("input-base pr-10", synced && "border-teal-200 bg-teal-50/30")}
                        placeholder={placeholder}
                        inputMode={key === "age" ? "numeric" : "decimal"}
                        value={(form as any)[key]}
                        onChange={e => {
                          setForm(f => ({ ...f, [key]: e.target.value }));
                          if (key === "body_fat_pct") setBfUserEdited(true);
                        }}
                      />
                      <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">{unit}</span>
                    </div>
                    {/* Inferred BF% — shown whenever lbm_kg is stored and user hasn't manually edited BF this session */}
                    {key === "body_fat_pct" && !bfUserEdited && lbmKg != null && profile && (() => {
                      const w = Math.round(profile.weight_kg);
                      if (lbmKg >= w) return null;
                      const inferredBf = ((w - lbmKg) / w * 100).toFixed(1);
                      return (
                        <p className="mt-1 text-[10px] text-[var(--text-on-surface-muted)]">
                          {lang === "zh"
                            ? `推算體脂：${inferredBf}%（依初始量測推算）`
                            : `Est. body fat: ${inferredBf}% (inferred from initial measurement)`}
                        </p>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sex */}
          <div className="card">
            <p className="text-sm font-medium text-[var(--text-on-surface)] mb-3">{t("profile.sex")}</p>
            <div className="flex gap-2">
              {(["male", "female"] as const).map(s => (
                <button key={s} onClick={() => setForm(f => ({ ...f, sex: s }))}
                  className={clsx("flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all",
                    form.sex === s ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]" : "border-[var(--surface-border)] text-[var(--text-on-surface-sub)] hover:border-[var(--text-on-surface-muted)]")}>
                  {s === "male" ? t("profile.male") : t("profile.female")}
                </button>
              ))}
            </div>
          </div>

          {/* Activity level */}
          <div className="card">
            <p className="text-sm font-medium text-[var(--text-on-surface)] mb-3">{t("profile.activity")}</p>
            <div className="space-y-2">
              {ACTIVITY_LEVELS.map(({ value, label }) => (
                <button key={value} onClick={() => setForm(f => ({ ...f, activity_level: value }))}
                  className={clsx("w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all",
                    form.activity_level === value
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                      : "border-[var(--surface-border)] text-[var(--text-on-surface-sub)] hover:border-[var(--text-on-surface-muted)]")}>
                  <span>{label}</span>
                  {form.activity_level === value && <ChevronRight size={16} />}
                </button>
              ))}
            </div>
          </div>

          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {saveError}
            </p>
          )}
          <button onClick={handleSaveProfile} disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            <Save size={16} />
            {saved ? t("common.saved") : saving ? t("common.saving") : t("profile.saveProfile")}
          </button>
        </div>
      )}

      {tab === "mode" && (
        <div className="space-y-5">
          {/* Two-tier mode selector */}
          <div className="card space-y-4">
            {/* Level 1: Category */}
            <div>
              <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-2">
                {lang === "zh" ? "目標方向" : "Goal Direction"}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { cat: "cut" as const,      icon: TrendingDown, color: "bg-red-50 border-red-300 text-red-700",     activeColor: "bg-red-500 border-red-500 text-white" },
                  { cat: "maintain" as const, icon: Minus,        color: "bg-green-50 border-green-300 text-green-700", activeColor: "bg-green-500 border-green-500 text-white" },
                  { cat: "bulk" as const,     icon: TrendingUp,   color: "bg-blue-50 border-blue-300 text-blue-700",  activeColor: "bg-blue-500 border-blue-500 text-white" },
                  { cat: "custom" as const,   icon: FlaskConical, color: "bg-[var(--surface-container)] border-[var(--surface-border)] text-[var(--text-on-surface-sub)]",  activeColor: "bg-[var(--color-primary)] border-[var(--color-primary)] text-white" },
                ] as const).map(({ cat, icon: Icon, color, activeColor }) => (
                  <button key={cat}
                    onClick={() => setGoalCategory(cat)}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border-2 text-xs font-semibold transition-all",
                      goalCategory === cat ? activeColor : color
                    )}>
                    <Icon size={16} />
                    <span>{t(`profile.mode.cat${cat.charAt(0).toUpperCase() + cat.slice(1)}` as any)}</span>
                    <span className="text-[9px] font-normal opacity-80 text-center leading-tight">{t(`profile.mode.cat${cat.charAt(0).toUpperCase() + cat.slice(1)}Desc` as any)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Level 2: Intensity (only for cut / bulk) */}
            {goalCategory !== "maintain" && goalCategory !== "custom" && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-2">
                  {lang === "zh" ? "速度 / 強度" : "Speed / Intensity"}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { int: "slow" as const,       descKey: goalCategory === "cut" ? "profile.mode.cutSlowDesc" : "profile.mode.bulkLeanDesc" },
                    { int: "normal" as const,     descKey: goalCategory === "cut" ? "profile.mode.cutNormalDesc" : "profile.mode.bulkNormalDesc" },
                    { int: "aggressive" as const, descKey: goalCategory === "cut" ? "profile.mode.cutAggressiveDesc" : "profile.mode.bulkAggressiveDesc" },
                  ] as const).map(({ int, descKey }) => (
                    <button key={int} onClick={() => setGoalIntensity(int)}
                      className={clsx(
                        "flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 text-xs font-medium transition-all",
                        goalIntensity === int
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                          : "border-[var(--surface-border)] text-[var(--text-on-surface-sub)] hover:border-[var(--text-on-surface-muted)]"
                      )}>
                      <span className="font-semibold">{t(`profile.mode.int${int.charAt(0).toUpperCase() + int.slice(1)}` as any)}</span>
                      <span className="opacity-70 leading-tight text-center" style={{ fontSize: "9px" }}>{t(descKey as any)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Current mode summary */}
            <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-[var(--surface-container)]">
              <Target size={13} className="text-[var(--text-on-surface-muted)] shrink-0" />
              <p className="text-xs text-[var(--text-on-surface-sub)]">
                <span className="font-semibold text-[var(--text-on-surface)]">
                  {goalCategory === "maintain"
                    ? t("profile.mode.maintain")
                    : goalCategory === "custom"
                      ? t("profile.mode.catCustom" as any)
                      : t(`profile.mode.${goalCategory === "cut"
                          ? (goalIntensity === "slow" ? "cutSlow" : goalIntensity === "normal" ? "cutNormal" : "cutAggressive")
                          : (goalIntensity === "slow" ? "bulkLean" : goalIntensity === "normal" ? "bulkNormal" : "bulkAggressive")}` as any)}
                </span>
                {" · "}
                {goalCategory === "custom"
                  ? t("profile.mode.catCustomDesc" as any)
                  : t(`profile.mode.${goalCategory === "maintain" ? "maintainDesc" :
                    goalCategory === "cut"
                      ? (goalIntensity === "slow" ? "cutSlowDesc" : goalIntensity === "normal" ? "cutNormalDesc" : "cutAggressiveDesc")
                      : (goalIntensity === "slow" ? "bulkLeanDesc" : goalIntensity === "normal" ? "bulkNormalDesc" : "bulkAggressiveDesc")}` as any)}
              </p>
            </div>
          </div>

          {/* Target weight */}
          <div className={clsx("card", (goalCategory === "maintain" || goalCategory === "custom") && "opacity-40 pointer-events-none")}>
            <label className="block text-sm font-medium text-[var(--text-on-surface)] mb-1.5">{t("profile.targetWeight")}</label>
            <div className="relative">
              <input className="input-base pr-10" placeholder="60" inputMode="decimal" value={targetWeight}
                onChange={e => setTargetWeight(e.target.value)} />
              <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">kg</span>
            </div>
          </div>

          {/* Water goal */}
          <div className="card">
            <p className="text-sm font-medium text-[var(--text-on-surface)] mb-3">{t("profile.waterGoal")}</p>
            <div className="flex gap-2 items-end mb-3">
              <div className="flex-1">
                <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("profile.waterPerKg")}</label>
                <div className="relative">
                  <input className="input-base pr-8" placeholder="30" inputMode="decimal" value={mlPerKg}
                    onChange={e => {
                      setMlPerKg(e.target.value);
                      const w = parseFloat(form.weight_kg);
                      const r = parseFloat(e.target.value);
                      if (w > 0 && r > 0) setWaterGoal(String(Math.round(w * r)));
                      else setWaterGoal("");
                    }} />
                  <span className="absolute right-2 top-2 text-xs text-[var(--text-on-surface-muted)]">ml/kg</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("profile.waterTarget")}</label>
                <div className="relative">
                  <input className="input-base pr-10 bg-[var(--surface-container)] cursor-not-allowed opacity-70" placeholder="—" inputMode="numeric" value={waterGoal} readOnly />
                  <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">ml</span>
                </div>
              </div>
            </div>
            {waterGoal && (
              <p className="text-xs text-teal-600 bg-teal-50 rounded-lg px-3 py-1.5">
                {t("profile.dailyGoalLabel")}{parseInt(waterGoal) >= 1000
                  ? `${(parseInt(waterGoal) / 1000).toFixed(1)} L`
                  : `${waterGoal} ml`}
                {form.weight_kg && mlPerKg && `（${form.weight_kg} kg × ${mlPerKg} ml/kg）`}
              </p>
            )}
            {!waterGoal && (
              <p className="text-xs text-[var(--text-on-surface-muted)]">{t("profile.defaultWater")}</p>
            )}
          </div>

          {/* Custom macro override (only for custom category) */}
          {goalCategory === "custom" && (
            <div className="card space-y-3">
              <p className="text-sm font-medium text-[var(--text-on-surface)]">{lang === "zh" ? "每日宏量素目標" : "Daily Macro Targets"}</p>
              <p className="text-xs text-[var(--text-on-surface-muted)]">{lang === "zh" ? "輸入蛋白質、碳水、脂肪，熱量自動換算" : "Enter protein, carbs, fat — calories auto-calculated"}</p>
              <div className="grid grid-cols-3 gap-2">
                {([[t("dashboard.protein"), customP, setCustomP], [t("dashboard.carb"), customC, setCustomC], [t("food.oilFat"), customF, setCustomF]] as [string, string, (v: string) => void][]).map(
                  ([label, val, setter]) => (
                    <div key={label}>
                      <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{label} (g)</label>
                      <input className="input-base" placeholder="—" type="number" inputMode="decimal" min="0" value={val}
                        onChange={e => setter(e.target.value)} />
                    </div>
                  )
                )}
              </div>
              {customCalFromMacros !== null && (
                <div className="flex items-center gap-2 bg-teal-50 rounded-xl px-3 py-2">
                  <Zap size={13} className="text-teal-500 shrink-0" />
                  <p className="text-xs text-teal-700">
                    {lang === "zh" ? "換算熱量：" : "Calculated calories: "}
                    <span className="font-bold">{customCalFromMacros} kcal</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Preview targets */}
          {previewTargets && (
            <div className="card bg-[var(--surface)]">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-[var(--text-on-surface-muted)]" />
                <p className="text-sm font-medium text-[var(--text-on-surface)]">{t("profile.dailyTarget")}</p>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: t("dashboard.calories"), val: Math.round(previewTargets.total_kcal), unit: "kcal" },
                  { label: t("dashboard.protein"),  val: Math.round(previewTargets.protein_g),  unit: "g" },
                  { label: t("dashboard.carb"),     val: Math.round(previewTargets.carb_g),     unit: "g" },
                  { label: t("dashboard.fat"),      val: Math.round(previewTargets.fat_g),      unit: "g" },
                ].map(({ label, val, unit }) => (
                  <div key={label}>
                    <p className="text-lg font-bold text-[var(--text-on-surface)]">{val}</p>
                    <p className="text-xs text-[var(--text-on-surface-muted)]">{unit} {label}</p>
                  </div>
                ))}
              </div>
              {form.weight_kg && (
                <p className="text-xs text-[var(--text-on-surface-muted)] mt-3 text-center">
                  {t("profile.weeklyChange")}：{weeklyWeightChange(parseFloat(form.weight_kg), selectedMode).toFixed(2)} kg
                </p>
              )}
            </div>
          )}

          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {saveError}
            </p>
          )}
          <button onClick={handleSaveMode} disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            <Save size={16} />
            {saved ? t("common.saved") : saving ? t("common.saving") : t("profile.saveMode")}
          </button>
        </div>
      )}

    </div>
  );
}
