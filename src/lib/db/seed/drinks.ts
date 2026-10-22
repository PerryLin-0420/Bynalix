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
  { name: "茶凍",     name_en: "Tea jelly",       calories_kcal: 40,  protein_g: 0,   carbohydrates_g: 10, fat_g: 0,    sugar_g: 8 },
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
  /**
   * Highest sugar level the shop sells, which is also the level its label is
   * for — 清心福全 tops out at 少糖 (0.7), its 冬瓜檸檬 at 半糖 (0.5).
   */
  maxLevel?: number;
}

// Fixed sugar (per cup) where the published figure includes it: fresh milk
// ≈ 14 g lactose in a large latte (~300 ml milk), fruit/juice per its share.
const DRINKS: DrinkSpec[] = [
  // ── 50嵐 — platform labels (Uber Eats) where available, else dietitian figures
  { name: "50嵐 四季春青茶",   name_en: "50 Lan Four Seasons Tea",      ml: 720, kcal: 183.6, sugar: 43.1, kind: "tea", water: true },
  { name: "50嵐 檸檬綠茶",     name_en: "50 Lan Lemon Green Tea",       ml: 720, kcal: 232.6, sugar: 51.7, fixedSugar: 3, kind: "tea" },
  { name: "50嵐 1號 四季春珍波椰", name_en: "50 Lan No.1 Four Seasons w/ Pearls, Boba & Coconut", ml: 720, kcal: 433.8, sugar: 65, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "50嵐 紅茶拿鐵",     name_en: "50 Lan Black Tea Latte",       ml: 720, kcal: 354.4, sugar: 55.1, fixedSugar: 14, kind: "milk" },
  { name: "50嵐 珍珠奶茶",     name_en: "50 Lan Pearl Milk Tea",        ml: 700, kcal: 668,   sugar: 53,   kind: "creamer", toppings: ["珍珠"] },
  { name: "50嵐 波霸奶茶",     name_en: "50 Lan Boba Milk Tea",         ml: 700, kcal: 678,   sugar: 53,   kind: "creamer", toppings: ["波霸"] },
  // ── CoCo 都可 — platform labels
  { name: "CoCo 四季春",       name_en: "CoCo Four Seasons Tea",        ml: 700, kcal: 141,   sugar: 33,   kind: "tea", water: true },
  { name: "CoCo 百香雙響炮",   name_en: "CoCo Passion Fruit Double",    ml: 700, kcal: 472,   sugar: 82,   fixedSugar: 8, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 紅柚雙響炮",   name_en: "CoCo Grapefruit Double",       ml: 700, kcal: 427,   sugar: 77,   fixedSugar: 8, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 紅柚香檸美式", name_en: "CoCo Grapefruit Lemon Americano", ml: 700, kcal: 223, sugar: 51,   fixedSugar: 10, kind: "tea" },
  { name: "CoCo 珍珠奶茶",     name_en: "CoCo Pearl Milk Tea",          ml: 700, kcal: 722,   sugar: 51,   kind: "creamer", toppings: ["珍珠"] },
  { name: "CoCo 冬韻擂焙珍奶", name_en: "CoCo Roasted Pearl Milk Tea",  ml: 700, kcal: 749,   sugar: 59,   kind: "creamer", toppings: ["珍珠"] },
  { name: "CoCo 英式鮮奶茶",   name_en: "CoCo English Fresh Milk Tea",  ml: 700, kcal: 401,   sugar: 59,   fixedSugar: 14, kind: "milk" },
  { name: "CoCo 珍珠鮮奶茶",   name_en: "CoCo Pearl Fresh Milk Tea",    ml: 700, kcal: 547,   sugar: 57,   fixedSugar: 14, kind: "milk", toppings: ["珍珠"] },
  // ── 清心福全 — official product pages (chingshin.tw), labelled at the shop's highest
  // sugar level: 少糖 for most (全糖 orders are made as 少糖), 半糖 for 冬瓜檸檬
  { name: "清心福全 烏龍綠茶", name_en: "Chingshin Oolong Green Tea",   ml: 700, kcal: 226, sugar: 51, kind: "tea", water: true, maxLevel: 0.7 },
  { name: "清心福全 極品菁茶", name_en: "Chingshin Premium Green Tea",  ml: 700, kcal: 226, sugar: 51, kind: "tea", water: true, maxLevel: 0.7 },
  { name: "清心福全 錫蘭紅茶", name_en: "Chingshin Ceylon Black Tea",   ml: 700, kcal: 211, sugar: 48, kind: "tea", water: true, maxLevel: 0.7 },
  { name: "清心福全 特選普洱", name_en: "Chingshin Pu'er Tea",          ml: 700, kcal: 202, sugar: 46, kind: "tea", water: true, maxLevel: 0.7 },
  { name: "清心福全 梅子綠茶", name_en: "Chingshin Plum Green Tea",     ml: 700, kcal: 202, sugar: 46, fixedSugar: 5,  kind: "tea", maxLevel: 0.7 },
  { name: "清心福全 檸檬紅茶", name_en: "Chingshin Lemon Black Tea",    ml: 700, kcal: 208, sugar: 49, fixedSugar: 3,  kind: "tea", maxLevel: 0.7 },
  { name: "清心福全 冬瓜檸檬", name_en: "Chingshin Winter Melon Lemon", ml: 700, kcal: 261, sugar: 61, fixedSugar: 30, kind: "tea", maxLevel: 0.5 },
  { name: "清心福全 優多綠茶", name_en: "Chingshin Yakult Green Tea",   ml: 700, kcal: 330, sugar: 72, fixedSugar: 16, kind: "tea", maxLevel: 0.7 },
  { name: "清心福全 鮮奶茶",   name_en: "Chingshin Fresh Milk Tea",     ml: 700, kcal: 375, sugar: 61, fixedSugar: 14, kind: "milk", maxLevel: 0.7 },
  { name: "清心福全 珍珠鮮奶茶", name_en: "Chingshin Pearl Fresh Milk Tea", ml: 700, kcal: 636, sugar: 58, fixedSugar: 14, kind: "milk", toppings: ["珍珠"], maxLevel: 0.7 },
  { name: "清心福全 珍珠蜜香鮮奶普洱", name_en: "Chingshin Pearl Honey Fresh Milk Pu'er", ml: 700, kcal: 541, sugar: 70, fixedSugar: 14, kind: "milk", toppings: ["珍珠"], maxLevel: 0.7 },
  { name: "清心福全 咖啡奶茶", name_en: "Chingshin Coffee Milk Tea",    ml: 700, kcal: 364, sugar: 47, kind: "creamer", maxLevel: 0.7 },
  { name: "清心福全 特級奶綠", name_en: "Chingshin Green Milk Tea",     ml: 700, kcal: 620, sugar: 54, kind: "creamer", maxLevel: 0.7 },
  { name: "清心福全 珍珠奶茶", name_en: "Chingshin Pearl Milk Tea",     ml: 700, kcal: 720, sugar: 50, kind: "creamer", toppings: ["珍珠"], maxLevel: 0.7 },
  { name: "清心福全 波霸奶茶", name_en: "Chingshin Boba Milk Tea",      ml: 700, kcal: 720, sugar: 50, kind: "creamer", toppings: ["波霸"], maxLevel: 0.7 },
  { name: "清心福全 粉圓奶茶", name_en: "Chingshin Mini Pearl Milk Tea", ml: 700, kcal: 674, sugar: 59, kind: "creamer", toppings: ["珍珠"], maxLevel: 0.7 },
  { name: "清心福全 布丁奶茶", name_en: "Chingshin Pudding Milk Tea",   ml: 700, kcal: 613, sugar: 70, kind: "creamer", toppings: ["布丁"], maxLevel: 0.7 },
  { name: "清心福全 蜜香奶茶", name_en: "Chingshin Honey Milk Tea",     ml: 700, kcal: 737, sugar: 72, kind: "creamer", maxLevel: 0.7 },
  { name: "清心福全 芝麻奶茶", name_en: "Chingshin Sesame Milk Tea",    ml: 700, kcal: 737, sugar: 58, kind: "creamer", maxLevel: 0.7 },
  { name: "清心福全 冰淇淋奶茶", name_en: "Chingshin Ice Cream Milk Tea", ml: 700, kcal: 750, sugar: 71, fixedSugar: 15, kind: "creamer", maxLevel: 0.7 },
  // ── 迷客夏 — dietitian figures
  { name: "迷客夏 娜杯紅茶",         name_en: "Milksha Black Tea",              ml: 700, kcal: 128, sugar: 29, kind: "tea", water: true },
  { name: "迷客夏 青檸香茶",         name_en: "Milksha Lime Tea",               ml: 700, kcal: 258, sugar: 59, fixedSugar: 5,  kind: "tea" },
  { name: "迷客夏 柳丁綠茶",         name_en: "Milksha Orange Green Tea",       ml: 700, kcal: 297, sugar: 66, fixedSugar: 15, kind: "tea" },
  { name: "迷客夏 冬瓜檸檬",         name_en: "Milksha Winter Melon Lemon",     ml: 700, kcal: 364, sugar: 82, fixedSugar: 30, kind: "tea" },
  { name: "迷客夏 焙香大麥拿鐵",     name_en: "Milksha Roasted Barley Latte",   ml: 700, kcal: 169, sugar: 25, fixedSugar: 10, kind: "milk" },
  { name: "迷客夏 芋頭鮮奶",         name_en: "Milksha Taro Fresh Milk",        ml: 700, kcal: 463, sugar: 41, fixedSugar: 14, kind: "milk" },
  { name: "迷客夏 珍珠伯爵紅茶拿鐵", name_en: "Milksha Pearl Earl Grey Latte",  ml: 700, kcal: 426, sugar: 35, fixedSugar: 10, kind: "milk", toppings: ["珍珠"] },
  { name: "迷客夏 珍珠手炒黑糖鮮奶", name_en: "Milksha Pearl Brown Sugar Milk", ml: 700, kcal: 559, sugar: 55, fixedSugar: 40, kind: "milk", toppings: ["珍珠"] },
  // ── 可不可熟成紅茶 — official ordering pages (order.ocard.co/kebuke); 胭脂紅茶 is a dietitian figure
  { name: "可不可 熟成紅茶",   name_en: "Kebuke Aged Black Tea",        ml: 700, kcal: 200,   sugar: 50,   kind: "tea", water: true },
  { name: "可不可 麗春紅茶",   name_en: "Kebuke Li-Chun Black Tea",     ml: 700, kcal: 270,   sugar: 65,   kind: "tea", water: true },
  { name: "可不可 春芽綠茶",   name_en: "Kebuke Spring Bud Green Tea",  ml: 700, kcal: 180,   sugar: 45,   kind: "tea", water: true },
  { name: "可不可 胭脂紅茶",   name_en: "Kebuke Rouge Black Tea",       ml: 700, kcal: 200,   sugar: 50,   kind: "tea", water: true },
  { name: "可不可 熟成檸果",   name_en: "Kebuke Aged Tea with Lemon",   ml: 700, kcal: 257,   sugar: 59,   fixedSugar: 3, kind: "tea" },
  { name: "可不可 雪花冷露",   name_en: "Kebuke Snow Cold Dew",         ml: 700, kcal: 233,   sugar: 55,   fixedSugar: 20, kind: "tea" },
  { name: "可不可 熟成歐蕾",   name_en: "Kebuke Aged Tea Au Lait",      ml: 700, kcal: 311,   sugar: 55,   fixedSugar: 14, kind: "milk" },
  { name: "可不可 白玉歐蕾",   name_en: "Kebuke White Pearl Au Lait",   ml: 700, kcal: 492,   sugar: 50,   fixedSugar: 14, kind: "milk", toppings: ["珍珠"] },
  // ── 麻古茶坊 — menu calorie table (dietitian round-ups)
  { name: "麻古 柳橙果粒茶",   name_en: "Macu Orange Fruit Tea",        ml: 700, kcal: 342,   sugar: 76,   fixedSugar: 25, kind: "tea" },
  { name: "麻古 楊枝甘露 2.0", name_en: "Macu Mango Pomelo Sago 2.0",   ml: 700, kcal: 373,   sugar: 66,   fixedSugar: 30, kind: "milk" },
  { name: "麻古 芝芝芒果果粒", name_en: "Macu Cheese Foam Mango",       ml: 700, kcal: 480,   sugar: 70,   fixedSugar: 25, kind: "tea", toppings: ["奶蓋"] },
  { name: "麻古 波霸奶茶",     name_en: "Macu Boba Milk Tea",           ml: 700, kcal: 669,   sugar: 51,   kind: "creamer", toppings: ["波霸"] },
  // ── 得正 — menu figures (M/L listed per drink)
  { name: "得正 春烏龍",       name_en: "Oolong Tea Project Spring Oolong", ml: 700, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 輕烏龍",       name_en: "Oolong Tea Project Light Oolong",  ml: 700, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 檸檬春烏龍",   name_en: "Oolong Tea Project Lemon Spring Oolong", ml: 700, kcal: 267, sugar: 58, fixedSugar: 3, kind: "tea" },
  { name: "得正 焙烏龍鮮奶",   name_en: "Oolong Tea Project Roasted Oolong Latte", ml: 700, kcal: 409, sugar: 72.6, fixedSugar: 14, kind: "milk" },
  { name: "得正 焙烏龍奶茶",   name_en: "Oolong Tea Project Roasted Oolong Milk Tea", ml: 700, kcal: 575.5, sugar: 62.7, kind: "creamer" },
  // ── 大苑子 — dietitian figures
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

/** Builtin drinks renamed or dropped since an earlier seed; removed when nothing references them. */
export const RETIRED_DRINKS = [
  "得正 紅茶",          // was 春烏龍's figure under the wrong name
  "清心福全 蜂蜜奶茶",  // official name is 蜜香奶茶
];

export interface SeedDrink extends SeedFood {
  sugar_g: number;
  sugar_fixed_g: number;
  sugar_max_level: number;
  /** Topping names; resolved to ids when seeding. */
  default_toppings: string[];
}

const toppingByName = new Map(SEED_TOPPINGS.map(t => [t.name, t]));

export const SEED_DRINKS: SeedDrink[] = DRINKS.map(d => {
  const tops = (d.toppings ?? []).map(n => toppingByName.get(n)!);
  const kcal  = d.kcal  - tops.reduce((s, t) => s + t.calories_kcal, 0);
  // Floor at 0: a dietitian topping estimate can exceed what a shop's own
  // label leaves for the base, and a base can't have negative sugar.
  const sugar = Math.max(0, d.sugar - tops.reduce((s, t) => s + t.sugar_g, 0));
  const m = estimateMacros(kcal, sugar, d.kind);
  return {
    food_name: d.name, name_en: d.name_en,
    protein_g: r1(m.p), carbohydrates_g: r1(m.c), fat_g: r1(m.f), calories_kcal: r1(kcal),
    base_quantity: d.ml, base_unit: "ml", category: "飲料",
    counts_as_water: d.water ?? false,
    sugar_g: r1(sugar),
    sugar_fixed_g: Math.min(r1(sugar), d.fixedSugar ?? 0),
    sugar_max_level: d.maxLevel ?? 1,
    default_toppings: d.toppings ?? [],
  };
});
