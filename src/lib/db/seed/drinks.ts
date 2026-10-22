/**
 * Built-in drink-shop drinks and toppings (v1.8.0 first pass).
 *
 * Shops only publish, per cup at full sugar, a TOTAL kcal and a TOTAL sugar
 * (Taiwan's 2021 labelling rule; toppings included, highest value allowed).
 * See docs/drinks-research.md for every source — they are delivery-platform
 * labels or dietitian round-ups, not yet checked against each brand's site.
 *
 * Each drink here is stored as its BASE (no toppings) per cup, and its usual
 * toppings as `defaultToppings`, so a toppings change never double counts:
 *   base = published − default toppings.
 * Macros are not published, so they are estimated from the base's kcal and
 * sugar by the kind of drink (see `estimateMacros`).
 */

import type { SeedFood } from "./foods";

export interface SeedTopping {
  name: string; name_en: string;
  calories_kcal: number; protein_g: number; carbohydrates_g: number; fat_g: number;
  /** Sugar per serving — toppings are syrup-soaked, so this ignores the sugar level. */
  sugar_g: number;
}

/**
 * Per serving. kcal are dietitian round-up figures (servings not standardised
 * across shops); carb / fat / protein and sugar are estimated from each
 * topping's main ingredients.
 */
export const SEED_TOPPINGS: SeedTopping[] = [
  { name: "珍珠",     name_en: "Tapioca pearls",  calories_kcal: 156, protein_g: 0.3, carbohydrates_g: 38, fat_g: 0,    sugar_g: 15 },
  { name: "波霸",     name_en: "Large pearls",    calories_kcal: 156, protein_g: 0.3, carbohydrates_g: 38, fat_g: 0,    sugar_g: 15 },
  { name: "椰果",     name_en: "Nata de coco",    calories_kcal: 76,  protein_g: 0,   carbohydrates_g: 19, fat_g: 0,    sugar_g: 15 },
  { name: "布丁",     name_en: "Pudding",         calories_kcal: 110, protein_g: 3,   carbohydrates_g: 16, fat_g: 4,    sugar_g: 13 },
  { name: "仙草凍",   name_en: "Grass jelly",     calories_kcal: 57,  protein_g: 0,   carbohydrates_g: 14, fat_g: 0,    sugar_g: 12 },
  { name: "愛玉",     name_en: "Aiyu jelly",      calories_kcal: 45,  protein_g: 0,   carbohydrates_g: 11, fat_g: 0,    sugar_g: 10 },
  { name: "寒天",     name_en: "Agar jelly",      calories_kcal: 42,  protein_g: 0,   carbohydrates_g: 10, fat_g: 0,    sugar_g: 9 },
  { name: "蘆薈",     name_en: "Aloe",            calories_kcal: 31,  protein_g: 0,   carbohydrates_g: 8,  fat_g: 0,    sugar_g: 7 },
  { name: "粉條",     name_en: "Starch noodles",  calories_kcal: 131, protein_g: 0,   carbohydrates_g: 32, fat_g: 0,    sugar_g: 12 },
  { name: "芋圓",     name_en: "Taro balls",      calories_kcal: 128, protein_g: 0.5, carbohydrates_g: 31, fat_g: 0,    sugar_g: 8 },
  { name: "奶蓋",     name_en: "Milk foam",       calories_kcal: 203, protein_g: 2,   carbohydrates_g: 14, fat_g: 15.5, sugar_g: 12 },
  { name: "蒟蒻",     name_en: "Konjac jelly",    calories_kcal: 71,  protein_g: 0,   carbohydrates_g: 18, fat_g: 0,    sugar_g: 14 },
  { name: "OREO 脆片", name_en: "OREO crumbs",    calories_kcal: 116, protein_g: 1,   carbohydrates_g: 17, fat_g: 5,    sugar_g: 6 },
];

/** What the non-sugar calories of a drink's base are made of. */
type DrinkKind =
  | "tea"       // tea + syrup (+ a little juice): everything is carbohydrate
  | "creamer"   // milk tea with creamer: mostly fat
  | "milk";     // fresh-milk latte: protein and fat, lactose counted in sugar

interface DrinkSpec {
  name: string; name_en: string;
  /** Cup the published figures are for (ml). */
  ml: number;
  /** Published total kcal / total sugar at full sugar, toppings included. */
  kcal: number; sugar: number;
  /** Sugar the sugar level can't remove (lactose, fruit, Yakult, brown-sugar syrup), per cup. */
  fixedSugar?: number;
  kind: DrinkKind;
  /** Topping names included in the published figure. */
  toppings?: string[];
  /** Sugar-free with nothing added counts toward water (plain teas only). */
  water?: boolean;
}

