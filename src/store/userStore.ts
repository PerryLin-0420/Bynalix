import { create } from "zustand";
import { getDb } from "@/lib/db";
import type { UserProfile, ModeSettings, LatestWeightLog } from "@/types";

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
          adv2_goal_config, adv2_stat_variables)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        profile.user_id, data.mode, data.target_weight_kg, data.custom_calories,
        data.custom_protein_g, data.custom_carb_g, data.custom_fat_g, data.water_goal_ml,
        data.goal_type, data.goal_amount_kg, data.goal_weeks, data.goal_is_fat,
        data.adv_goal_type ?? null, data.adv_goal_config ?? null, data.adv_stat_variables ?? null,
        data.adv2_goal_config ?? null, data.adv2_stat_variables ?? null,
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
