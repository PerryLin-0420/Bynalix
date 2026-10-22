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
}

// Fixed (non-adjustable) sugar is measured from calories, not guessed: a brand's
// plain tea is all syrup, so its full-sugar kcal ÷ 4 is the syrup in a cup. For
// any other drink, fixed = (total sugar − toppings' sugar) − that syrup, scaled
// to the cup. 大苑子 uses its green tea for fruit / green drinks and its black tea
// for milk teas, since the two differ. Per-brand syrup: docs/drinks-research.md §12–13.
const DRINKS: DrinkSpec[] = [
  // ── 50嵐 — platform labels (Uber Eats) where available, else dietitian figures
  { name: "50嵐 四季春青茶",   name_en: "50 Lan Four Seasons Tea",      ml: 720, kcal: 183.6, sugar: 43.1, kind: "tea", water: true },
  { name: "50嵐 檸檬綠茶",     name_en: "50 Lan Lemon Green Tea",       ml: 720, kcal: 232.6, sugar: 51.7, fixedSugar: 9.5, kind: "tea" },
  { name: "50嵐 1號 四季春珍波椰", name_en: "50 Lan No.1 Four Seasons w/ Pearls, Boba & Coconut", ml: 720, kcal: 433.8, sugar: 65, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "50嵐 紅茶拿鐵",     name_en: "50 Lan Black Tea Latte",       ml: 720, kcal: 354.4, sugar: 55.1, fixedSugar: 12.9, kind: "milk" },
  { name: "50嵐 珍珠奶茶",     name_en: "50 Lan Pearl Milk Tea",        ml: 700, kcal: 726.6, sugar: 56.9, fixedSugar: 0.8, kind: "creamer", toppings: ["珍珠"] },
  // 波霸奶茶: no platform label found yet — dietitian figure
  { name: "50嵐 波霸奶茶",     name_en: "50 Lan Boba Milk Tea",         ml: 700, kcal: 678,   sugar: 53,   kind: "creamer", toppings: ["波霸"] },
  { name: "50嵐 黃金烏龍",     name_en: "50 Lan Golden Oolong",         ml: 700, kcal: 171.4, sugar: 40.2, kind: "tea", water: true },
  { name: "50嵐 微檸檬青茶",   name_en: "50 Lan Light Lemon Green Tea", ml: 700, kcal: 191.3, sugar: 43.1, fixedSugar: 2, kind: "tea" },
  { name: "50嵐 金桔檸檬",     name_en: "50 Lan Kumquat Lemon",         ml: 700, kcal: 244.3, sugar: 51.7, fixedSugar: 10.6, kind: "tea" },
  { name: "50嵐 檸檬梅汁",     name_en: "50 Lan Lemon Plum Juice",      ml: 700, kcal: 326.2, sugar: 74.2, fixedSugar: 33.1, kind: "tea" },
  { name: "50嵐 波霸紅茶",     name_en: "50 Lan Boba Black Tea",        ml: 700, kcal: 472.5, sugar: 52.2, kind: "tea", toppings: ["波霸"] },
  { name: "50嵐 波霸紅茶拿鐵", name_en: "50 Lan Boba Black Tea Latte",  ml: 700, kcal: 644.8, sugar: 65.6, fixedSugar: 9.5, kind: "milk", toppings: ["波霸"] },
  { name: "50嵐 阿華田拿鐵",   name_en: "50 Lan Ovaltine Latte",        ml: 700, kcal: 524.2, sugar: 64.1, fixedSugar: 23, kind: "milk" },
  { name: "50嵐 冰淇淋奶茶",   name_en: "50 Lan Ice Cream Milk Tea",    ml: 700, kcal: 708.6, sugar: 72.9, fixedSugar: 31.8, kind: "creamer" },
  { name: "50嵐 冰淇淋阿華田", name_en: "50 Lan Ice Cream Ovaltine",    ml: 700, kcal: 762,   sugar: 79.3, fixedSugar: 38.2, kind: "creamer" },
  // ── CoCo 都可 — platform labels
  { name: "CoCo 四季春",       name_en: "CoCo Four Seasons Tea",        ml: 700, kcal: 141,   sugar: 33,   kind: "tea", water: true },
  { name: "CoCo 手採紅茶",     name_en: "CoCo Hand-picked Black Tea",   ml: 700, kcal: 141,   sugar: 33,   kind: "tea", water: true },
  { name: "CoCo 蜜香凍綠茶",   name_en: "CoCo Green Tea with Tea Jelly", ml: 700, kcal: 320,  sugar: 74, fixedSugar: 33,   kind: "tea", toppings: ["茶凍"] },
  { name: "CoCo 蜜香凍紅茶",   name_en: "CoCo Black Tea with Tea Jelly", ml: 700, kcal: 320,  sugar: 74, fixedSugar: 33,   kind: "tea", toppings: ["茶凍"] },
  { name: "CoCo 葡萄柚果粒茶", name_en: "CoCo Grapefruit Fruit Tea",    ml: 700, kcal: 341,   sugar: 80,   fixedSugar: 47, kind: "tea" },
  { name: "CoCo 奶茶三兄弟",   name_en: "CoCo Milk Tea Three Brothers", ml: 700, kcal: 622,   sugar: 61,   kind: "creamer", toppings: ["珍珠", "布丁", "仙草凍"] },
  { name: "CoCo 百香雙響炮",   name_en: "CoCo Passion Fruit Double",    ml: 700, kcal: 472,   sugar: 82,   fixedSugar: 19, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 紅柚雙響炮",   name_en: "CoCo Grapefruit Double",       ml: 700, kcal: 427,   sugar: 77,   fixedSugar: 14, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 紅柚香檸美式", name_en: "CoCo Grapefruit Lemon Americano", ml: 700, kcal: 223, sugar: 51,   fixedSugar: 18, kind: "tea" },
  { name: "CoCo 珍珠奶茶",     name_en: "CoCo Pearl Milk Tea",          ml: 700, kcal: 722,   sugar: 51, fixedSugar: 3,   kind: "creamer", toppings: ["珍珠"] },
  { name: "CoCo 冬韻擂焙珍奶", name_en: "CoCo Roasted Pearl Milk Tea",  ml: 700, kcal: 749,   sugar: 59, fixedSugar: 11,   kind: "creamer", toppings: ["珍珠"] },
  { name: "CoCo 英式鮮奶茶",   name_en: "CoCo English Fresh Milk Tea",  ml: 700, kcal: 401,   sugar: 59,   fixedSugar: 26, kind: "milk" },
  { name: "CoCo 珍珠鮮奶茶",   name_en: "CoCo Pearl Fresh Milk Tea",    ml: 700, kcal: 547,   sugar: 57,   fixedSugar: 9, kind: "milk", toppings: ["珍珠"] },
  // ── 清心福全 — official product pages (chingshin.tw). The site labels each drink at its
  // highest level (少糖; 冬瓜檸檬 半糖), so the values below are converted to 全糖. The
  // syrup at 少糖 is 49 g (its plain teas' average) → 70 g at 全糖; sugar beyond the syrup is
  // fixed. Adjustable sugar ÷ 0.7 (÷ 0.5), +4 kcal per added gram. Labels: docs/drinks-research.md §8.
  { name: "清心福全 烏龍綠茶", name_en: "Chingshin Oolong Green Tea",   ml: 700, kcal: 313.4, sugar: 72.9, kind: "tea", water: true },
  { name: "清心福全 極品菁茶", name_en: "Chingshin Premium Green Tea",  ml: 700, kcal: 313.4, sugar: 72.9, kind: "tea", water: true },
  { name: "清心福全 錫蘭紅茶", name_en: "Chingshin Ceylon Black Tea",   ml: 700, kcal: 293.3, sugar: 68.6, kind: "tea", water: true },
  { name: "清心福全 特選普洱", name_en: "Chingshin Pu'er Tea",          ml: 700, kcal: 280.9, sugar: 65.7, kind: "tea", water: true },
  { name: "清心福全 梅子綠茶", name_en: "Chingshin Plum Green Tea",     ml: 700, kcal: 280.9, sugar: 65.7,  kind: "tea" },
  { name: "清心福全 檸檬紅茶", name_en: "Chingshin Lemon Black Tea",    ml: 700, kcal: 292, sugar: 70,  kind: "tea" },
  { name: "清心福全 冬瓜檸檬", name_en: "Chingshin Winter Melon Lemon", ml: 700, kcal: 401, sugar: 96, fixedSugar: 26, kind: "tea" },
  { name: "清心福全 優多綠茶", name_en: "Chingshin Yakult Green Tea",   ml: 700, kcal: 414, sugar: 93, fixedSugar: 23, kind: "tea" },
  { name: "清心福全 鮮奶茶",   name_en: "Chingshin Fresh Milk Tea",     ml: 700, kcal: 459, sugar: 82, fixedSugar: 12, kind: "milk" },
  { name: "清心福全 珍珠鮮奶茶", name_en: "Chingshin Pearl Fresh Milk Tea", ml: 700, kcal: 709.7, sugar: 76.4, kind: "milk", toppings: ["珍珠"] },
  { name: "清心福全 珍珠蜜香鮮奶普洱", name_en: "Chingshin Pearl Honey Fresh Milk Pu'er", ml: 700, kcal: 625, sugar: 91, fixedSugar: 6, kind: "milk", toppings: ["珍珠"] },
  { name: "清心福全 咖啡奶茶", name_en: "Chingshin Coffee Milk Tea",    ml: 700, kcal: 444.6, sugar: 67.1, kind: "creamer" },
  { name: "清心福全 特級奶綠", name_en: "Chingshin Green Milk Tea",     ml: 700, kcal: 704, sugar: 75, fixedSugar: 5, kind: "creamer" },
  { name: "清心福全 珍珠奶茶", name_en: "Chingshin Pearl Milk Tea",     ml: 700, kcal: 780, sugar: 65, kind: "creamer", toppings: ["珍珠"] },
  { name: "清心福全 波霸奶茶", name_en: "Chingshin Boba Milk Tea",      ml: 700, kcal: 780, sugar: 65, kind: "creamer", toppings: ["波霸"] },
  { name: "清心福全 粉圓奶茶", name_en: "Chingshin Mini Pearl Milk Tea", ml: 700, kcal: 749.4, sugar: 77.9, kind: "creamer", toppings: ["珍珠"] },
  { name: "清心福全 布丁奶茶", name_en: "Chingshin Pudding Milk Tea",   ml: 700, kcal: 697, sugar: 91, fixedSugar: 8, kind: "creamer", toppings: ["布丁"] },
  { name: "清心福全 蜜香奶茶", name_en: "Chingshin Honey Milk Tea",     ml: 700, kcal: 821, sugar: 93, fixedSugar: 23, kind: "creamer" },
  { name: "清心福全 芝麻奶茶", name_en: "Chingshin Sesame Milk Tea",    ml: 700, kcal: 821, sugar: 79, fixedSugar: 9, kind: "creamer" },
  { name: "清心福全 冰淇淋奶茶", name_en: "Chingshin Ice Cream Milk Tea", ml: 700, kcal: 834, sugar: 92, fixedSugar: 22, kind: "creamer" },
  // ── 迷客夏 — delivery-platform labels (most stores agree); 娜杯紅茶 is a dietitian figure
  { name: "迷客夏 娜杯紅茶",         name_en: "Milksha Black Tea",              ml: 700, kcal: 128, sugar: 29, kind: "tea", water: true },
  { name: "迷客夏 青檸香茶",         name_en: "Milksha Lime Tea",               ml: 700, kcal: 209, sugar: 44, fixedSugar: 15,  kind: "tea" },
  { name: "迷客夏 柳丁綠茶",         name_en: "Milksha Orange Green Tea",       ml: 700, kcal: 251, sugar: 52, fixedSugar: 23, kind: "tea" },
  { name: "迷客夏 冬瓜檸檬",         name_en: "Milksha Winter Melon Lemon",     ml: 700, kcal: 364, sugar: 82, fixedSugar: 53, kind: "tea" },
  { name: "迷客夏 焙香大麥拿鐵",     name_en: "Milksha Roasted Barley Latte",   ml: 700, kcal: 169, sugar: 25, kind: "milk" },
  { name: "迷客夏 芋頭鮮奶",         name_en: "Milksha Taro Fresh Milk",        ml: 700, kcal: 343, sugar: 31, fixedSugar: 2, kind: "milk" },
  { name: "迷客夏 大正紅茶拿鐵",     name_en: "Milksha Taisho Black Tea Latte", ml: 700, kcal: 261, sugar: 45, fixedSugar: 16, kind: "milk" },
  { name: "迷客夏 娜杯紅茶拿鐵",     name_en: "Milksha Nabei Black Tea Latte",  ml: 700, kcal: 276, sugar: 49, fixedSugar: 20, kind: "milk" },
  // Platforms list these without pearls — add pearls as a topping
  { name: "迷客夏 伯爵紅茶拿鐵",     name_en: "Milksha Earl Grey Latte",        ml: 700, kcal: 236, sugar: 34, fixedSugar: 5, kind: "milk" },
  { name: "迷客夏 手炒黑糖鮮奶",     name_en: "Milksha Brown Sugar Fresh Milk", ml: 700, kcal: 334, sugar: 41, fixedSugar: 41, kind: "milk" },
  // ── 可不可熟成紅茶 — official ordering pages (order.ocard.co/kebuke); 胭脂紅茶 is a dietitian figure
  { name: "可不可 熟成紅茶",   name_en: "Kebuke Aged Black Tea",        ml: 700, kcal: 200,   sugar: 50,   kind: "tea", water: true },
  { name: "可不可 麗春紅茶",   name_en: "Kebuke Li-Chun Black Tea",     ml: 700, kcal: 270,   sugar: 65,   kind: "tea", water: true },
  { name: "可不可 春芽綠茶",   name_en: "Kebuke Spring Bud Green Tea",  ml: 700, kcal: 180,   sugar: 45,   kind: "tea", water: true },
  { name: "可不可 胭脂紅茶",   name_en: "Kebuke Rouge Black Tea",       ml: 700, kcal: 200,   sugar: 50,   kind: "tea", water: true },
  { name: "可不可 熟成檸果",   name_en: "Kebuke Aged Tea with Lemon",   ml: 700, kcal: 257,   sugar: 59,   fixedSugar: 9, kind: "tea" },
  { name: "可不可 雪花冷露",   name_en: "Kebuke Snow Cold Dew",         ml: 700, kcal: 233,   sugar: 55,   fixedSugar: 5, kind: "tea" },
  { name: "可不可 熟成歐蕾",   name_en: "Kebuke Aged Tea Au Lait",      ml: 700, kcal: 311,   sugar: 55,   fixedSugar: 5, kind: "milk" },
  { name: "可不可 白玉歐蕾",   name_en: "Kebuke White Pearl Au Lait",   ml: 700, kcal: 492,   sugar: 50, kind: "milk", toppings: ["珍珠"] },
  // ── 麻古茶坊 — delivery-platform labels. Where a store lists two sugar levels, the
  // fixed sugar is solved from them (1分糖 vs 全糖: sugar(r) = fixed + adjustable × r).
  // 甜感 drinks (減低 / 提升) are labelled at 提升 with only the gap left adjustable.
  { name: "麻古 芝芝金萱",     name_en: "Macu Cheese Foam Jin Xuan",    ml: 700, kcal: 335,   sugar: 37, kind: "tea", toppings: ["奶蓋"] },
  { name: "麻古 柳橙芒果果粒茶", name_en: "Macu Orange Mango Fruit Tea", ml: 700, kcal: 330,   sugar: 74,   fixedSugar: 40, kind: "tea" },
  { name: "麻古 柳橙果粒茶",   name_en: "Macu Orange Fruit Tea",        ml: 700, kcal: 342,   sugar: 77,   fixedSugar: 43, kind: "tea" },
  { name: "麻古 楊枝甘露 2.0", name_en: "Macu Mango Pomelo Sago 2.0",   ml: 700, kcal: 389,   sugar: 74,   fixedSugar: 40, kind: "milk" },
  { name: "麻古 芝芝芒果果粒", name_en: "Macu Cheese Foam Mango",       ml: 700, kcal: 516,   sugar: 77,   fixedSugar: 31, kind: "tea", toppings: ["奶蓋"] },
  // 波霸奶茶: no platform label found yet — older menu calorie table
  { name: "麻古 波霸奶茶",     name_en: "Macu Boba Milk Tea",           ml: 700, kcal: 669,   sugar: 51, fixedSugar: 2,   kind: "creamer", toppings: ["波霸"] },
  // ── 得正 — menu figures (M/L listed per drink)
  { name: "得正 春烏龍",       name_en: "Oolong Tea Project Spring Oolong", ml: 700, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 輕烏龍",       name_en: "Oolong Tea Project Light Oolong",  ml: 700, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 焙烏龍",       name_en: "Oolong Tea Project Roasted Oolong", ml: 700, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 芝士奶蓋春烏龍", name_en: "Oolong Tea Project Cheese Foam Spring Oolong", ml: 700, kcal: 435, sugar: 49, kind: "tea", toppings: ["奶蓋"] },
  { name: "得正 檸檬春烏龍",   name_en: "Oolong Tea Project Lemon Spring Oolong", ml: 700, kcal: 267, sugar: 58, fixedSugar: 0.5, kind: "tea" },
  { name: "得正 焙烏龍鮮奶",   name_en: "Oolong Tea Project Roasted Oolong Latte", ml: 700, kcal: 409, sugar: 72.6, fixedSugar: 15.1, kind: "milk" },
  { name: "得正 焙烏龍奶茶",   name_en: "Oolong Tea Project Roasted Oolong Milk Tea", ml: 700, kcal: 575.5, sugar: 62.7, fixedSugar: 5.2, kind: "creamer" },
  // ── 大苑子 — delivery-platform labels
  { name: "大苑子 水果茶",     name_en: "Dayungs Fruit Tea",            ml: 700, kcal: 317,   sugar: 70,   fixedSugar: 35, kind: "tea" },
  { name: "大苑子 翡翠檸檬",   name_en: "Dayungs Jade Lemon",           ml: 700, kcal: 329,   sugar: 68,   fixedSugar: 33,  kind: "tea" },
  { name: "大苑子 愛文芒果冰沙", name_en: "Dayungs Irwin Mango Smoothie", ml: 700, kcal: 393,  sugar: 81,   fixedSugar: 46, kind: "tea" },
  { name: "大苑子 芭樂檸檬",   name_en: "Dayungs Guava Lemon",          ml: 700, kcal: 271,   sugar: 58,   fixedSugar: 23, kind: "tea" },
  { name: "大苑子 芭樂甘草",   name_en: "Dayungs Guava Licorice",       ml: 700, kcal: 205,   sugar: 42,   fixedSugar: 7, kind: "tea" },
  { name: "大苑子 芭樂梅",     name_en: "Dayungs Guava Plum",           ml: 700, kcal: 221,   sugar: 44,   fixedSugar: 9, kind: "tea" },
  { name: "大苑子 春熙柳丁翡翠", name_en: "Dayungs Orange Jade Tea",     ml: 700, kcal: 280,  sugar: 62,   fixedSugar: 27, kind: "tea" },
  { name: "大苑子 甜橙火龍果", name_en: "Dayungs Orange Dragon Fruit",  ml: 700, kcal: 265,   sugar: 59,   fixedSugar: 24, kind: "tea" },
  { name: "大苑子 鳳梨冰茶",   name_en: "Dayungs Pineapple Iced Tea",   ml: 700, kcal: 311,   sugar: 68,   fixedSugar: 33, kind: "tea" },
  { name: "大苑子 埔里百香果綠", name_en: "Dayungs Puli Passion Fruit Green Tea", ml: 700, kcal: 260, sugar: 55, fixedSugar: 20, kind: "tea" },
  { name: "大苑子 百香愛玉",   name_en: "Dayungs Passion Fruit Aiyu",   ml: 700, kcal: 229,   sugar: 49,   fixedSugar: 4,  kind: "tea", toppings: ["愛玉"] },
  { name: "大苑子 蜂蜜檸檬",   name_en: "Dayungs Honey Lemon",          ml: 700, kcal: 313,   sugar: 67,   fixedSugar: 32,  kind: "tea" },
  { name: "大苑子 蜂蜜檸檬奇亞籽", name_en: "Dayungs Honey Lemon Chia",  ml: 700, kcal: 282,   sugar: 54,   fixedSugar: 19,  kind: "tea" },
  { name: "大苑子 百變火龍冰沙", name_en: "Dayungs Dragon Fruit Smoothie", ml: 700, kcal: 364, sugar: 77,   fixedSugar: 42, kind: "tea" },
  { name: "大苑子 巨峰葡萄雪沙", name_en: "Dayungs Kyoho Grape Slush",   ml: 700, kcal: 344,   sugar: 79,   fixedSugar: 44, kind: "tea" },
  { name: "大苑子 奶茶",       name_en: "Dayungs Milk Tea",             ml: 700, kcal: 545,   sugar: 68, fixedSugar: 12,   kind: "creamer" },
  { name: "大苑子 珍珠奶茶",   name_en: "Dayungs Pearl Milk Tea",       ml: 700, kcal: 712,   sugar: 77, fixedSugar: 6,   kind: "creamer", toppings: ["珍珠"] },
  { name: "大苑子 許慶良鮮奶茶", name_en: "Dayungs Hsu Ching-Liang Fresh Milk Tea", ml: 700, kcal: 409, sugar: 72, fixedSugar: 16, kind: "milk" },
  { name: "大苑子 許慶良鮮奶冬瓜", name_en: "Dayungs Hsu Ching-Liang Fresh Milk Winter Melon", ml: 700, kcal: 542, sugar: 92, fixedSugar: 36, kind: "milk" },
  { name: "大苑子 纖活綠茶",   name_en: "Dayungs Green Tea",            ml: 700, kcal: 154,   sugar: 35,   kind: "tea", water: true },
  { name: "大苑子 古城錫蘭紅茶", name_en: "Dayungs Ceylon Black Tea",    ml: 700, kcal: 264,   sugar: 56,   kind: "tea", water: true },
  { name: "大苑子 愛文翡翠",   name_en: "Dayungs Irwin Mango Jade Tea", ml: 700, kcal: 290,   sugar: 65, fixedSugar: 30,   kind: "tea" },
  { name: "大苑子 火龍果翡翠", name_en: "Dayungs Dragon Fruit Jade Tea", ml: 700, kcal: 248,   sugar: 53, fixedSugar: 8,   kind: "tea", toppings: ["愛玉"] },
  // ── 茶湯會 — platform labels, large = 22 oz cold (~650 ml)
  { name: "茶湯會 四季春",     name_en: "TP Tea Four Seasons Tea",      ml: 650, kcal: 157,   sugar: 36,   kind: "tea", water: true },
  { name: "茶湯會 碳燒鐵觀音", name_en: "TP Tea Charcoal Tieguanyin",   ml: 650, kcal: 178,   sugar: 41,   kind: "tea", water: true },
  { name: "茶湯會 特級翡翠綠", name_en: "TP Tea Premium Jade Green Tea", ml: 650, kcal: 177,  sugar: 41,   kind: "tea", water: true },
  { name: "茶湯會 翡翠拿鐵",   name_en: "TP Tea Jade Latte",            ml: 650, kcal: 295,   sugar: 49, fixedSugar: 8,   kind: "milk" },
  { name: "茶湯會 翡翠檸檬",   name_en: "TP Tea Jade Lemon",            ml: 650, kcal: 334,   sugar: 73,   fixedSugar: 32,  kind: "tea" },
  { name: "茶湯會 觀音拿鐵",   name_en: "TP Tea Tieguanyin Latte",      ml: 650, kcal: 297,   sugar: 49,   fixedSugar: 8, kind: "milk" },
  { name: "茶湯會 鐵觀音奶茶", name_en: "TP Tea Tieguanyin Milk Tea",   ml: 650, kcal: 581,   sugar: 47, fixedSugar: 6,   kind: "creamer" },
  { name: "茶湯會 鐵觀音珍珠奶茶", name_en: "TP Tea Tieguanyin Pearl Milk Tea", ml: 650, kcal: 717, sugar: 42, kind: "creamer", toppings: ["珍珠"] },
  // ── 五桐號 — platform labels, large 660 ml
  { name: "五桐號 經典五桐茶", name_en: "WooTea Classic Wootong Tea",   ml: 660, kcal: 74.7,  sugar: 16.7, kind: "tea", water: true },
  { name: "五桐號 杏仁凍五桐茶", name_en: "WooTea Almond Jelly Wootong Tea", ml: 660, kcal: 192, sugar: 36, fixedSugar: 19.3, kind: "tea" },
  // 奶霜 is lighter than the generic 奶蓋 topping (subtracting it leaves more sugar
  // than calories), so the foam stays in the drink's own figures
  { name: "五桐號 烏龍奶霜",   name_en: "WooTea Oolong Cream Foam",     ml: 660, kcal: 303.2, sugar: 41.9, fixedSugar: 25.2, kind: "creamer" },
  { name: "五桐號 蕎麥奶霜",   name_en: "WooTea Buckwheat Cream Foam",  ml: 660, kcal: 320.3, sugar: 46, fixedSugar: 29.3,   kind: "creamer" },
  // ── 一沐日 — platform labels at its one 660 ml cup, normal sweetness (the highest)
  { name: "一沐日 島韻紅茶",   name_en: "Yi Mu Ri Island Black Tea",    ml: 660, kcal: 200,   sugar: 48,   kind: "tea", water: true },
  { name: "一沐日 糯米香茶",   name_en: "Yi Mu Ri Glutinous Rice Green Tea", ml: 660, kcal: 200, sugar: 48, kind: "tea", water: true },
  { name: "一沐日 粉粿牡丹紅柚", name_en: "Yi Mu Ri Grapefruit with Fen Guo", ml: 660, kcal: 288, sugar: 63, fixedSugar: 15, kind: "tea" },
  { name: "一沐日 糯香檸檬茶", name_en: "Yi Mu Ri Glutinous Lemon Tea", ml: 660, kcal: 385,   sugar: 87,   fixedSugar: 39,  kind: "tea" },
  { name: "一沐日 粉粿桂花檸檬", name_en: "Yi Mu Ri Osmanthus Lemon with Fen Guo", ml: 660, kcal: 359, sugar: 76, fixedSugar: 76, kind: "tea" },
  { name: "一沐日 奶蓋島韻紅", name_en: "Yi Mu Ri Milk Foam Island Black Tea", ml: 660, kcal: 426, sugar: 38, kind: "tea", toppings: ["奶蓋"] },
  { name: "一沐日 蕎麥鮮奶茶", name_en: "Yi Mu Ri Buckwheat Fresh Milk Tea", ml: 660, kcal: 304, sugar: 50, fixedSugar: 2, kind: "milk" },
  { name: "一沐日 逮丸奶茶",   name_en: "Yi Mu Ri Dai Wan Milk Tea",    ml: 660, kcal: 630,   sugar: 77, fixedSugar: 29,   kind: "creamer" },
  // ── 龜記茗品 — platform labels, cold 660 ml
  { name: "龜記 翡翠綠茶",     name_en: "Guiji Jade Green Tea",         ml: 660, kcal: 212,   sugar: 45,   kind: "tea", water: true },
  { name: "龜記 紅柚翡翠",     name_en: "Guiji Grapefruit Green Tea",   ml: 660, kcal: 285,   sugar: 63,   fixedSugar: 18, kind: "tea" },
  { name: "龜記 阿源楊桃綠茶", name_en: "Guiji Starfruit Green Tea",    ml: 660, kcal: 250,   sugar: 60,   fixedSugar: 15, kind: "tea" },
  { name: "龜記 楊桃雷夢",     name_en: "Guiji Starfruit Lemon",        ml: 660, kcal: 299,   sugar: 68,   fixedSugar: 23, kind: "tea" },
  // ── 萬波島嶼紅茶 — platform labels (L)
  { name: "萬波 島嶼紅茶",     name_en: "Wanpo Island Black Tea",       ml: 700, kcal: 246,   sugar: 59,   kind: "tea", water: true },
  { name: "萬波 島嶼檸檬茶王", name_en: "Wanpo Island Lemon Tea King",  ml: 700, kcal: 479,   sugar: 95,   fixedSugar: 36,  kind: "tea" },
  // ── 珍煮丹 — platform labels (L); brown-sugar syrup isn't adjusted, so it's all fixed
  { name: "珍煮丹 黑糖鮮奶",   name_en: "Truedan Brown Sugar Fresh Milk", ml: 700, kcal: 364, sugar: 42,   fixedSugar: 42, kind: "milk" },
  { name: "珍煮丹 黑糖珍珠鮮奶", name_en: "Truedan Brown Sugar Pearl Fresh Milk", ml: 700, kcal: 619, sugar: 70, fixedSugar: 70, kind: "milk", toppings: ["珍珠"] },
  // ── 鶴茶樓 — platform labels (one store, L)
  { name: "鶴茶樓 鶴頂紅茶",   name_en: "Hechalou Crane Black Tea",     ml: 660, kcal: 174,   sugar: 41,   kind: "tea", water: true },
  { name: "鶴茶樓 鶴頂那堤",   name_en: "Hechalou Crane Latte",         ml: 660, kcal: 290,   sugar: 49,   fixedSugar: 8, kind: "milk" },
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
  "迷客夏 珍珠伯爵紅茶拿鐵", // platforms label 伯爵紅茶拿鐵 without pearls
  "迷客夏 珍珠手炒黑糖鮮奶", // likewise 手炒黑糖鮮奶
];

export interface SeedDrink extends SeedFood {
  /** Chain the drink is from — every drink name is "<brand> <item>". */
  brand: string;
  sugar_g: number;
  sugar_fixed_g: number;
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
    food_name: d.name, name_en: d.name_en, brand: d.name.split(" ")[0],
    protein_g: r1(m.p), carbohydrates_g: r1(m.c), fat_g: r1(m.f), calories_kcal: r1(kcal),
    base_quantity: d.ml, base_unit: "ml", category: "飲料",
    counts_as_water: d.water ?? false,
    sugar_g: r1(sugar),
    sugar_fixed_g: Math.min(r1(sugar), d.fixedSugar ?? 0),
    default_toppings: d.toppings ?? [],
  };
});