const DRINKS: DrinkSpec[] = [
  // 50嵐 — platform labels (Uber Eats) where available, else dietitian figures
  { name: "50嵐 四季春青茶",   name_en: "50 Lan Four Seasons Tea",      ml: 720, kcal: 183.6, sugar: 43.1, kind: "tea", water: true },
  { name: "50嵐 檸檬綠茶",     name_en: "50 Lan Lemon Green Tea",       ml: 720, kcal: 232.6, sugar: 51.7, fixedSugar: 3, kind: "tea" },
  { name: "50嵐 珍珠奶茶",     name_en: "50 Lan Pearl Milk Tea",        ml: 700, kcal: 668,   sugar: 53,   kind: "creamer", toppings: ["珍珠"] },
  { name: "50嵐 波霸奶茶",     name_en: "50 Lan Boba Milk Tea",         ml: 700, kcal: 678,   sugar: 53,   kind: "creamer", toppings: ["波霸"] },
  // CoCo 都可 — platform labels
  { name: "CoCo 百香雙響炮",   name_en: "CoCo Passion Fruit Double",    ml: 700, kcal: 472,   sugar: 82,   fixedSugar: 8, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 珍珠奶茶",     name_en: "CoCo Pearl Milk Tea",          ml: 700, kcal: 722,   sugar: 51,   kind: "creamer", toppings: ["珍珠"] },
  { name: "CoCo 珍珠鮮奶茶",   name_en: "CoCo Pearl Fresh Milk Tea",    ml: 700, kcal: 547,   sugar: 57,   fixedSugar: 14, kind: "milk", toppings: ["珍珠"] },
  // 清心福全 — platform labels / dietitian figures that agree
  { name: "清心福全 烏龍綠茶", name_en: "Chingshin Oolong Green Tea",   ml: 700, kcal: 226,   sugar: 51,   kind: "tea", water: true },
  { name: "清心福全 梅子綠茶", name_en: "Chingshin Plum Green Tea",     ml: 700, kcal: 202,   sugar: 46,   fixedSugar: 5, kind: "tea" },
  { name: "清心福全 優多綠茶", name_en: "Chingshin Yakult Green Tea",   ml: 700, kcal: 330,   sugar: 72,   fixedSugar: 16, kind: "tea" },
  { name: "清心福全 珍珠奶茶", name_en: "Chingshin Pearl Milk Tea",     ml: 700, kcal: 720,   sugar: 50,   kind: "creamer", toppings: ["珍珠"] },
  { name: "清心福全 蜂蜜奶茶", name_en: "Chingshin Honey Milk Tea",     ml: 700, kcal: 737,   sugar: 72,   kind: "creamer" },
  // 迷客夏 — dietitian figures
  { name: "迷客夏 娜杯紅茶",         name_en: "Milksha Black Tea",              ml: 700, kcal: 128, sugar: 29, kind: "tea", water: true },
  { name: "迷客夏 焙香大麥拿鐵",     name_en: "Milksha Roasted Barley Latte",   ml: 700, kcal: 169, sugar: 25, fixedSugar: 10, kind: "milk" },
  { name: "迷客夏 珍珠伯爵紅茶拿鐵", name_en: "Milksha Pearl Earl Grey Latte",  ml: 700, kcal: 426, sugar: 35, fixedSugar: 10, kind: "milk", toppings: ["珍珠"] },
  { name: "迷客夏 珍珠手炒黑糖鮮奶", name_en: "Milksha Pearl Brown Sugar Milk", ml: 700, kcal: 559, sugar: 55, fixedSugar: 40, kind: "milk", toppings: ["珍珠"] },
  // 可不可 / 得正 / 大苑子 — dietitian figures
  { name: "可不可 熟成紅茶",   name_en: "Kebuke Aged Black Tea",        ml: 700, kcal: 200,   sugar: 50,   kind: "tea", water: true },
  { name: "得正 紅茶",         name_en: "Oolong Tea Project Black Tea", ml: 700, kcal: 268,   sugar: 57.5, kind: "tea", water: true },
  { name: "大苑子 水果茶",     name_en: "Dayungs Fruit Tea",            ml: 700, kcal: 317,   sugar: 70,   fixedSugar: 25, kind: "tea" },
];

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Split a base's calories into P/C/F: sugar is carbohydrate, the rest by drink kind. */
function estimateMacros(kcal: number, sugar: number, kind: DrinkKind) {
  const rest = Math.max(0, kcal - sugar * 4);
  switch (kind) {
    case "tea":     return { p: 0, c: kcal / 4, f: 0 };
    case "creamer": return { p: rest * 0.05 / 4, c: sugar + rest * 0.40 / 4, f: rest * 0.55 / 9 };
    case "milk":    return { p: rest * 0.30 / 4, c: sugar, f: rest * 0.70 / 9 };
  }
}

export interface SeedDrink extends SeedFood {
  sugar_g: number;
  sugar_fixed_g: number;
  /** Topping names; resolved to ids when seeding. */
  default_toppings: string[];
}

const toppingByName = new Map(SEED_TOPPINGS.map(t => [t.name, t]));

export const SEED_DRINKS: SeedDrink[] = DRINKS.map(d => {
  const tops = (d.toppings ?? []).map(n => toppingByName.get(n)!);
  const kcal  = d.kcal  - tops.reduce((s, t) => s + t.calories_kcal, 0);
  const sugar = d.sugar - tops.reduce((s, t) => s + t.sugar_g, 0);
  const m = estimateMacros(kcal, sugar, d.kind);
  return {
    food_name: d.name, name_en: d.name_en,
    protein_g: r1(m.p), carbohydrates_g: r1(m.c), fat_g: r1(m.f), calories_kcal: r1(kcal),
    base_quantity: d.ml, base_unit: "ml", category: "飲料",
    counts_as_water: d.water ?? false,
    sugar_g: r1(sugar),
    sugar_fixed_g: Math.min(r1(sugar), d.fixedSugar ?? 0),
    default_toppings: d.toppings ?? [],
  };
});
