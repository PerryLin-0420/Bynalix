// ─── User ───────────────────────────────────────────────────────────────────

export type Sex            = "male" | "female";
export type ActivityLevel  =
  | "sedentary" | "lightly_active" | "moderately_active"
  | "very_active" | "extra_active";
export type MealType       = "breakfast" | "lunch" | "dinner" | "snack";
export type WeightMeasType = "fasting" | "before_meal" | "after_meal";
export type Intensity      = "light" | "moderate" | "intense";
export type Mode =
  | "cut_slow" | "cut_normal" | "cut_aggressive"
  | "bulk_lean" | "bulk_normal" | "bulk_aggressive"
  | "maintain" | "custom";

export interface UserProfile {
  user_id:        number;
  name:           string;
  height_cm:      number;
  weight_kg:      number;
  age:            number;
  sex:            Sex;
  activity_level: string;   // free-form; ActivityLevel lists the canonical values
  body_fat_pct:   number | null;
}

export interface ModeSettings {
  id:               number;
  mode:             Mode;
  target_weight_kg: number | null;
  custom_calories:  number | null;
  custom_protein_g: number | null;
  custom_carb_g:    number | null;
  custom_fat_g:     number | null;
  water_goal_ml:    number | null;
  goal_type:        string | null;   // "reduce_fat" | "gain_muscle"
  goal_amount_kg:   number | null;   // target kg change
  goal_weeks:       number | null;   // timeframe in weeks
  goal_is_fat:      number | null;   // 1 = fat goal, 0 = muscle goal
  // v1.1 advanced goal
  adv_goal_type:       string | null; // null | 'exercise_performance' | 'body_composition'
  adv_goal_config:     string | null; // JSON: { category, metric, agg } or { metric }
  adv_stat_variables:  string | null; // JSON array of up to 5 variable keys
  // slot 2 (custom mode 進階2 tab)
  adv2_goal_config:    string | null;
  adv2_stat_variables: string | null;
  fat_kcal_ratio:      number | null;
}

export interface LatestWeightLog {
  weight_kg:    number;
  body_fat_pct: number | null;
  log_date:     string;
}

// ─── Statistics ──────────────────────────────────────────────────────────────

export interface DailyStatsRecord {
  date:               string;
  weight_kg:          number | null;
  calories:           number | null;
  protein_g:          number | null;
  carb_g:             number | null;
  fat_g:              number | null;
  water_ml:           number | null;
  exercise_count:     number | null;
  exercise_min:       number | null;
  exercise_kcal:      number | null;
  /** Cardio / general-exercise sessions logged that day. */
  cardio_count:       number | null;
  /** Strength-training sessions logged that day. */
  strength_count:     number | null;
  strength_volume_kg: number | null;
  sleep_quality:      number | null; // 3=good, 2=normal, 1=poor
  sleep_hours:        number | null;
}

// ─── Charts ──────────────────────────────────────────────────────────────────

export interface WeightChartPoint {
  date:      string;
  weight:    number | null;
  body_fat?: number | null;
}

export interface CalorieChartPoint {
  date:     string;
  calories: number;
  target:   number;
  protein:  number;
  carb:     number;
  fat:      number;
}
