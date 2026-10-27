import { getDb } from "@/lib/db";
import type { TargetSettings } from "@/lib/dailyTargets";

/**
 * Body composition: per-segment muscle and fat, and the lean body mass (LBM)
 * the targets use.
 *
 * LBM drives BMR (Katch-McArdle) and the protein target, so it must not drift
 * with every weigh-in — but a real body-composition measurement should still
 * replace it. The rule: a body-fat % saved in 體態 (a measurement) updates LBM
 * when it is at least as recent as the reading LBM came from; a body-fat % typed
 * next to a weigh-in never does. The new LBM uses that day's weight and takes
 * effect from the measurement's date in profile_history, so earlier days keep
 * theirs.
 */

export const SEGMENTS = ["trunk", "left_arm", "right_arm", "left_leg", "right_leg"] as const;
export type Segment = typeof SEGMENTS[number];

export const muscleKey = (s: Segment) => `muscle_${s}_kg` as const;
export const fatKey    = (s: Segment) => `fat_${s}_kg` as const;

export interface CompEntry {
  id: number;
  body_fat_pct: number | null;
  skeletal_muscle_kg: number | null;
  muscle_trunk_kg: number | null;
  muscle_left_arm_kg: number | null;
  muscle_right_arm_kg: number | null;
  muscle_left_leg_kg: number | null;
  muscle_right_leg_kg: number | null;
  fat_trunk_kg: number | null;
  fat_left_arm_kg: number | null;
  fat_right_arm_kg: number | null;
  fat_left_leg_kg: number | null;
  fat_right_leg_kg: number | null;
  body_water_kg: number | null;
  visceral_fat_level: number | null;
  waist_cm: number | null;
  log_date: string;
  log_time: string;
  notes: string | null;
}

/** Sum of the filled segments, or null when none is filled. */
export function segmentTotal(values: (number | null | undefined)[]): number | null {
  const filled = values.filter((v): v is number => v != null && !isNaN(v));
  return filled.length ? Math.round(filled.reduce((s, v) => s + v, 0) * 10) / 10 : null;
}

export interface DayWeight { kg: number; date: string; fasting: boolean }

/**
 * The weight a measurement on `date` is judged at: the latest weigh-in on or
 * before it (fasting first within a day), else the first one ever.
 */
export async function weightForDate(userId: number, date: string): Promise<DayWeight | null> {
  const db = await getDb();
  const [row] = await db.select<{ weight_kg: number; log_date: string; measurement_type: string }[]>(
    `SELECT weight_kg, log_date, measurement_type FROM weight_log WHERE user_id=? AND log_date <= ?
     ORDER BY log_date DESC, (measurement_type = 'fasting') DESC, log_time DESC LIMIT 1`, [userId, date]);
  const r = row ?? (await db.select<{ weight_kg: number; log_date: string; measurement_type: string }[]>(
    "SELECT weight_kg, log_date, measurement_type FROM weight_log WHERE user_id=? ORDER BY log_date, log_time LIMIT 1",
    [userId]))[0];
  return r ? { kg: r.weight_kg, date: r.log_date, fasting: r.measurement_type === "fasting" } : null;
}

/** Whether a body-fat measurement dated `date` is new enough to replace LBM. */
export function replacesLbm(date: string, lbmDate: string | null): boolean {
  return lbmDate == null || date >= lbmDate;
}

/**
 * Store a new LBM measured on `date`: app_settings for the current value, and
 * profile_history from that date on — a row at `date` copied from the settings
 * in force then, and every later row — so past days keep their old LBM.
 */
export async function applyLbm(userId: number, lbmKg: number, date: string) {
  const db = await getDb();
  await db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('lbm_kg', ?)", [String(lbmKg)]);
  await db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('lbm_date', ?)", [date]);

  const rows = (await db.select<{ effective_date: string; settings: string }[]>(
    "SELECT effective_date, settings FROM profile_history WHERE user_id=? ORDER BY effective_date", [userId]))
    .flatMap(r => { try { return [{ date: r.effective_date, s: JSON.parse(r.settings) as TargetSettings }]; } catch { return []; } });
  if (!rows.length) return;  // no history yet — the first snapshot will carry the new LBM

  const inForce = [...rows].reverse().find(r => r.date <= date) ?? rows[0];
  await db.execute(
    "INSERT OR REPLACE INTO profile_history (user_id, effective_date, settings) VALUES (?,?,?)",
    [userId, date, JSON.stringify({ ...inForce.s, lbm_kg: lbmKg })]);
  for (const r of rows.filter(r => r.date > date)) {
    await db.execute(
      "UPDATE profile_history SET settings=? WHERE user_id=? AND effective_date=?",
      [JSON.stringify({ ...r.s, lbm_kg: lbmKg }), userId, r.date]);
  }
}
