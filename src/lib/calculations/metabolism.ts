export type Sex = 'male' | 'female';

/**
 * Lifestyle: how active a day is WITHOUT deliberate exercise — work, commute,
 * chores. Logged exercise is never folded in here; it is counted separately
 * and only meets intake in the day's settlement.
 */
export type Lifestyle = 'sedentary' | 'light' | 'moderate' | 'heavy';

/** TDEE = BMR × factor (includes the thermic effect of food). */
export const LIFESTYLE_FACTORS: Record<Lifestyle, number> = {
  sedentary: 1.20,
  light:     1.35,
  moderate:  1.50,
  heavy:     1.70,
};

export const LIFESTYLES = Object.keys(LIFESTYLE_FACTORS) as Lifestyle[];

const lifestyleFactor = (l: string | null | undefined): number =>
  LIFESTYLE_FACTORS[l as Lifestyle] ?? LIFESTYLE_FACTORS.sedentary;

/** Mifflin–St Jeor: weight(kg), height(cm), age(years) */
export function bmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/** Katch-McArdle: uses lean body mass only — more accurate when BF% is known. */
export function bmrKM(lbmKg: number): number {
  return 370 + 21.6 * lbmKg;
}

/** Daily-life energy above BMR for a lifestyle (no exercise). */
export function neat(bmrValue: number, lifestyle: string | null | undefined): number {
  return bmrValue * (lifestyleFactor(lifestyle) - 1);
}

export function tdeeBasic(bmrValue: number, neatValue: number): number {
  return bmrValue + neatValue;
}

/**
 * Compute TDEE (BMR × lifestyle, exercise excluded) from a user profile + optional stored LBM.
 * Uses Katch-McArdle when lbmKg is available, falls back to Mifflin-St Jeor.
 * Weight is rounded to integer to reduce noise from sub-kg fluctuations.
 */
export function computeTdee(
  profile: { weight_kg: number; height_cm: number; age: number; sex: Sex; lifestyle: string | null },
  lbmKg: number | null,
): number {
  const w = Math.round(profile.weight_kg);
  const b = lbmKg != null
    ? bmrKM(lbmKg)
    : bmr(w, profile.height_cm, profile.age, profile.sex);
  return Math.round(tdeeBasic(b, neat(b, profile.lifestyle)));
}

// ── Body composition (merged from bodyComposition.ts) ────────────────────────

export function fatMass(weightKg: number, fatPct: number): number {
  return weightKg * fatPct;
}

export function leanBodyMass(weightKg: number, fatPct: number): number {
  return weightKg - fatMass(weightKg, fatPct);
}

