export function fatMass(weightKg: number, fatPct: number): number {
  return weightKg * fatPct;
}

export function leanBodyMass(weightKg: number, fatPct: number): number {
  return weightKg - fatMass(weightKg, fatPct);
}
