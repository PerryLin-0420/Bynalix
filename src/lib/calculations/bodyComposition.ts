/** Body composition metrics. All fat_pct values are fractions (0.15 = 15%). */

export function bmi(weightKg: number, heightM: number): number {
  return weightKg / (heightM ** 2);
}

export function fatMass(weightKg: number, fatPct: number): number {
  return weightKg * fatPct;
}

export function leanBodyMass(weightKg: number, fatPct: number): number {
  return weightKg - fatMass(weightKg, fatPct);
}

export function ffmi(weightKg: number, heightM: number, fatPct: number): number {
  return leanBodyMass(weightKg, fatPct) / (heightM ** 2);
}

export function fmi(weightKg: number, heightM: number, fatPct: number): number {
  return fatMass(weightKg, fatPct) / (heightM ** 2);
}

/** Fat Free Mass percentage (0–100) */
export function ffmPercent(weightKg: number, fatPct: number): number {
  return (leanBodyMass(weightKg, fatPct) / weightKg) * 100;
}
