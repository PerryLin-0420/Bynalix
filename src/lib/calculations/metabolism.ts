export type Sex = 'male' | 'female';
export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

// Harris-Benedict activity factors minus 1 (TDEE = BMR + BMR * factor = BMR * (1 + factor))
// Standard multipliers: sedentary 1.2, lightly 1.375, moderate 1.55, very 1.725, extra 1.9
const NEAT_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:         0.20,
  lightly_active:    0.375,
  moderately_active: 0.55,
  very_active:       0.725,
  extra_active:      0.90,
};

/** Mifflin–St Jeor: weight(kg), height(cm), age(years) */
export function bmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/** Katch-McArdle: uses lean body mass only — more accurate when BF% is known. */
export function bmrKM(lbmKg: number): number {
  return 370 + 21.6 * lbmKg;
}

export function neat(bmrValue: number, activityLevel: ActivityLevel): number {
  return bmrValue * (NEAT_MULTIPLIERS[activityLevel] ?? 0);
}

export function tdeeBasic(bmrValue: number, neatValue: number): number {
  return bmrValue + neatValue;
}

/**
 * Compute TDEE from a user profile + optional stored LBM.
 * Uses Katch-McArdle when lbmKg is available, falls back to Mifflin-St Jeor.
 * Weight is rounded to integer to reduce noise from sub-kg fluctuations.
 */
export function computeTdee(
  profile: { weight_kg: number; height_cm: number; age: number; sex: Sex; activity_level: string },
  lbmKg: number | null,
): number {
  const w = Math.round(profile.weight_kg);
  const b = lbmKg != null
    ? bmrKM(lbmKg)
    : bmr(w, profile.height_cm, profile.age, profile.sex);
  return Math.round(tdeeBasic(b, neat(b, profile.activity_level as ActivityLevel)));
}

// ── Body composition (merged from bodyComposition.ts) ────────────────────────

export function fatMass(weightKg: number, fatPct: number): number {
  return weightKg * fatPct;
}

export function leanBodyMass(weightKg: number, fatPct: number): number {
  return weightKg - fatMass(weightKg, fatPct);
}

