import { format, addDays, parseISO } from "date-fns";
import { getDb } from "@/lib/db";
import { computeTdee } from "@/lib/calculations/metabolism";
import { calculateNutritionTargets, type MacroResult } from "@/lib/calculations/strategy";
import type { Mode, ModeSettings, Sex, UserProfile } from "@/types";

/**
 * Per-day TDEE and targets.
 *
 * Targets used to be computed from whatever the profile says now, so changing
 * lifestyle or goal mode silently rewrote every past day's target. Instead the
 * settings that decide a target are kept in `profile_history`, one row per day
 * they changed, and a past day is judged by the row in force on that day plus
 * the weight logged by then.
 */

/** Everything besides the day's weight that a day's TDEE and targets depend on. */
export interface TargetSettings {
  height_cm: number;
  age: number;
  sex: Sex;
  lifestyle: string | null;
  /** Fallback when no weight was logged by that day. */
  weight_kg: number;
  lbm_kg: number | null;
  mode: Mode;
  custom_calories: number | null;
  custom_protein_g: number | null;
  custom_carb_g: number | null;
  custom_fat_g: number | null;
  fat_kcal_ratio: number | null;
  water_goal_ml: number | null;
}

export interface DayTargets { tdee: number; targets: MacroResult | null; water_ml: number }

export function settingsSnapshot(profile: UserProfile, mode: ModeSettings, lbmKg: number | null): TargetSettings {
  return {
    height_cm: profile.height_cm, age: profile.age, sex: profile.sex, lifestyle: profile.lifestyle,
    weight_kg: profile.weight_kg, lbm_kg: lbmKg,
    mode: mode.mode, custom_calories: mode.custom_calories,
    custom_protein_g: mode.custom_protein_g, custom_carb_g: mode.custom_carb_g, custom_fat_g: mode.custom_fat_g,
    fat_kcal_ratio: mode.fat_kcal_ratio, water_goal_ml: mode.water_goal_ml,
  };
}

/** TDEE and targets for a day with these settings at this weight. */
export function targetsFor(s: TargetSettings, weightKg: number): DayTargets {
  const w = Math.round(weightKg);
  const tdee = computeTdee({ weight_kg: w, height_cm: s.height_cm, age: s.age, sex: s.sex, lifestyle: s.lifestyle }, s.lbm_kg);
  let targets: MacroResult | null = null;
  try {
    targets = calculateNutritionTargets({
      weightKg: w, lbmKg: s.lbm_kg, mode: s.mode, tdee,
      targetCalories: s.custom_calories ?? undefined,
      customRatio: s.mode === "custom" && s.custom_protein_g
        ? { protein: s.custom_protein_g, carb: s.custom_carb_g ?? 1, fat: s.custom_fat_g ?? 1 }
        : undefined,
      fatKcalRatio: s.mode !== "custom" ? (s.fat_kcal_ratio ?? 0.30) : undefined,
    });
  } catch { /* incomplete custom settings */ }
  return { tdee, targets, water_ml: s.water_goal_ml ?? 2000 };
}

/**
 * Record the settings in force from `date` (today by default). Saving again the
 * same day replaces that day's row, so a day keeps the last settings saved on it.
 */
export async function recordTargetSettings(userId: number, s: TargetSettings, date = format(new Date(), "yyyy-MM-dd")) {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO profile_history (user_id, effective_date, settings) VALUES (?,?,?)",
    [userId, date, JSON.stringify(s)]);
}

/**
 * First run with history: the current settings become the first row, dated at
 * the first logged day, so every existing day keeps the target it showed before.
 */
export async function ensureTargetHistory(userId: number, s: TargetSettings) {
  const db = await getDb();
  const [row] = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) as n FROM profile_history WHERE user_id=?", [userId]);
  if ((row?.n ?? 0) > 0) return;
  const [first] = await db.select<{ d: string | null }[]>(
    `SELECT MIN(d) as d FROM (
       SELECT MIN(log_date) d FROM meal_log WHERE user_id=?
       UNION ALL SELECT MIN(log_date) FROM weight_log WHERE user_id=?
       UNION ALL SELECT MIN(log_date) FROM water_log WHERE user_id=?
     ) WHERE d IS NOT NULL`, [userId, userId, userId]);
  await recordTargetSettings(userId, s, first?.d ?? undefined);
}

/**
 * TDEE and targets for every day in [from, to]: the settings row in force that
 * day (the earliest row for days before it) and the latest weight logged on or
 * before it (the first weight ever logged, then the profile's, before that).
 */
export async function getDailyTargets(userId: number, from: string, to: string): Promise<Map<string, DayTargets>> {
  const db = await getDb();
  const [rows, weights] = await Promise.all([
    db.select<{ effective_date: string; settings: string }[]>(
      "SELECT effective_date, settings FROM profile_history WHERE user_id=? ORDER BY effective_date", [userId]),
    db.select<{ log_date: string; weight_kg: number }[]>(
      "SELECT log_date, weight_kg FROM weight_log WHERE user_id=? AND log_date <= ? ORDER BY log_date, log_time", [userId, to]),
  ]);
  const out = new Map<string, DayTargets>();
  const history = rows.flatMap(r => {
    try { return [{ date: r.effective_date, s: JSON.parse(r.settings) as TargetSettings }]; } catch { return []; }
  });
  if (!history.length) return out;

  let hi = 0, wi = -1;
  for (let d = parseISO(from), end = parseISO(to); d <= end; d = addDays(d, 1)) {
    const ds = format(d, "yyyy-MM-dd");
    while (hi + 1 < history.length && history[hi + 1].date <= ds) hi++;
    while (wi + 1 < weights.length && weights[wi + 1].log_date <= ds) wi++;
    const s = history[hi].s;
    const weight = wi >= 0 ? weights[wi].weight_kg : (weights[0]?.weight_kg ?? s.weight_kg);
    out.set(ds, targetsFor(s, weight));
  }
  return out;
}
