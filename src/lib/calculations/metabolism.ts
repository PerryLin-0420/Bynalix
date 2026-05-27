export type Sex = 'male' | 'female';
export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

const NEAT_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:         0.10,
  lightly_active:    0.15,
  moderately_active: 0.20,
  very_active:       0.30,
  extra_active:      0.40,
};

/** Mifflin–St Jeor: weight(kg), height(cm), age(years) */
export function bmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/** Katch–McArdle: uses LBM(kg) — more accurate when body fat is known */
export function bmrHighAccuracy(lbmKg: number): number {
  return 370 + 21.6 * lbmKg;
}

/** Cunningham: for athletes */
export function bmrAthlete(lbmKg: number): number {
  return 500 + 22 * lbmKg;
}

export function neat(bmrValue: number, activityLevel: ActivityLevel): number {
  return bmrValue * (NEAT_MULTIPLIERS[activityLevel] ?? 0);
}

export function tdeeBasic(bmrValue: number, neatValue: number): number {
  return bmrValue + neatValue;
}

export function tdeeWithExercise(bmrValue: number, neatValue: number, exerciseKcal: number): number {
  return bmrValue + neatValue + exerciseKcal;
}
