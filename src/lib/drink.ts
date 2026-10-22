/**
 * Advanced drinks: sugar level, cup size and toppings on top of a drink's
 * full-sugar nutrition.
 *
 * A drink in food_database stores its nutrition at FULL sugar per
 * base_quantity ml, like any other food, plus how much of that is sugar
 * (`sugar_g`) and how much of the sugar cannot be dialled down (`sugar_fixed_g`
 * — lactose in milk, fruit and yogurt-drink sugar, brown-sugar syrup that
 * shops don't adjust). Toppings live in their own table and are counted per
 * serving, independent of cup size and sugar level (they come pre-soaked in
 * syrup either way).
 *
 * What a logged drink adds beyond the plain ml scaling is stored on the
 * meal_log row as `adj_*`, so every existing "quantity / base × nutrient"
 * aggregate only needs `+ adj_*` to stay right.
 */

export interface DrinkFoodFields {
  base_quantity: number;
  drink_advanced: number;
  sugar_g: number | null;
  sugar_fixed_g: number;
  counts_as_water: number;
  default_toppings: string | null;
  /** JSON {"M": ml, "L": ml, "XL": ml}; a missing key hides that size. Null = CUP_PRESETS. */
  cup_sizes?: string | null;
}

export interface Topping {
  topping_id: number;
  name: string;
  name_en: string | null;
  calories_kcal: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  sugar_g: number;
  source_type: string;
}

export interface ToppingPick { id: number; qty: number }

export interface DrinkOpts {
  /** Share of full sugar kept, 0–1. */
  sugar: number;
  toppings: ToppingPick[];
}

export interface Macro { kcal: number; p: number; c: number; f: number }

/** Sugar levels as a share of full sugar — strictly proportional. */
export const SUGAR_LEVELS: { ratio: number; zh: string; en: string }[] = [
  { ratio: 1,   zh: "全糖",   en: "Full" },
  { ratio: 0.7, zh: "少糖",   en: "Less" },
  { ratio: 0.5, zh: "半糖",   en: "Half" },
  { ratio: 0.3, zh: "微糖",   en: "Light" },
  { ratio: 0.1, zh: "一分糖", en: "10%" },
  { ratio: 0,   zh: "無糖",   en: "None" },
];

/** Cup-size shortcuts. Brand-specific sizes can override these later. */
export type CupKey = "M" | "L" | "XL";
export interface CupSize { key: CupKey; ml: number; zh: string; en: string }

export const CUP_PRESETS: CupSize[] = [
  { key: "M",  ml: 500,  zh: "中杯",   en: "M" },
  { key: "L",  ml: 700,  zh: "大杯",   en: "L" },
  { key: "XL", ml: 1000, zh: "特大杯", en: "XL" },
];

export function parseCupSizes(json: string | null | undefined): Partial<Record<CupKey, number>> | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== "object") return null;
    const out: Partial<Record<CupKey, number>> = {};
    for (const c of CUP_PRESETS) if (typeof v[c.key] === "number" && v[c.key] > 0) out[c.key] = v[c.key];
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

/** The cup shortcuts for a drink: its own sizes when set, else the defaults. */
export function cupSizesFor(food: Pick<DrinkFoodFields, "cup_sizes">): CupSize[] {
  const own = parseCupSizes(food.cup_sizes);
  if (!own) return CUP_PRESETS;
  return CUP_PRESETS.filter(c => own[c.key] != null).map(c => ({ ...c, ml: own[c.key]! }));
}

/** Topping servings change in half steps, with no upper limit. */
export const TOPPING_STEP = 0.5;

const KCAL_PER_G_SUGAR = 4;

export function isAdvancedDrink(food: Pick<DrinkFoodFields, "drink_advanced">): boolean {
  return food.drink_advanced === 1;
}

export function parseToppings(json: string | null | undefined): ToppingPick[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter(t => typeof t?.id === "number" && t.qty > 0) : [];
  } catch { return []; }
}

export function parseDrinkOpts(json: string | null | undefined): DrinkOpts | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (typeof v?.sugar !== "number") return null;
    return { sugar: v.sugar, toppings: parseToppings(JSON.stringify(v.toppings ?? [])) };
  } catch { return null; }
}

export function defaultDrinkOpts(food: DrinkFoodFields): DrinkOpts {
  return { sugar: 1, toppings: parseToppings(food.default_toppings) };
}

const clampRatio = (v: number) => Math.min(1, Math.max(0, v));

/** Sugar per base_quantity that the sugar level acts on. */
export function adjustableSugar(food: DrinkFoodFields): number {
  return Math.max(0, (food.sugar_g ?? 0) - (food.sugar_fixed_g ?? 0));
}

/**
 * Nutrition this drink adds on top of `qty / base_quantity × food`: sugar taken
 * out by the sugar level (negative) plus every topping serving.
 */
export function drinkAdjustment(
  food: DrinkFoodFields,
  qty: number,
  opts: DrinkOpts,
  toppings: Map<number, Topping>,
): Macro {
  const r = food.base_quantity > 0 ? qty / food.base_quantity : 0;
  const removedSugar = adjustableSugar(food) * r * (1 - clampRatio(opts.sugar));
  const adj: Macro = { kcal: -removedSugar * KCAL_PER_G_SUGAR, p: 0, c: -removedSugar, f: 0 };
  for (const pick of opts.toppings) {
    const t = toppings.get(pick.id);
    if (!t) continue;
    adj.kcal += t.calories_kcal * pick.qty;
    adj.p    += t.protein_g * pick.qty;
    adj.c    += t.carbohydrates_g * pick.qty;
    adj.f    += t.fat_g * pick.qty;
  }
  return adj;
}

/** Total sugar in the logged drink, toppings included. */
export function drinkSugar(
  food: DrinkFoodFields, qty: number, opts: DrinkOpts, toppings: Map<number, Topping>,
): number {
  const r = food.base_quantity > 0 ? qty / food.base_quantity : 0;
  const liquid = ((food.sugar_fixed_g ?? 0) + adjustableSugar(food) * clampRatio(opts.sugar)) * r;
  return opts.toppings.reduce((s, p) => s + (toppings.get(p.id)?.sugar_g ?? 0) * p.qty, liquid);
}

/**
 * Whether the logged amount also counts toward the day's water. A plain food
 * keeps its own flag; an advanced drink counts only when its base is water-like
 * (the food's flag — tea, not milk) AND it was ordered sugar-free with nothing
 * added.
 */
export function drinkCountsAsWater(food: DrinkFoodFields, opts: DrinkOpts | null): boolean {
  if (!food.counts_as_water) return false;
  if (!isAdvancedDrink(food) || !opts) return true;
  return opts.sugar === 0 && opts.toppings.length === 0;
}

export function sugarLabel(ratio: number, zh: boolean): string {
  const lvl = SUGAR_LEVELS.find(l => Math.abs(l.ratio - ratio) < 1e-6);
  return lvl ? (zh ? lvl.zh : lvl.en) : `${Math.round(ratio * 100)}%`;
}

/** "半糖 · 珍珠×1 · 椰果×0.5" */
export function drinkOptsSummary(opts: DrinkOpts, toppings: Map<number, Topping>, zh: boolean): string {
  const parts = [sugarLabel(opts.sugar, zh)];
  for (const p of opts.toppings) {
    const t = toppings.get(p.id);
    if (t) parts.push(`${zh || !t.name_en ? t.name : t.name_en}×${p.qty}`);
  }
  return parts.join(" · ");
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
