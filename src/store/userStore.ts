import { create } from "zustand";
import { format, subDays } from "date-fns";
import { getDb } from "@/lib/db";
import type { UserProfile, ModeSettings, LatestWeightLog } from "@/types";

/**
 * NEAT window. A single week is far too short to set an activity level from:
 * the levels are a step function, so one quiet week could drop someone from
 * very_active to sedentary and move their TDEE by ~840 kcal overnight.
 *
 * The window therefore grows with available history — a week at minimum, up to
 * four weeks once that much exists — and days are weighted by recency so a
 * genuine change of habit still moves the level within a couple of weeks
 * instead of being averaged away.
 */
const NEAT_WINDOW_MIN_DAYS = 7;
const NEAT_WINDOW_MAX_DAYS = 28;
const NEAT_HALF_LIFE_DAYS  = 14;

/** Thresholds are training sessions per week, not raw days in the window. */
const ACTIVITY_FROM_WEEKLY_RATE: [number, UserProfile["activity_level"]][] = [
  [6.5, "extra_active"],
  [4.5, "very_active"],
  [2.5, "moderately_active"],
  [0.5, "lightly_active"],
  [0,   "sedentary"],
];

function activityFromWeeklyRate(perWeek: number): UserProfile["activity_level"] {
  for (const [min, level] of ACTIVITY_FROM_WEEKLY_RATE) {
    if (perWeek >= min) return level;
  }
  return "sedentary";
}

async function maybeSyncActivityLevel(
  db: Awaited<ReturnType<typeof getDb>>,
  profile: UserProfile,
): Promise<void> {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const uid = profile.user_id;

  // Re-evaluate weekly, but not tied to a particular weekday: gating on Sunday
  // meant that not opening the app that day skipped the update entirely.
  const [lastRun] = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key='last_activity_auto_update'"
  );
  if (lastRun?.value && lastRun.value > format(subDays(today, 7), "yyyy-MM-dd")) return;

  // How long this profile has been logging anything at all. Below a week there
  // is not enough to judge an activity level, and overwriting whatever the user
  // chose in Profile with a guess from two days of data would be worse than
  // leaving it alone.
  const [firstRow] = await db.select<{ first_day: string | null }[]>(
    `SELECT MIN(d) as first_day FROM (
       SELECT MIN(log_date) d FROM exercise_log     WHERE user_id=?
       UNION ALL SELECT MIN(log_date) FROM running_session  WHERE user_id=?
       UNION ALL SELECT MIN(log_date) FROM strength_session WHERE user_id=?
       UNION ALL SELECT MIN(log_date) FROM meal_log         WHERE user_id=?
       UNION ALL SELECT MIN(log_date) FROM weight_log       WHERE user_id=?
     ) WHERE d IS NOT NULL`,
    [uid, uid, uid, uid, uid]
  );
  if (!firstRow?.first_day) return;
  const historyDays = Math.floor(
    (today.getTime() - new Date(firstRow.first_day).getTime()) / 86_400_000) + 1;
  if (historyDays < NEAT_WINDOW_MIN_DAYS) return;

  const windowDays = Math.min(historyDays, NEAT_WINDOW_MAX_DAYS);
  const from = format(subDays(today, windowDays - 1), "yyyy-MM-dd");

  const rows = await db.select<{ log_date: string }[]>(
    `SELECT DISTINCT log_date FROM (
       SELECT log_date FROM exercise_log    WHERE user_id=? AND log_date BETWEEN ? AND ?
       UNION
       SELECT log_date FROM running_session WHERE user_id=? AND log_date BETWEEN ? AND ?
       UNION
       SELECT log_date FROM strength_session WHERE user_id=? AND log_date BETWEEN ? AND ?
     )`,
    [uid, from, todayStr, uid, from, todayStr, uid, from, todayStr]
  );
  const trained = new Set(rows.map(r => r.log_date));

  // Exponentially recency-weighted sessions per week.
  let weightSum = 0, trainedSum = 0;
  for (let i = 0; i < windowDays; i++) {
    const w = Math.pow(0.5, i / NEAT_HALF_LIFE_DAYS);
    weightSum += w;
    if (trained.has(format(subDays(today, i), "yyyy-MM-dd"))) trainedSum += w;
  }
  const perWeek = weightSum > 0 ? (trainedSum / weightSum) * 7 : 0;

  const newLevel = activityFromWeeklyRate(perWeek);
  if (newLevel !== profile.activity_level) {
    await db.execute(
      "UPDATE user_profile SET activity_level=? WHERE user_id=?",
      [newLevel, uid]
    );
    profile.activity_level = newLevel;
  }

  await db.execute(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_activity_auto_update', ?)",
    [todayStr]
  );
}

