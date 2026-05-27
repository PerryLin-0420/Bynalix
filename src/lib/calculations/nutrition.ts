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
