import type { Mode } from '@/types';

// ── Nutrition helpers (merged from nutrition.ts) ──────────────────────────────

export const KCAL_PER_G = { protein: 4, carb: 4, fat: 9 } as const;

export function proteinKcal(grams: number): number { return grams * KCAL_PER_G.protein; }
export function carbKcal(grams: number): number     { return grams * KCAL_PER_G.carb; }
export function fatKcal(grams: number): number      { return grams * KCAL_PER_G.fat; }

export function totalCalories(proteinG: number, carbG: number, fatG: number): number {
  return proteinKcal(proteinG) + carbKcal(carbG) + fatKcal(fatG);
}

export interface MacroGrams { protein_g: number; carb_g: number; fat_g: number }
export interface MacroResult extends MacroGrams {
  protein_kcal: number; carb_kcal: number; fat_kcal: number; total_kcal: number;
}

export function macroResult(protein_g: number, carb_g: number, fat_g: number): MacroResult {
  const protein_kcal = proteinKcal(protein_g);
  const carb_kcal    = carbKcal(carb_g);
  const fat_kcal     = fatKcal(fat_g);
  return { protein_g, carb_g, fat_g, protein_kcal, carb_kcal, fat_kcal, total_kcal: protein_kcal + carb_kcal + fat_kcal };
}

// Re-exported so existing importers (`from "@/lib/calculations/strategy"`) keep working.
// Single source of truth lives in @/types.
export type { Mode };

const KCAL_PER_KG_FAT = 7700;
const MAX_DEFICIT = 1000;
const MAX_SURPLUS = 500;

const CUT_RATES: Record<string, number> = {
  cut_slow: 0.25, cut_normal: 0.5, cut_aggressive: 0.75,
};
const BULK_RATES: Record<string, number> = {
  bulk_lean: 0.10, bulk_normal: 0.15, bulk_aggressive: 0.25,
};

// Protein priority: LBM × 2 g/kg (when body fat known) or weight × 1.6 g/kg.
// Remaining kcal: 25 % fat, 75 % carb — consistent across all modes.
// Total kcal target is the only mode-specific variable.

export interface CustomRatio { protein: number; carb: number; fat: number }

export interface StrategyInput {
  weightKg: number;
  /** Stored lean body mass (kg). Present when body fat was ever recorded.
   *  Rule 3: LBM is fixed at first measurement; weight changes don't affect it. */
  lbmKg?: number | null;
  mode: Mode;
  tdee?: number;
  targetCalories?: number;
  customRatio?: CustomRatio;
  /** Fat kcal as fraction of TDEE (0.25–0.35). Default 0.30. Non-custom modes only. */
  fatKcalRatio?: number | null;
}

function targetKcalFromRate(
  weightKg: number,
  tdee: number,
  ratePct: number,
  isCut: boolean,
): number {
  const weeklyKg = (ratePct / 100) * weightKg;
  let dailyKcal = weeklyKg * KCAL_PER_KG_FAT / 7;
  dailyKcal = Math.min(dailyKcal, isCut ? MAX_DEFICIT : MAX_SURPLUS);
  return isCut ? tdee - dailyKcal : tdee + dailyKcal;
}

export function calculateNutritionTargets(input: StrategyInput): MacroResult {
  const { weightKg, lbmKg, mode, tdee, targetCalories, customRatio, fatKcalRatio } = input;

  if (mode === 'custom') {
    if (!targetCalories || targetCalories <= 0) throw new Error('targetCalories required for custom mode');
    if (!customRatio) throw new Error('customRatio required for custom mode');
    const total = customRatio.protein + customRatio.carb + customRatio.fat;
    if (total <= 0) throw new Error('customRatio sum must be > 0');
    const protein_g = (targetCalories * (customRatio.protein / total)) / 4;
    const carb_g    = (targetCalories * (customRatio.carb    / total)) / 4;
    const fat_g     = (targetCalories * (customRatio.fat     / total)) / 9;
    return macroResult(protein_g, carb_g, fat_g);
  }

  if (!tdee || tdee <= 0) throw new Error('tdee required for this mode');

  let targetKcal: number;
  if (mode in CUT_RATES)       targetKcal = targetKcalFromRate(weightKg, tdee, CUT_RATES[mode],  true);
  else if (mode in BULK_RATES) targetKcal = targetKcalFromRate(weightKg, tdee, BULK_RATES[mode], false);
  else                         targetKcal = tdee;

  // Rule 1: body fat known → protein = LBM × 2 g/kg
  // Rule 2: no body fat    → protein = weight × 1.6 g/kg
  const protein_g = lbmKg != null ? lbmKg * 2.0 : weightKg * 1.6;

  // Fat kcal = TDEE × ratio (user-adjustable 25–35%, default 30%)
  const ratio = Math.max(0.25, Math.min(0.35, fatKcalRatio ?? 0.30));
  const fat_g = (tdee * ratio) / 9;

  // Carb fills the remainder
  const carbKcalAmt = targetKcal - proteinKcal(protein_g) - fatKcal(fat_g);
  if (carbKcalAmt < 0) throw new Error('Protein + fat exceeds target calories');
  const carb_g = carbKcalAmt / 4;

  return macroResult(protein_g, carb_g, fat_g);
}

/** Suggested weekly weight change (kg) for given mode */
export function weeklyWeightChange(weightKg: number, mode: Mode): number {
  if (mode in CUT_RATES)  return -((CUT_RATES[mode]  / 100) * weightKg);
  if (mode in BULK_RATES) return  (BULK_RATES[mode] / 100) * weightKg;
  return 0;
}