export type { UserProfile, ModeSettings, LatestWeightLog };

interface UserState {
  profile: UserProfile | null;
  modeSettings: ModeSettings | null;
  latestWeightLog: LatestWeightLog | null;
  /** Stored lean body mass (kg). Set once when BF% is first recorded; weight
   *  changes don't overwrite it so the protein target stays anchored to LBM. */
  lbmKg: number | null;
  isLoading: boolean;
  loadUser: () => Promise<void>;
  saveProfile: (data: Omit<UserProfile, "user_id">) => Promise<void>;
  saveMode: (data: Omit<ModeSettings, "id">) => Promise<void>;
  patchAdvConfig: (advGoalType: string | null, advGoalConfig: string | null, advStatVariables: string | null) => Promise<void>;
  patchAdv2Config: (adv2GoalConfig: string | null, adv2StatVariables: string | null) => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: null,
  modeSettings: null,
  latestWeightLog: null,
  lbmKg: null,
  isLoading: true,

  loadUser: async () => {
    try {
      const db = await getDb();
      const profiles = await db.select<UserProfile[]>(
        "SELECT * FROM user_profile ORDER BY user_id LIMIT 1"
      );
      const profile = profiles[0] ?? null;
      let modeSettings: ModeSettings | null = null;
      let latestWeightLog: LatestWeightLog | null = null;

      // Load stored LBM (written when BF% is first set)
      let lbmKg: number | null = null;
      const [lbmRow] = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key='lbm_kg'"
      );
      if (lbmRow) lbmKg = parseFloat(lbmRow.value) || null;

      if (profile) {
        const modes = await db.select<ModeSettings[]>(
          "SELECT * FROM mode_settings WHERE user_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1",
          [profile.user_id]
        );
        modeSettings = modes[0] ?? null;

        // Sync latest weight / body_fat from weight_log
        const [latestW] = await db.select<LatestWeightLog[]>(
          `SELECT weight_kg, body_fat_pct, log_date
           FROM weight_log
           WHERE user_id = ?
           ORDER BY log_date DESC, log_time DESC
           LIMIT 1`,
          [profile.user_id]
        );
        if (latestW) {
          latestWeightLog = latestW;
          profile.weight_kg = latestW.weight_kg;
          if (latestW.body_fat_pct != null) {
            profile.body_fat_pct = latestW.body_fat_pct;
          }
        }
      }

      // Auto-update activity level every Sunday based on past-7-day exercise data
      if (profile) {
        try { await maybeSyncActivityLevel(db, profile); } catch { /* non-blocking */ }
      }

      set({ profile, modeSettings, latestWeightLog, lbmKg, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  saveProfile: async (data) => {
    const db = await getDb();
    const { profile, lbmKg } = get();

    // Rule 3: when BF% is provided, compute LBM once and persist it.
    // Only overwrite stored LBM when the user actively changes body_fat_pct.
    let newLbmKg = lbmKg;
    if (data.body_fat_pct != null) {
      newLbmKg = data.weight_kg * (1 - data.body_fat_pct / 100);
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('lbm_kg', ?)",
        [String(newLbmKg)]
      );
    } else if (data.body_fat_pct == null && lbmKg != null) {
      // BF explicitly cleared → discard stored LBM
      newLbmKg = null;
      await db.execute("DELETE FROM app_settings WHERE key='lbm_kg'");
    }

    if (profile) {
      const r = await db.execute(
        `UPDATE user_profile SET name=?, height_cm=?, weight_kg=?, age=?, sex=?, activity_level=?, body_fat_pct=?, updated_date=datetime('now','localtime') WHERE user_id=?`,
        [data.name, data.height_cm, data.weight_kg, data.age, data.sex, data.activity_level, data.body_fat_pct, profile.user_id]
      );
      if (r.rowsAffected === 0) throw new Error("profile record not found");
      set({ profile: { ...profile, ...data }, lbmKg: newLbmKg });
    } else {
      const result = await db.execute(
        `INSERT INTO user_profile (name, height_cm, weight_kg, age, sex, activity_level, body_fat_pct) VALUES (?,?,?,?,?,?,?)`,
        [data.name, data.height_cm, data.weight_kg, data.age, data.sex, data.activity_level, data.body_fat_pct]
      );
      set({ profile: { user_id: result.lastInsertId as number, ...data }, lbmKg: newLbmKg });
    }
  },

  saveMode: async (data) => {
    const db = await getDb();
    const { profile } = get();
    if (!profile) return;
    await db.execute(
      "UPDATE mode_settings SET is_active = 0 WHERE user_id = ?",
      [profile.user_id]
    );
    const result = await db.execute(
      `INSERT INTO mode_settings
         (user_id, mode, target_weight_kg, custom_calories, custom_protein_g, custom_carb_g, custom_fat_g,
          water_goal_ml, goal_type, goal_amount_kg, goal_weeks, goal_is_fat,
          adv_goal_type, adv_goal_config, adv_stat_variables,
          adv2_goal_config, adv2_stat_variables, fat_kcal_ratio)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        profile.user_id, data.mode, data.target_weight_kg, data.custom_calories,
        data.custom_protein_g, data.custom_carb_g, data.custom_fat_g, data.water_goal_ml,
        data.goal_type, data.goal_amount_kg, data.goal_weeks, data.goal_is_fat,
        data.adv_goal_type ?? null, data.adv_goal_config ?? null, data.adv_stat_variables ?? null,
        data.adv2_goal_config ?? null, data.adv2_stat_variables ?? null,
        data.fat_kcal_ratio ?? 0.30,
      ]
    );
    set({ modeSettings: { id: result.lastInsertId as number, ...data } });
  },

  patchAdvConfig: async (advGoalType, advGoalConfig, advStatVariables) => {
    const db = await getDb();
    const { profile, modeSettings } = get();
    if (!profile) return;
    if (modeSettings) {
      const r = await db.execute(
        `UPDATE mode_settings SET adv_goal_type=?, adv_goal_config=?, adv_stat_variables=? WHERE id=?`,
        [advGoalType, advGoalConfig, advStatVariables, modeSettings.id]
      );
      if (r.rowsAffected === 0) console.warn("[DB] patchAdvConfig: mode_settings row not found", modeSettings.id);
      set({ modeSettings: { ...modeSettings, adv_goal_type: advGoalType, adv_goal_config: advGoalConfig, adv_stat_variables: advStatVariables } });
    }
  },

  patchAdv2Config: async (adv2GoalConfig, adv2StatVariables) => {
    const db = await getDb();
    const { profile, modeSettings } = get();
    if (!profile) return;
    if (modeSettings) {
      const r = await db.execute(
        `UPDATE mode_settings SET adv2_goal_config=?, adv2_stat_variables=? WHERE id=?`,
        [adv2GoalConfig, adv2StatVariables, modeSettings.id]
      );
      if (r.rowsAffected === 0) console.warn("[DB] patchAdv2Config: mode_settings row not found", modeSettings.id);
      set({ modeSettings: { ...modeSettings, adv2_goal_config: adv2GoalConfig, adv2_stat_variables: adv2StatVariables } });
    }
  },
}));
