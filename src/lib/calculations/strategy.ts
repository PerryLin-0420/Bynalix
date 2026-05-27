import { macroResult, MacroResult, proteinKcal, fatKcal } from './nutrition';
import type { Mode } from '@/types';

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
  bulk_lean: 0.25, bulk_normal: 0.5, bulk_aggressive: 0.75,
};

// Macro rules: [protein g/kg, fat g/kg]
const CUT_MACRO      = [2.0, 0.8] as const;
const MAINTAIN_MACRO = [1.6, 1.0] as const;
const BULK_MACRO     = [1.6, 0.9] as const;

export interface CustomRatio { protein: number; carb: number; fat: number }

export interface StrategyInput {
  weightKg: number;
  mode: Mode;
  tdee?: number;
  targetCalories?: number;
  customRatio?: CustomRatio;
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
  const { weightKg, mode, tdee, targetCalories, customRatio } = input;

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
  let proteinPerKg: number;
  let fatPerKg: number;

  if (mode in CUT_RATES) {
    targetKcal = targetKcalFromRate(weightKg, tdee, CUT_RATES[mode], true);
    [proteinPerKg, fatPerKg] = CUT_MACRO;
  } else if (mode in BULK_RATES) {
    targetKcal = targetKcalFromRate(weightKg, tdee, BULK_RATES[mode], false);
    [proteinPerKg, fatPerKg] = BULK_MACRO;
  } else {
    // maintain
    targetKcal = tdee;
    [proteinPerKg, fatPerKg] = MAINTAIN_MACRO;
  }

  const protein_g   = proteinPerKg * weightKg;
  const fat_g       = fatPerKg * weightKg;
  const remaining   = targetKcal - proteinKcal(protein_g) - fatKcal(fat_g);
  if (remaining < 0) throw new Error('Protein and fat exceed target calories');
  const carb_g      = remaining / 4;

  return macroResult(protein_g, carb_g, fat_g);
}

/** Suggested weekly weight change (kg) for given mode */
export function weeklyWeightChange(weightKg: number, mode: Mode): number {
  if (mode in CUT_RATES)  return -((CUT_RATES[mode]  / 100) * weightKg);
  if (mode in BULK_RATES) return  (BULK_RATES[mode] / 100) * weightKg;
  return 0;
}
