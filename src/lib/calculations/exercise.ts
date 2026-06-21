export type Intensity = 'light' | 'moderate' | 'intense';

const INTENSITY_FACTOR: Record<Intensity, number> = {
  light:    0.85,
  moderate: 1.00,
  intense:  1.15,
};

/**
 * Basic model: uses total body weight.
 * @param mets  Metabolic Equivalent of Task
 * @param weightKg  body weight in kg
 * @param durationMin  exercise duration in minutes
 * @param intensity  light / moderate / intense
 * @returns kcal burned
 */
export function exerciseKcalBasic(
  mets: number,
  weightKg: number,
  durationMin: number,
  intensity: Intensity = 'moderate',
): number {
  return mets * weightKg * (durationMin / 60) * INTENSITY_FACTOR[intensity];
}

/**
 * LBM model: more accurate for lean individuals.
 * @param lbmKg  lean body mass in kg
 */
export function exerciseKcalLbm(
  mets: number,
  lbmKg: number,
  durationMin: number,
  intensity: Intensity = 'moderate',
): number {
  return mets * lbmKg * (durationMin / 60) * INTENSITY_FACTOR[intensity];
}

// ── Cardio (running / swimming / cycling) ────────────────────────────────────
export type CardioType = 'running' | 'swimming' | 'cycling';

/**
 * METS for a cardio activity given its speed (km/h).
 * Values from the 2011 Compendium of Physical Activities (Ainsworth et al.).
 * Distance alone is NOT enough — the same distance costs very different energy
 * for running vs cycling vs swimming, so METS is selected by type + speed.
 */
export function cardioMets(type: CardioType, speedKmh: number): number {
  const s = speedKmh;
  if (type === 'cycling') {
    if (s < 16) return 4.0;
    if (s < 19) return 6.8;
    if (s < 22) return 8.0;
    if (s < 25) return 10.0;
    if (s < 30) return 12.0;
    return 15.8;
  }
  if (type === 'swimming') {
    if (s < 2.5) return 6.0;
    if (s < 3.2) return 8.3;
    return 10.0;
  }
  // running (default)
  if (s < 8)    return 8.3;
  if (s < 9.7)  return 9.8;
  if (s < 11.3) return 11.0;
  if (s < 12.9) return 11.8;
  if (s < 14.5) return 12.8;
  return 14.5;
}

/**
 * kcal for one cardio interval. Speed is derived from distance & duration,
 * then METS × weight × hours. Uses total body weight (consistent across the
 * activity page, history, and statistics).
 */
export function cardioIntervalKcal(
  type: CardioType,
  distanceKm: number,
  durationMin: number,
  weightKg: number,
): number {
  if (durationMin <= 0 || distanceKm <= 0 || weightKg <= 0) return 0;
  const speed = distanceKm / (durationMin / 60);
  return cardioMets(type, speed) * weightKg * (durationMin / 60);
}

/** kcal for a whole cardio session = sum of its intervals. */
export function cardioSessionKcal(
  type: CardioType,
  intervals: { distance_km: number; duration_min: number }[],
  weightKg: number,
): number {
  return Math.round(
    intervals.reduce((sum, iv) => sum + cardioIntervalKcal(type, iv.distance_km, iv.duration_min, weightKg), 0)
  );
}


/** MET during active work, scaled by lifted-weight / body-weight ratio.
 *  < 0.5 → light (3.5), 0.5–1.0 → moderate (5.0), > 1.0 → vigorous (6.5). */
function workMet(liftKg: number, bodyKg: number): number {
  const ratio = bodyKg > 0 ? liftKg / bodyKg : 0.5;
  if (ratio < 0.5)  return 3.5;
  if (ratio <= 1.0) return 5.0;
  return 6.5;
}

/**
 * Calorie estimate for a strength session using per-set data.
 *
 * Work phase : MET(lift/body ratio) × bodyKg × (reps × 3 sec / 3600)
 * Rest phase  : 2.0 MET × bodyKg × (rest_sec / 3600)  — only between sets
 */
export function strengthEstKcal(
  sets: { weight_kg: number; reps: number; rest_sec?: number | null }[],
  bodyWeightKg: number,
): number {
  const MET_REST   = 2.0;
  const SEC_PER_REP = 3;
  let kcal = 0;
  for (const s of sets) {
    kcal += workMet(s.weight_kg, bodyWeightKg) * bodyWeightKg * (s.reps * SEC_PER_REP / 3600);
    if (s.rest_sec) {
      kcal += MET_REST * bodyWeightKg * (s.rest_sec / 3600);
    }
  }
  return Math.round(kcal);
}

/** Simplified estimate when per-set detail is unavailable (history/stats averages).
 *  Assumes 10 reps at 50 % of body weight per set, no rest data. */
export function strengthEstKcalSimple(numSets: number, bodyWeightKg: number): number {
  const mockSets = Array.from({ length: Math.max(1, numSets) }, () => ({
    weight_kg: bodyWeightKg * 0.5,
    reps: 10,
    rest_sec: null as number | null,
  }));
  return strengthEstKcal(mockSets, bodyWeightKg);
}
