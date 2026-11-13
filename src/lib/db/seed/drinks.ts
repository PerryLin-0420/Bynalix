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
 * sugar by the kind of drink (see `estimateDrinkMacros` in lib/drink.ts).
 */

import type { SeedFood } from "./foods";
import { estimateDrinkMacros, type DrinkKind } from "@/lib/drink";

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
  // 有飲's own toppings, from its calorie table (per serving, 125 ± 5 g; 蜜燕麥 100 g).
  // Only kcal and sugar are published; the rest is estimated from the ingredients.
  { name: "寒天纖果", name_en: "Agar fiber jelly", calories_kcal: 78,  protein_g: 0,   carbohydrates_g: 22.5, fat_g: 0,  sugar_g: 22.5 },
  { name: "蜜燕麥",   name_en: "Honey oats",      calories_kcal: 149.2, protein_g: 5, carbohydrates_g: 26.7, fat_g: 2.5, sugar_g: 5.6 },
  { name: "椪糖Q粿",  name_en: "Dalgona rice cake", calories_kcal: 112.1, protein_g: 0.5, carbohydrates_g: 27.5, fat_g: 0, sugar_g: 25.5 },
  { name: "椪糖凍",   name_en: "Dalgona jelly",   calories_kcal: 84.3, protein_g: 0,  carbohydrates_g: 21.1, fat_g: 0,  sugar_g: 20.8 },
];

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
  /** Cup volumes when this drink isn't sold in all of its chain's sizes (else BRAND_CUPS). */
  cups?: { M?: number; L?: number; XL?: number };
}

/**
 * Each chain's cup volumes (ml), used as the cup shortcuts when logging. The
 * L cup is also the base volume of that chain's drinks above, since shops
 * label the large cup. A chain with only one size lists just that one.
 * Sources: docs/drinks-research.md §14.
 */
export const BRAND_CUPS: Record<string, { M?: number; L: number; XL?: number }> = {
  "50嵐":     { M: 500, L: 700 },
  "CoCo":     { M: 500, L: 640 },
  "清心福全": { M: 420, L: 650 },
  "迷客夏":   { M: 460, L: 600 },
  "可不可":   { M: 500, L: 700 },
  "麻古":     { L: 700, XL: 960 },
  "得正":     { M: 480, L: 660 },
  "大苑子":   { M: 500, L: 700 },
  "茶湯會":   { M: 470, L: 650 },
  "五桐號":   { M: 500, L: 660 },
  "一沐日":   { L: 660 },
  "龜記":     { M: 500, L: 660 },
  "萬波":     { M: 500, L: 700 },
  "珍煮丹":   { M: 500, L: 650 },
  "鶴茶樓":   { M: 500, L: 660 },
  "有飲":     { M: 500, L: 660 },
};

// Fixed (non-adjustable) sugar is measured from calories, not guessed: a brand's
// plain tea is all syrup, so its full-sugar kcal ÷ 4 is the syrup in a cup. For
// any other drink, fixed = (total sugar − toppings' sugar) − that syrup, scaled
// to the cup. 大苑子 uses its green tea for fruit / green drinks and its black tea
// for milk teas, since the two differ. Per-brand syrup: docs/drinks-research.md §12–13.
const DRINKS: DrinkSpec[] = [
  // ── 50嵐 — platform labels (Uber Eats) where available, else dietitian figures. Fixed sugar uses each
  // drink's own syrup from the chain's 加糖量 table (L: 8 cubes = 40 g; lemon / kumquat 50; topping drinks 30; Ovaltine 20).
  { name: "50嵐 四季春青茶",   name_en: "50 Lan Four Seasons Tea",      ml: 720, kcal: 183.6, sugar: 43.1, kind: "tea", water: true },
  { name: "50嵐 檸檬綠茶",     name_en: "50 Lan Lemon Green Tea",       ml: 720, kcal: 232.6, sugar: 51.7, fixedSugar: 0.3, kind: "tea" },
  { name: "50嵐 1號 四季春珍波椰", name_en: "50 Lan No.1 Four Seasons w/ Pearls, Boba & Coconut", ml: 720, kcal: 433.8, sugar: 65, fixedSugar: 4.1, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "50嵐 紅茶拿鐵",     name_en: "50 Lan Black Tea Latte",       ml: 720, kcal: 354.4, sugar: 55.1, fixedSugar: 14, kind: "milk" },
  { name: "50嵐 珍珠奶茶",     name_en: "50 Lan Pearl Milk Tea",        ml: 700, kcal: 726.6, sugar: 56.9, fixedSugar: 11.9, kind: "creamer", toppings: ["珍珠"] },
  // 波霸奶茶: no platform label found yet — dietitian figure
  { name: "50嵐 波霸奶茶",     name_en: "50 Lan Boba Milk Tea",         ml: 700, kcal: 678,   sugar: 53,   fixedSugar: 8, kind: "creamer", toppings: ["波霸"] },
  { name: "50嵐 黃金烏龍",     name_en: "50 Lan Golden Oolong",         ml: 700, kcal: 171.4, sugar: 40.2, kind: "tea", water: true },
  { name: "50嵐 微檸檬青茶",   name_en: "50 Lan Light Lemon Green Tea", ml: 700, kcal: 191.3, sugar: 43.1, fixedSugar: 3.1, kind: "tea" },
  { name: "50嵐 金桔檸檬",     name_en: "50 Lan Kumquat Lemon",         ml: 700, kcal: 244.3, sugar: 51.7, fixedSugar: 1.7, kind: "tea" },
  { name: "50嵐 檸檬梅汁",     name_en: "50 Lan Lemon Plum Juice",      ml: 700, kcal: 326.2, sugar: 74.2, fixedSugar: 34.2, kind: "tea" },
  { name: "50嵐 波霸紅茶",     name_en: "50 Lan Boba Black Tea",        ml: 700, kcal: 472.5, sugar: 52.2, fixedSugar: 7.2, kind: "tea", toppings: ["波霸"] },
  { name: "50嵐 波霸紅茶拿鐵", name_en: "50 Lan Boba Black Tea Latte",  ml: 700, kcal: 644.8, sugar: 65.6, fixedSugar: 20.6, kind: "milk", toppings: ["波霸"] },
  { name: "50嵐 阿華田拿鐵",   name_en: "50 Lan Ovaltine Latte",        ml: 700, kcal: 524.2, sugar: 64.1, fixedSugar: 44.1, kind: "milk" },
  { name: "50嵐 冰淇淋奶茶",   name_en: "50 Lan Ice Cream Milk Tea",    ml: 700, kcal: 708.6, sugar: 72.9, fixedSugar: 42.9, kind: "creamer" },
  { name: "50嵐 冰淇淋阿華田", name_en: "50 Lan Ice Cream Ovaltine",    ml: 700, kcal: 762,   sugar: 79.3, fixedSugar: 59.3, kind: "creamer" },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "50嵐 茉莉綠茶", name_en: "50 Lan Jasmine Green Tea", ml: 700, kcal: 170, sugar: 40, kind: "tea", water: true },
  { name: "50嵐 阿薩姆紅茶", name_en: "50 Lan Assam Black Tea", ml: 700, kcal: 170, sugar: 40, kind: "tea", water: true },
  { name: "50嵐 珍珠奶綠", name_en: "50 Lan Pearl Green Milk Tea", ml: 700, kcal: 668, sugar: 53, fixedSugar: 8, kind: "creamer", toppings: ["珍珠"] },
  { name: "50嵐 波霸奶綠", name_en: "50 Lan Boba Green Milk Tea", ml: 700, kcal: 678, sugar: 53, fixedSugar: 8, kind: "creamer", toppings: ["波霸"] },
  { name: "50嵐 布丁奶茶", name_en: "50 Lan Pudding Milk Tea", ml: 700, kcal: 592, sugar: 64, fixedSugar: 21, kind: "creamer", toppings: ["布丁"] },
  { name: "50嵐 冰淇淋紅茶", name_en: "50 Lan Ice Cream Black Tea", ml: 700, kcal: 436, sugar: 67, fixedSugar: 37, kind: "creamer" },
  { name: "50嵐 紅茶瑪奇朵", name_en: "50 Lan Black Tea Macchiato", ml: 700, kcal: 636, sugar: 60, fixedSugar: 20, kind: "creamer" },
  { name: "50嵐 烏龍瑪奇朵", name_en: "50 Lan Oolong Macchiato", ml: 700, kcal: 636, sugar: 60, fixedSugar: 20, kind: "creamer" },
  { name: "50嵐 8冰綠", name_en: "50 Lan No.8 Iced Green Tea", ml: 700, kcal: 291, sugar: 67, fixedSugar: 27, kind: "tea" },
  { name: "50嵐 柚子茶", name_en: "50 Lan Yuzu Tea", ml: 700, kcal: 301, sugar: 53, fixedSugar: 11.9, kind: "tea" },
  { name: "50嵐 葡萄柚多多", name_en: "50 Lan Grapefruit Yakult", ml: 700, kcal: 374, sugar: 84, fixedSugar: 44, kind: "tea" },
  { name: "50嵐 梅の綠", name_en: "50 Lan Plum Green Tea", ml: 700, kcal: 395, sugar: 93, fixedSugar: 53, kind: "tea" },
  { name: "50嵐 旺來紅", name_en: "50 Lan Pineapple Black Tea", ml: 700, kcal: 326, sugar: 75, fixedSugar: 33.9, kind: "tea" },
  { name: "50嵐 桔子綠", name_en: "50 Lan Kumquat Green Tea", ml: 700, kcal: 218, sugar: 48, kind: "tea" },
  { name: "50嵐 鮮柚綠", name_en: "50 Lan Pomelo Green Tea", ml: 700, kcal: 226, sugar: 51, fixedSugar: 11, kind: "tea" },
  // ── CoCo 都可 — the chain's own sugar / calorie tables (two sheets; the newer one wins where both
  // list a drink), 640 ml. Syrup baseline: its plain teas, 41 g. QQ = 珍珠 + 椰果. docs/drinks-research.md §18.
  { name: "CoCo 四季春", name_en: "CoCo Four Seasons Tea", ml: 640, kcal: 177, sugar: 41, kind: "tea", water: true },
  { name: "CoCo 茉莉綠茶", name_en: "CoCo Jasmine Green Tea", ml: 640, kcal: 177, sugar: 41, kind: "tea", water: true },
  { name: "CoCo 21歲輕烏龍", name_en: "CoCo 21-Year Light Oolong", ml: 640, kcal: 177, sugar: 41, kind: "tea", water: true },
  { name: "CoCo 手採紅茶", name_en: "CoCo Hand-picked Black Tea", ml: 640, kcal: 177, sugar: 41, kind: "tea", water: true },
  { name: "CoCo 四季珍椰青", name_en: "CoCo Four Seasons w/ Pearls & Coconut", ml: 640, kcal: 358, sugar: 58, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 蜜香凍紅茶", name_en: "CoCo Black Tea with Tea Jelly", ml: 640, kcal: 341, sugar: 79, fixedSugar: 30, kind: "tea", toppings: ["茶凍"] },
  { name: "CoCo 蜜香凍綠茶", name_en: "CoCo Green Tea with Tea Jelly", ml: 640, kcal: 367, sugar: 85, fixedSugar: 36, kind: "tea", toppings: ["茶凍"] },
  { name: "CoCo 蜜香凍青茶", name_en: "CoCo Qing Tea with Tea Jelly", ml: 640, kcal: 338, sugar: 78, fixedSugar: 29, kind: "tea", toppings: ["茶凍"] },
  { name: "CoCo 奶茶三兄弟", name_en: "CoCo Milk Tea Three Brothers", ml: 640, kcal: 622, sugar: 61, kind: "creamer", toppings: ["珍珠", "布丁", "仙草凍"] },
  { name: "CoCo 阿薩姆奶茶", name_en: "CoCo Assam Milk Tea", ml: 640, kcal: 584, sugar: 46, fixedSugar: 5, kind: "creamer" },
  { name: "CoCo 珍珠奶茶", name_en: "CoCo Pearl Milk Tea", ml: 640, kcal: 712, sugar: 48, kind: "creamer", toppings: ["珍珠"] },
  { name: "CoCo 布丁奶茶", name_en: "CoCo Pudding Milk Tea", ml: 640, kcal: 522, sugar: 56, fixedSugar: 2, kind: "creamer", toppings: ["布丁"] },
  { name: "CoCo 3Q奶茶", name_en: "CoCo 3Q Milk Tea", ml: 640, kcal: 760, sugar: 63, fixedSugar: 22, kind: "creamer" },
  { name: "CoCo QQ奶茶", name_en: "CoCo QQ Milk Tea", ml: 640, kcal: 818, sugar: 80, fixedSugar: 9, kind: "creamer", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 英式鮮奶茶", name_en: "CoCo English Fresh Milk Tea", ml: 640, kcal: 363, sugar: 56, fixedSugar: 15, kind: "milk" },
  { name: "CoCo 珍珠鮮奶茶", name_en: "CoCo Pearl Fresh Milk Tea", ml: 640, kcal: 547, sugar: 54, kind: "milk", toppings: ["珍珠"] },
  { name: "CoCo 鐵觀音鮮奶茶", name_en: "CoCo Tieguanyin Fresh Milk Tea", ml: 640, kcal: 361, sugar: 62, fixedSugar: 21, kind: "milk" },
  { name: "CoCo 伯爵厚鮮奶茶", name_en: "CoCo Earl Grey Rich Fresh Milk Tea", ml: 640, kcal: 476, sugar: 60, fixedSugar: 19, kind: "milk" },
  { name: "CoCo QQ鮮奶茶", name_en: "CoCo QQ Fresh Milk Tea", ml: 640, kcal: 555, sugar: 73, fixedSugar: 2, kind: "milk", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 3Q鮮奶茶", name_en: "CoCo 3Q Fresh Milk Tea", ml: 640, kcal: 551, sugar: 64, fixedSugar: 23, kind: "milk" },
  { name: "CoCo 芋頭牛奶", name_en: "CoCo Taro Milk", ml: 640, kcal: 552, sugar: 63, fixedSugar: 22, kind: "milk" },
  { name: "CoCo 芋頭QQ牛奶", name_en: "CoCo Taro QQ Milk", ml: 640, kcal: 679, sugar: 74, fixedSugar: 3, kind: "milk", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 莓果派對", name_en: "CoCo Berry Party", ml: 640, kcal: 273, sugar: 60, fixedSugar: 19, kind: "tea" },
  { name: "CoCo 雲朵奶蓋莓莓", name_en: "CoCo Cloud Foam Berries", ml: 640, kcal: 528, sugar: 71, fixedSugar: 18, kind: "tea", toppings: ["奶蓋"] },
  { name: "CoCo 莓果戀人", name_en: "CoCo Berry Lovers", ml: 640, kcal: 423, sugar: 71, fixedSugar: 30, kind: "milk" },
  { name: "CoCo 巧克力奶茶", name_en: "CoCo Chocolate Milk Tea", ml: 640, kcal: 543, sugar: 46, fixedSugar: 5, kind: "creamer" },
  { name: "CoCo 巧克力珍珠奶茶", name_en: "CoCo Chocolate Pearl Milk Tea", ml: 640, kcal: 635, sugar: 44, kind: "creamer", toppings: ["珍珠"] },
  { name: "CoCo 巧克力歐蕾", name_en: "CoCo Chocolate Au Lait", ml: 640, kcal: 637, sugar: 50, fixedSugar: 9, kind: "milk" },
  { name: "CoCo 燕麥奶茶", name_en: "CoCo Oat Milk Tea", ml: 640, kcal: 653, sugar: 71, fixedSugar: 30, kind: "creamer" },
  { name: "CoCo 燕麥鮮奶茶", name_en: "CoCo Oat Fresh Milk Tea", ml: 640, kcal: 371, sugar: 55, fixedSugar: 14, kind: "milk" },
  { name: "CoCo 燕麥莓果奶茶", name_en: "CoCo Oat Berry Milk Tea", ml: 640, kcal: 689, sugar: 68, fixedSugar: 27, kind: "creamer" },
  { name: "CoCo 燕麥QQ鮮奶茶", name_en: "CoCo Oat QQ Fresh Milk Tea", ml: 640, kcal: 570, sugar: 73, fixedSugar: 2, kind: "milk", toppings: ["珍珠", "椰果"] },
  // 16 oz coffee; its sugar is the milk's, so it's all fixed
  { name: "CoCo 美式咖啡", name_en: "CoCo Americano", ml: 480, kcal: 21, sugar: 0, kind: "tea", cups: { M: 480 } },
  { name: "CoCo 拿鐵咖啡", name_en: "CoCo Caffè Latte", ml: 480, kcal: 245, sugar: 17, fixedSugar: 17, kind: "milk", cups: { M: 480 } },
  { name: "CoCo 珍珠拿鐵咖啡", name_en: "CoCo Pearl Caffè Latte", ml: 480, kcal: 337, sugar: 21, fixedSugar: 6, kind: "milk", toppings: ["珍珠"], cups: { M: 480 } },
  // Not on the chain's tables — platform / dietitian labels
  { name: "CoCo 葡萄柚果粒茶", name_en: "CoCo Grapefruit Fruit Tea", ml: 640, kcal: 341, sugar: 80, fixedSugar: 39, kind: "tea" },
  { name: "CoCo 百香雙響炮", name_en: "CoCo Passion Fruit Double", ml: 640, kcal: 472, sugar: 82, fixedSugar: 11, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 紅柚雙響炮", name_en: "CoCo Grapefruit Double", ml: 640, kcal: 427, sugar: 77, fixedSugar: 6, kind: "tea", toppings: ["珍珠", "椰果"] },
  { name: "CoCo 紅柚香檸美式", name_en: "CoCo Grapefruit Lemon Americano", ml: 640, kcal: 223, sugar: 51, fixedSugar: 10, kind: "tea" },
  { name: "CoCo 冬韻擂焙珍奶", name_en: "CoCo Roasted Pearl Milk Tea", ml: 640, kcal: 749, sugar: 59, fixedSugar: 3, kind: "creamer", toppings: ["珍珠"] },
  { name: "CoCo 百香綠茶", name_en: "CoCo Passion Fruit Green Tea", ml: 640, kcal: 355, sugar: 84, fixedSugar: 43, kind: "tea" },
  { name: "CoCo 鮮檸檬紅茶", name_en: "CoCo Fresh Lemon Black Tea", ml: 640, kcal: 322, sugar: 73, fixedSugar: 32, kind: "tea" },
  // ── 清心福全 — the chain's 飲料標示表 (大杯 650 / 中杯 420 ml). Each drink is labelled at its
  // highest level (少糖 / 少蜜 = 70%, 半糖 50%, 微糖 30%, 無糖), converted here to 全糖: the syrup at
  // that level is its share of 74.3 g (少糖 plain teas average 52 g ÷ 0.7); sugar beyond it is fixed;
  // the syrup is scaled up to 100%, +4 kcal per added gram. 無糖-only drinks are all fixed. §18.
  { name: "清心福全 桂圓茶", name_en: "Chingshin Longan Tea", ml: 650, kcal: 290, sugar: 65, fixedSugar: 65, kind: "tea" },
  { name: "清心福全 桂圓鮮奶茶", name_en: "Chingshin Longan Fresh Milk Tea", ml: 650, kcal: 405, sugar: 65, fixedSugar: 65, kind: "milk" },
  { name: "清心福全 蜂蜜檸檬", name_en: "Chingshin Honey Lemon", ml: 650, kcal: 359.1, sugar: 79.3, fixedSugar: 5, kind: "tea" },
  { name: "清心福全 蘆薈蜂蜜檸檬", name_en: "Chingshin Aloe Honey Lemon", ml: 650, kcal: 415.1, sugar: 98.3, fixedSugar: 17, kind: "tea", toppings: ["蘆薈"] },
  { name: "清心福全 金桔檸檬", name_en: "Chingshin Kumquat Lemon", ml: 650, kcal: 305.7, sugar: 71.4, kind: "tea" },
  { name: "清心福全 葡萄柚綠茶", name_en: "Chingshin Grapefruit Green Tea", ml: 650, kcal: 347.1, sugar: 84.3, fixedSugar: 10, kind: "tea" },
  { name: "清心福全 檸檬紅茶", name_en: "Chingshin Lemon Black Tea", ml: 650, kcal: 304.4, sugar: 72.9, kind: "tea" },
  { name: "清心福全 檸檬綠茶", name_en: "Chingshin Lemon Green Tea", ml: 650, kcal: 295, sugar: 70, kind: "tea" },
  { name: "清心福全 檸檬汁", name_en: "Chingshin Lemon Juice", ml: 650, kcal: 298, sugar: 70, kind: "tea" },
  { name: "清心福全 葡萄柚汁", name_en: "Chingshin Grapefruit Juice", ml: 650, kcal: 328.1, sugar: 79.3, fixedSugar: 5, kind: "tea" },
  { name: "清心福全 桔茶", name_en: "Chingshin Kumquat Tea", ml: 650, kcal: 296.7, sugar: 71.4, kind: "tea" },
  { name: "清心福全 冬瓜茶", name_en: "Chingshin Winter Melon Tea", ml: 650, kcal: 421.6, sugar: 99.1, fixedSugar: 24.9, kind: "tea" },
  { name: "清心福全 冬瓜檸檬", name_en: "Chingshin Winter Melon Lemon", ml: 650, kcal: 421.6, sugar: 101.1, fixedSugar: 26.9, kind: "tea" },
  { name: "清心福全 冬瓜菁茶", name_en: "Chingshin Winter Melon Green Tea", ml: 650, kcal: 452.6, sugar: 107.1, fixedSugar: 32.9, kind: "tea" },
  { name: "清心福全 梅子綠茶", name_en: "Chingshin Plum Green Tea", ml: 650, kcal: 293.3, sugar: 68.6, kind: "tea" },
  { name: "清心福全 蜂蜜烏龍", name_en: "Chingshin Honey Oolong", ml: 650, kcal: 424.1, sugar: 95.3, fixedSugar: 21, kind: "tea" },
  { name: "清心福全 蜂蜜綠茶", name_en: "Chingshin Honey Green Tea", ml: 650, kcal: 403.1, sugar: 90.3, fixedSugar: 16, kind: "tea" },
  { name: "清心福全 蜜茶", name_en: "Chingshin Honey Tea", ml: 650, kcal: 356.1, sugar: 79.3, fixedSugar: 5, kind: "tea" },
  { name: "清心福全 情人茶", name_en: "Chingshin Lover's Tea", ml: 650, kcal: 282.6, sugar: 67.1, kind: "tea" },
  { name: "清心福全 頂級可可", name_en: "Chingshin Premium Cocoa", ml: 650, kcal: 653.1, sugar: 100.3, fixedSugar: 26, kind: "creamer" },
  { name: "清心福全 濃情巧克力", name_en: "Chingshin Rich Chocolate", ml: 650, kcal: 583.1, sugar: 88.3, fixedSugar: 14, kind: "creamer" },
  { name: "清心福全 咖啡奶茶", name_en: "Chingshin Coffee Milk Tea", ml: 650, kcal: 465, sugar: 70, kind: "creamer" },
  { name: "清心福全 芋香奶茶", name_en: "Chingshin Taro Milk Tea", ml: 650, kcal: 722.1, sugar: 76.3, fixedSugar: 2, kind: "creamer" },
  { name: "清心福全 紅牛無糖能量綠茶", name_en: "Chingshin Red Bull Sugar-free Energy Green Tea", ml: 650, kcal: 25, sugar: 0, kind: "tea" },
  { name: "清心福全 紅牛能量紅茶", name_en: "Chingshin Red Bull Energy Black Tea", ml: 650, kcal: 309.6, sugar: 76.1, fixedSugar: 1.9, kind: "tea" },
  { name: "清心福全 冰淇淋紅茶", name_en: "Chingshin Ice Cream Black Tea", ml: 650, kcal: 645.1, sugar: 112.3, fixedSugar: 38, kind: "creamer" },
  { name: "清心福全 冰淇淋奶茶", name_en: "Chingshin Ice Cream Milk Tea", ml: 650, kcal: 873.1, sugar: 96.3, fixedSugar: 22, kind: "creamer" },
  { name: "清心福全 紅茶三兄弟", name_en: "Chingshin Black Tea Three Brothers", ml: 650, kcal: 885, sugar: 128, fixedSugar: 25.7, kind: "creamer", toppings: ["珍珠", "布丁"] },
  { name: "清心福全 優多綠茶", name_en: "Chingshin Yakult Green Tea", ml: 650, kcal: 434.1, sugar: 97.3, fixedSugar: 23, kind: "tea" },
  { name: "清心福全 優多檸檬", name_en: "Chingshin Yakult Lemon", ml: 650, kcal: 437.1, sugar: 98.3, fixedSugar: 24, kind: "tea" },
  { name: "清心福全 優多葡萄柚", name_en: "Chingshin Yakult Grapefruit", ml: 650, kcal: 449.1, sugar: 106.3, fixedSugar: 32, kind: "tea" },
  { name: "清心福全 蘆薈優多綠茶", name_en: "Chingshin Aloe Yakult Green Tea", ml: 650, kcal: 474.1, sugar: 114.3, fixedSugar: 33, kind: "tea", toppings: ["蘆薈"] },
  { name: "清心福全 蘋果醋", name_en: "Chingshin Apple Vinegar", ml: 650, kcal: 480.1, sugar: 112.3, fixedSugar: 38, kind: "tea" },
  { name: "清心福全 蘋果醋紅茶", name_en: "Chingshin Apple Vinegar Black Tea", ml: 650, kcal: 493.1, sugar: 114.3, fixedSugar: 40, kind: "tea" },
  { name: "清心福全 蜂蜜蘋果醋", name_en: "Chingshin Honey Apple Vinegar", ml: 650, kcal: 604.1, sugar: 136.3, fixedSugar: 62, kind: "tea" },
  { name: "清心福全 藍莓醋", name_en: "Chingshin Blueberry Vinegar", ml: 650, kcal: 462.1, sugar: 107.3, fixedSugar: 33, kind: "tea" },
  { name: "清心福全 蘆薈藍莓醋", name_en: "Chingshin Aloe Blueberry Vinegar", ml: 650, kcal: 555.1, sugar: 133.3, fixedSugar: 52, kind: "tea", toppings: ["蘆薈"] },
  { name: "清心福全 蜂蜜藍莓醋", name_en: "Chingshin Honey Blueberry Vinegar", ml: 650, kcal: 592.1, sugar: 138.3, fixedSugar: 64, kind: "tea" },
  { name: "清心福全 烏龍綠茶", name_en: "Chingshin Oolong Green Tea", ml: 650, kcal: 328.6, sugar: 77.1, kind: "tea", water: true },
  { name: "清心福全 特級綠茶", name_en: "Chingshin Special Grade Green Tea", ml: 650, kcal: 296.3, sugar: 68.6, kind: "tea", water: true },
  { name: "清心福全 錫蘭紅茶", name_en: "Chingshin Ceylon Black Tea", ml: 650, kcal: 305.7, sugar: 71.4, kind: "tea", water: true },
  { name: "清心福全 極品菁茶", name_en: "Chingshin Premium Green Tea", ml: 650, kcal: 328.6, sugar: 77.1, kind: "tea", water: true },
  { name: "清心福全 原鄉四季", name_en: "Chingshin Four Seasons Tea", ml: 650, kcal: 250, sugar: 58, kind: "tea", water: true },
  { name: "清心福全 特選普洱", name_en: "Chingshin Pu'er Tea", ml: 650, kcal: 293.3, sugar: 68.6, kind: "tea", water: true },
  { name: "清心福全 翡翠烏龍", name_en: "Chingshin Jade Oolong", ml: 650, kcal: 328.6, sugar: 77.1, kind: "tea", water: true },
  { name: "清心福全 嚴選高山茶", name_en: "Chingshin High Mountain Tea", ml: 650, kcal: 328.6, sugar: 77.1, kind: "tea", water: true },
  { name: "清心福全 珍珠奶茶", name_en: "Chingshin Pearl Milk Tea", ml: 650, kcal: 816.4, sugar: 67.9, kind: "creamer", toppings: ["珍珠"] },
  { name: "清心福全 波霸奶茶", name_en: "Chingshin Boba Milk Tea", ml: 650, kcal: 816.4, sugar: 67.9, kind: "creamer", toppings: ["波霸"] },
  { name: "清心福全 錫蘭奶紅", name_en: "Chingshin Ceylon Milk Tea", ml: 650, kcal: 773.1, sugar: 80.3, fixedSugar: 6, kind: "creamer" },
  { name: "清心福全 烏龍奶茶", name_en: "Chingshin Oolong Milk Tea", ml: 650, kcal: 750.1, sugar: 83.3, fixedSugar: 9, kind: "creamer" },
  { name: "清心福全 特級奶綠", name_en: "Chingshin Green Milk Tea", ml: 650, kcal: 737.1, sugar: 79.3, fixedSugar: 5, kind: "creamer" },
  { name: "清心福全 仙草凍奶茶", name_en: "Chingshin Grass Jelly Milk Tea", ml: 650, kcal: 576.7, sugar: 83.4, kind: "creamer", toppings: ["仙草凍"] },
  { name: "清心福全 椰果奶茶", name_en: "Chingshin Coconut Jelly Milk Tea", ml: 650, kcal: 651.1, sugar: 90.3, fixedSugar: 1, kind: "creamer", toppings: ["椰果"] },
  { name: "清心福全 布丁奶茶", name_en: "Chingshin Pudding Milk Tea", ml: 650, kcal: 633.3, sugar: 71.6, kind: "creamer", toppings: ["布丁"] },
  { name: "清心福全 暗黑水晶奶茶", name_en: "Chingshin Dark Crystal Milk Tea", ml: 650, kcal: 705.1, sugar: 100.3, fixedSugar: 26, kind: "creamer" },
  { name: "清心福全 粉圓奶茶", name_en: "Chingshin Mini Pearl Milk Tea", ml: 650, kcal: 785.6, sugar: 82.1, kind: "creamer", toppings: ["珍珠"] },
  { name: "清心福全 蜂蜜奶茶", name_en: "Chingshin Honey Milk Tea", ml: 650, kcal: 860.1, sugar: 97.3, fixedSugar: 23, kind: "creamer" },
  { name: "清心福全 芝麻奶茶", name_en: "Chingshin Sesame Milk Tea", ml: 650, kcal: 860.1, sugar: 83.3, fixedSugar: 9, kind: "creamer" },
  { name: "清心福全 太妃鴛鴦奶茶", name_en: "Chingshin Toffee Yuanyang Milk Tea", ml: 650, kcal: 881.6, sugar: 94.1, fixedSugar: 19.9, kind: "creamer" },
  { name: "清心福全 鮮奶茶", name_en: "Chingshin Fresh Milk Tea", ml: 650, kcal: 481.1, sugar: 86.3, fixedSugar: 12, kind: "milk" },
  { name: "清心福全 珍珠鮮奶茶", name_en: "Chingshin Pearl Fresh Milk Tea", ml: 650, kcal: 703.9, sugar: 70.7, kind: "milk", toppings: ["珍珠"] },
  { name: "清心福全 珍珠蜂蜜鮮奶普洱", name_en: "Chingshin Pearl Honey Fresh Milk Pu'er", ml: 650, kcal: 654.1, sugar: 95.3, fixedSugar: 6, kind: "milk", toppings: ["珍珠"] },
  { name: "清心福全 頂級可可拿鐵", name_en: "Chingshin Premium Cocoa Latte", ml: 650, kcal: 712.1, sugar: 113.3, fixedSugar: 39, kind: "milk" },
  { name: "清心福全 鮮奶冬瓜", name_en: "Chingshin Fresh Milk Winter Melon", ml: 650, kcal: 544, sugar: 110, fixedSugar: 35.7, kind: "milk" },
  { name: "清心福全 咖啡拿鐵", name_en: "Chingshin Caffè Latte", ml: 650, kcal: 522.1, sugar: 83.3, fixedSugar: 9, kind: "milk" },
  { name: "清心福全 粉圓鮮奶茶", name_en: "Chingshin Mini Pearl Fresh Milk Tea", ml: 650, kcal: 568.1, sugar: 79.3, kind: "milk", toppings: ["珍珠"] },
  { name: "清心福全 珍珠芝麻拿鐵", name_en: "Chingshin Pearl Sesame Latte", ml: 650, kcal: 660.1, sugar: 97.3, fixedSugar: 8, kind: "milk", toppings: ["珍珠"] },
  // ── 迷客夏 — delivery-platform labels (most stores agree); 娜杯紅茶 is a dietitian figure
  { name: "迷客夏 娜杯紅茶",         name_en: "Milksha Black Tea",              ml: 600, kcal: 128, sugar: 29, kind: "tea", water: true },
  { name: "迷客夏 青檸香茶",         name_en: "Milksha Lime Tea",               ml: 600, kcal: 209, sugar: 44, fixedSugar: 15,  kind: "tea" },
  { name: "迷客夏 柳丁綠茶",         name_en: "Milksha Orange Green Tea",       ml: 600, kcal: 251, sugar: 52, fixedSugar: 23, kind: "tea" },
  { name: "迷客夏 冬瓜檸檬",         name_en: "Milksha Winter Melon Lemon",     ml: 600, kcal: 364, sugar: 82, fixedSugar: 53, kind: "tea" },
  { name: "迷客夏 焙香大麥拿鐵",     name_en: "Milksha Roasted Barley Latte",   ml: 600, kcal: 169, sugar: 25, kind: "milk" },
  { name: "迷客夏 芋頭鮮奶",         name_en: "Milksha Taro Fresh Milk",        ml: 600, kcal: 343, sugar: 31, fixedSugar: 2, kind: "milk" },
  { name: "迷客夏 大正紅茶拿鐵",     name_en: "Milksha Taisho Black Tea Latte", ml: 600, kcal: 261, sugar: 45, fixedSugar: 16, kind: "milk" },
  { name: "迷客夏 娜杯紅茶拿鐵",     name_en: "Milksha Nabei Black Tea Latte",  ml: 600, kcal: 276, sugar: 49, fixedSugar: 20, kind: "milk" },
  // Platforms list these without pearls — add pearls as a topping
  { name: "迷客夏 伯爵紅茶拿鐵",     name_en: "Milksha Earl Grey Latte",        ml: 600, kcal: 236, sugar: 34, fixedSugar: 5, kind: "milk" },
  { name: "迷客夏 手炒黑糖鮮奶",     name_en: "Milksha Brown Sugar Fresh Milk", ml: 600, kcal: 334, sugar: 41, fixedSugar: 41, kind: "milk" },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "迷客夏 琥珀高峰烏龍", name_en: "Milksha Amber Oolong Tea", ml: 600, kcal: 144, sugar: 33, kind: "tea", water: true },
  { name: "迷客夏 柳丁青茶", name_en: "Milksha Orange Green Tea (Qing)", ml: 600, kcal: 297, sugar: 66, fixedSugar: 37, kind: "tea" },
  { name: "迷客夏 茉香綠茶拿鐵", name_en: "Milksha Jasmine Green Tea Latte", ml: 600, kcal: 243, sugar: 42, fixedSugar: 13, kind: "milk" },
  { name: "迷客夏 琥珀烏龍拿鐵", name_en: "Milksha Amber Oolong Latte", ml: 600, kcal: 242, sugar: 42, fixedSugar: 13, kind: "milk" },
  { name: "迷客夏 珍珠鮮奶", name_en: "Milksha Pearl Fresh Milk", ml: 600, kcal: 486, sugar: 26, fixedSugar: 11, kind: "milk", toppings: ["珍珠"] },
  // ── 可不可熟成紅茶 — official ordering pages (order.ocard.co/kebuke); 胭脂紅茶 is a dietitian figure
  { name: "可不可 熟成紅茶",   name_en: "Kebuke Aged Black Tea",        ml: 700, kcal: 200,   sugar: 50,   kind: "tea", water: true },
  { name: "可不可 麗春紅茶",   name_en: "Kebuke Li-Chun Black Tea",     ml: 700, kcal: 270,   sugar: 65,   kind: "tea", water: true },
  { name: "可不可 春芽綠茶",   name_en: "Kebuke Spring Bud Green Tea",  ml: 700, kcal: 180,   sugar: 45,   kind: "tea", water: true },
  { name: "可不可 胭脂紅茶",   name_en: "Kebuke Rouge Black Tea",       ml: 700, kcal: 200,   sugar: 50,   kind: "tea", water: true },
  { name: "可不可 熟成檸果",   name_en: "Kebuke Aged Tea with Lemon",   ml: 700, kcal: 257,   sugar: 59,   fixedSugar: 9, kind: "tea" },
  { name: "可不可 雪花冷露",   name_en: "Kebuke Snow Cold Dew",         ml: 700, kcal: 233,   sugar: 55,   fixedSugar: 5, kind: "tea" },
  { name: "可不可 熟成歐蕾",   name_en: "Kebuke Aged Tea Au Lait",      ml: 700, kcal: 311,   sugar: 55,   fixedSugar: 5, kind: "milk" },
  { name: "可不可 白玉歐蕾",   name_en: "Kebuke White Pearl Au Lait",   ml: 700, kcal: 492,   sugar: 50, kind: "milk", toppings: ["珍珠"] },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "可不可 熟成冷露", name_en: "Kebuke Aged Tea Cold Dew", ml: 700, kcal: 211, sugar: 52, fixedSugar: 2, kind: "tea" },
  { name: "可不可 春芽冷露", name_en: "Kebuke Spring Bud Cold Dew", ml: 700, kcal: 211, sugar: 52, fixedSugar: 2, kind: "tea" },
  { name: "可不可 金蜜熟成", name_en: "Kebuke Honey Aged Black Tea", ml: 700, kcal: 215, sugar: 49, kind: "tea" },
  { name: "可不可 金蜜檸檬", name_en: "Kebuke Honey Lemon", ml: 700, kcal: 249, sugar: 53, fixedSugar: 3, kind: "tea" },
  { name: "可不可 胭脂多多", name_en: "Kebuke Rouge Black Tea Yakult", ml: 700, kcal: 453, sugar: 105, fixedSugar: 55, kind: "tea" },
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
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "麻古 高山金萱", name_en: "Macu High Mountain Jin Xuan Tea", ml: 700, kcal: 147, sugar: 34, kind: "tea", water: true },
  { name: "麻古 芝芝金萱雙Q", name_en: "Macu Cheese Foam Jin Xuan Double Q", ml: 700, kcal: 510, sugar: 58, fixedSugar: 12, kind: "tea", toppings: ["奶蓋"] },
  { name: "麻古 葡萄柚果粒茶", name_en: "Macu Grapefruit Fruit Tea", ml: 700, kcal: 315, sugar: 71, fixedSugar: 37, kind: "tea" },
  { name: "麻古 翡翠柳橙", name_en: "Macu Jade Green Tea with Orange", ml: 700, kcal: 337, sugar: 75, fixedSugar: 41, kind: "tea" },
  // ── 得正 — menu figures (M/L listed per drink)
  { name: "得正 春烏龍",       name_en: "Oolong Tea Project Spring Oolong", ml: 660, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 輕烏龍",       name_en: "Oolong Tea Project Light Oolong",  ml: 660, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 焙烏龍",       name_en: "Oolong Tea Project Roasted Oolong", ml: 660, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 芝士奶蓋春烏龍", name_en: "Oolong Tea Project Cheese Foam Spring Oolong", ml: 660, kcal: 435, sugar: 49, kind: "tea", toppings: ["奶蓋"] },
  { name: "得正 檸檬春烏龍",   name_en: "Oolong Tea Project Lemon Spring Oolong", ml: 660, kcal: 267, sugar: 58, fixedSugar: 0.5, kind: "tea" },
  { name: "得正 焙烏龍鮮奶",   name_en: "Oolong Tea Project Roasted Oolong Latte", ml: 660, kcal: 409, sugar: 72.6, fixedSugar: 15.1, kind: "milk" },
  { name: "得正 焙烏龍奶茶",   name_en: "Oolong Tea Project Roasted Oolong Milk Tea", ml: 660, kcal: 575.5, sugar: 62.7, fixedSugar: 5.2, kind: "creamer" },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "得正 雙柚金烏龍", name_en: "Oolong Tea Project Double Pomelo Golden Oolong", ml: 660, kcal: 341, sugar: 77, fixedSugar: 19.5, kind: "tea" },
  { name: "得正 香橙春烏龍", name_en: "Oolong Tea Project Orange Spring Oolong", ml: 660, kcal: 389, sugar: 85, fixedSugar: 27.5, kind: "tea" },
  // Added in seed v25 (platform labels / dietitian round-ups) — docs/drinks-research.md §17
  { name: "得正 紅茶", name_en: "Oolong Tea Project Black Tea", ml: 660, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 綠茶", name_en: "Oolong Tea Project Green Tea", ml: 660, kcal: 268, sugar: 57.5, kind: "tea", water: true },
  { name: "得正 緋烏龍", name_en: "Oolong Tea Project Scarlet Oolong", ml: 660, kcal: 176.9, sugar: 43.6, kind: "tea", water: true },
  { name: "得正 青梅春烏龍", name_en: "Oolong Tea Project Green Plum Spring Oolong", ml: 660, kcal: 439, sugar: 96, fixedSugar: 38.5, kind: "tea" },
  { name: "得正 甘蔗春烏龍", name_en: "Oolong Tea Project Sugarcane Spring Oolong", ml: 660, kcal: 317, sugar: 68, fixedSugar: 10.5, kind: "tea" },
  { name: "得正 芝士奶蓋焙烏龍", name_en: "Oolong Tea Project Cheese Foam Roasted Oolong", ml: 660, kcal: 435, sugar: 49, kind: "tea", toppings: ["奶蓋"] },
  { name: "得正 芝士奶蓋緋烏龍", name_en: "Oolong Tea Project Cheese Foam Scarlet Oolong", ml: 660, kcal: 367.6, sugar: 50.8, kind: "tea", toppings: ["奶蓋"] },
  { name: "得正 奶茶", name_en: "Oolong Tea Project Milk Tea", ml: 660, kcal: 575.5, sugar: 62.7, fixedSugar: 5.2, kind: "creamer" },
  { name: "得正 珍珠奶茶", name_en: "Oolong Tea Project Pearl Milk Tea", ml: 660, kcal: 620, sugar: 52.4, kind: "creamer", toppings: ["珍珠"] },
  { name: "得正 黃金珍珠奶綠", name_en: "Oolong Tea Project Golden Pearl Green Milk Tea", ml: 660, kcal: 597, sugar: 51.8, kind: "creamer", toppings: ["珍珠"] },
  { name: "得正 紅茶鮮奶", name_en: "Oolong Tea Project Black Tea Latte", ml: 660, kcal: 409, sugar: 72.6, fixedSugar: 15.1, kind: "milk" },
  { name: "得正 輕烏龍鮮奶", name_en: "Oolong Tea Project Light Oolong Latte", ml: 660, kcal: 409, sugar: 72.6, fixedSugar: 15.1, kind: "milk" },
  { name: "得正 緋烏龍鮮奶", name_en: "Oolong Tea Project Scarlet Oolong Latte", ml: 660, kcal: 305.6, sugar: 58.7, fixedSugar: 1.2, kind: "milk" },
  { name: "得正 陳皮烏龍鮮奶", name_en: "Oolong Tea Project Tangerine Peel Oolong Latte", ml: 660, kcal: 283.1, sugar: 50.8, kind: "milk" },
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
  { name: "大苑子 奶茶",       name_en: "Dayungs Milk Tea",             ml: 700, kcal: 545,   sugar: 69, fixedSugar: 13, kind: "creamer" },
  { name: "大苑子 珍珠奶茶",   name_en: "Dayungs Pearl Milk Tea",       ml: 700, kcal: 704,   sugar: 69, kind: "creamer", toppings: ["珍珠"] },
  { name: "大苑子 許慶良鮮奶茶", name_en: "Dayungs Hsu Ching-Liang Fresh Milk Tea", ml: 700, kcal: 409, sugar: 72, fixedSugar: 16, kind: "milk" },
  { name: "大苑子 許慶良鮮奶冬瓜", name_en: "Dayungs Hsu Ching-Liang Fresh Milk Winter Melon", ml: 700, kcal: 287, sugar: 49, kind: "milk" },
  { name: "大苑子 纖活綠茶",   name_en: "Dayungs Green Tea",            ml: 700, kcal: 154,   sugar: 35,   kind: "tea", water: true },
  { name: "大苑子 古城錫蘭紅茶", name_en: "Dayungs Ceylon Black Tea",    ml: 700, kcal: 264,   sugar: 56,   kind: "tea", water: true },
  { name: "大苑子 愛文翡翠",   name_en: "Dayungs Irwin Mango Jade Tea", ml: 700, kcal: 290,   sugar: 65, fixedSugar: 30,   kind: "tea" },
  { name: "大苑子 火龍果翡翠", name_en: "Dayungs Dragon Fruit Jade Tea", ml: 700, kcal: 248,   sugar: 53, fixedSugar: 8,   kind: "tea", toppings: ["愛玉"] },
  // Added in seed v26 — the chain's own menu (東部 2026), 700 ml; docs/drinks-research.md §18
  { name: "大苑子 黑巢荔枝冰茶", name_en: "Dayungs Black Nest Lychee Iced Tea", ml: 700, kcal: 227, sugar: 54, fixedSugar: 19, kind: "tea" },
  { name: "大苑子 巨峰葡萄芭樂", name_en: "Dayungs Kyoho Grape Guava", ml: 700, kcal: 298, sugar: 65, fixedSugar: 30, kind: "tea" },
  { name: "大苑子 巨峰葡萄冰茶", name_en: "Dayungs Kyoho Grape Iced Tea", ml: 700, kcal: 240, sugar: 55, fixedSugar: 20, kind: "tea" },
  { name: "大苑子 台灣檸檬春烏龍", name_en: "Dayungs Taiwan Lemon Spring Oolong", ml: 700, kcal: 254, sugar: 57, fixedSugar: 22, kind: "tea" },
  { name: "大苑子 鮮搾葡萄柚綠", name_en: "Dayungs Fresh Grapefruit Green Tea", ml: 700, kcal: 288, sugar: 64, fixedSugar: 29, kind: "tea" },
  { name: "大苑子 古早味冬瓜茶", name_en: "Dayungs Old-style Winter Melon Tea", ml: 700, kcal: 233, sugar: 55, fixedSugar: 20, kind: "tea" },
  { name: "大苑子 蘋果醋冰茶", name_en: "Dayungs Apple Vinegar Iced Tea", ml: 700, kcal: 299, sugar: 71, fixedSugar: 36, kind: "tea" },
  { name: "大苑子 百年蜜仙草", name_en: "Dayungs Honey Grass Jelly Tea", ml: 700, kcal: 250, sugar: 53, fixedSugar: 18, kind: "tea" },
  { name: "大苑子 檸檬愛玉", name_en: "Dayungs Lemon Aiyu", ml: 700, kcal: 208, sugar: 47, fixedSugar: 2, kind: "tea", toppings: ["愛玉"] },
  { name: "大苑子 冬瓜檸檬", name_en: "Dayungs Winter Melon Lemon", ml: 700, kcal: 240, sugar: 55, fixedSugar: 20, kind: "tea" },
  { name: "大苑子 冬瓜檸檬奇亞籽", name_en: "Dayungs Winter Melon Lemon Chia", ml: 700, kcal: 201, sugar: 38, fixedSugar: 3, kind: "tea" },
  { name: "大苑子 養樂多綠茶", name_en: "Dayungs Yakult Green Tea", ml: 700, kcal: 273, sugar: 57, fixedSugar: 22, kind: "tea" },
  { name: "大苑子 蘋果多輕飲", name_en: "Dayungs Apple Yakult Drink", ml: 700, kcal: 278, sugar: 61, fixedSugar: 26, kind: "tea" },
  { name: "大苑子 柚美粒", name_en: "Dayungs Pomelo Pulp Drink", ml: 700, kcal: 224, sugar: 49, fixedSugar: 14, kind: "tea" },
  { name: "大苑子 RedBull能量小富士", name_en: "Dayungs Red Bull Fuji Apple", ml: 700, kcal: 50, sugar: 11, kind: "tea" },
  { name: "大苑子 RedBull能量小柳丁", name_en: "Dayungs Red Bull Orange", ml: 700, kcal: 157, sugar: 38, fixedSugar: 3, kind: "tea" },
  { name: "大苑子 RedBull能量小葡丁", name_en: "Dayungs Red Bull Grape & Orange", ml: 700, kcal: 212, sugar: 51, fixedSugar: 16, kind: "tea" },
  { name: "大苑子 RedBull能量大巨峰", name_en: "Dayungs Red Bull Large Kyoho", ml: 700, kcal: 210, sugar: 51, fixedSugar: 16, kind: "tea" },
  { name: "大苑子 RedBull能量小巨峰", name_en: "Dayungs Red Bull Kyoho", ml: 700, kcal: 203, sugar: 49, fixedSugar: 14, kind: "tea" },
  { name: "大苑子 芭樂甜橙", name_en: "Dayungs Guava Orange", ml: 700, kcal: 268, sugar: 58, fixedSugar: 23, kind: "tea" },
  { name: "大苑子 蕃茄梅", name_en: "Dayungs Tomato Plum", ml: 700, kcal: 254, sugar: 54, fixedSugar: 19, kind: "tea" },
  { name: "大苑子 台灣春烏龍", name_en: "Dayungs Taiwan Spring Oolong", ml: 700, kcal: 0, sugar: 0, kind: "tea", water: true },
  { name: "大苑子 文山青茶", name_en: "Dayungs Wenshan Pouchong", ml: 700, kcal: 154, sugar: 35, kind: "tea", water: true },
  { name: "大苑子 百年仙草干茶", name_en: "Dayungs Grass Jelly Herbal Tea", ml: 700, kcal: 240, sugar: 51, fixedSugar: 16, kind: "tea" },
  { name: "大苑子 許慶良珍珠鮮奶茶", name_en: "Dayungs Hsu Ching-Liang Pearl Fresh Milk Tea", ml: 700, kcal: 603, sugar: 72, fixedSugar: 1, kind: "milk", toppings: ["珍珠"] },
  { name: "大苑子 許慶良觀音拿鐵", name_en: "Dayungs Hsu Ching-Liang Tieguanyin Latte", ml: 700, kcal: 409, sugar: 72, fixedSugar: 16, kind: "milk" },
  { name: "大苑子 許慶良奶酪鮮奶茶", name_en: "Dayungs Hsu Ching-Liang Panna Cotta Fresh Milk Tea", ml: 700, kcal: 485, sugar: 77, fixedSugar: 21, kind: "milk" },
  { name: "大苑子 纖活奶綠", name_en: "Dayungs Green Milk Tea", ml: 700, kcal: 545, sugar: 69, fixedSugar: 13, kind: "creamer" },
  { name: "大苑子 冰釀蜜朵朵", name_en: "Dayungs Iced Snow Fungus Honey Drink", ml: 700, kcal: 199, sugar: 52, fixedSugar: 17, kind: "tea" },
  { name: "大苑子 鮮搾蘋果蜜朵朵", name_en: "Dayungs Apple Snow Fungus Drink", ml: 700, kcal: 231, sugar: 63, fixedSugar: 28, kind: "tea" },
  { name: "大苑子 錫蘭紅茶蜜朵朵", name_en: "Dayungs Ceylon Black Tea Snow Fungus Drink", ml: 700, kcal: 210, sugar: 52, kind: "tea" },
  // M-only vegetable juices (500 ml)
  { name: "大苑子 羽衣甘藍5蔬果汁", name_en: "Dayungs Kale 5-Veg Juice", ml: 500, kcal: 97, sugar: 20, kind: "tea", cups: { M: 500 } },
  { name: "大苑子 天天5蔬果汁", name_en: "Dayungs Daily 5-Veg Juice", ml: 500, kcal: 136, sugar: 26, fixedSugar: 1, kind: "tea", cups: { M: 500 } },
  // ── 茶湯會 — platform labels, large = 22 oz cold (~650 ml)
  { name: "茶湯會 四季春",     name_en: "TP Tea Four Seasons Tea",      ml: 650, kcal: 157,   sugar: 36,   kind: "tea", water: true },
  { name: "茶湯會 碳燒鐵觀音", name_en: "TP Tea Charcoal Tieguanyin",   ml: 650, kcal: 178,   sugar: 41,   kind: "tea", water: true },
  { name: "茶湯會 特級翡翠綠", name_en: "TP Tea Premium Jade Green Tea", ml: 650, kcal: 177,  sugar: 41,   kind: "tea", water: true },
  { name: "茶湯會 翡翠拿鐵",   name_en: "TP Tea Jade Latte",            ml: 650, kcal: 295,   sugar: 49, fixedSugar: 8,   kind: "milk" },
  { name: "茶湯會 翡翠檸檬",   name_en: "TP Tea Jade Lemon",            ml: 650, kcal: 334,   sugar: 73,   fixedSugar: 32,  kind: "tea" },
  { name: "茶湯會 觀音拿鐵",   name_en: "TP Tea Tieguanyin Latte",      ml: 650, kcal: 297,   sugar: 49,   fixedSugar: 8, kind: "milk" },
  { name: "茶湯會 鐵觀音奶茶", name_en: "TP Tea Tieguanyin Milk Tea",   ml: 650, kcal: 581,   sugar: 47, fixedSugar: 6,   kind: "creamer" },
  { name: "茶湯會 鐵觀音珍珠奶茶", name_en: "TP Tea Tieguanyin Pearl Milk Tea", ml: 650, kcal: 717, sugar: 42, kind: "creamer", toppings: ["珍珠"] },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "茶湯會 珍珠奶茶", name_en: "TP Tea Pearl Milk Tea", ml: 650, kcal: 793, sugar: 43, kind: "creamer", toppings: ["珍珠"] },
  { name: "茶湯會 冬瓜鐵觀音", name_en: "TP Tea Winter Melon Tieguanyin", ml: 650, kcal: 283, sugar: 54, fixedSugar: 13, kind: "tea" },
  { name: "茶湯會 珍珠冬瓜觀音", name_en: "TP Tea Pearl Winter Melon Tieguanyin", ml: 650, kcal: 437, sugar: 51, kind: "tea", toppings: ["珍珠"] },
  { name: "茶湯會 百香綠茶", name_en: "TP Tea Passion Fruit Green Tea", ml: 650, kcal: 421, sugar: 103, fixedSugar: 62, kind: "tea" },
  // ── 五桐號 — platform labels, large 660 ml. Syrup baseline: its plain teas 老實人紅茶 / 一把青茶
  // (39.5 g). 經典五桐茶 is sold at a fixed sweetness, so it and drinks built on it are all fixed.
  { name: "五桐號 經典五桐茶", name_en: "WooTea Classic Wootong Tea",   ml: 660, kcal: 74.7,  sugar: 16.7, fixedSugar: 16.7, kind: "tea" },
  { name: "五桐號 杏仁凍五桐茶", name_en: "WooTea Almond Jelly Wootong Tea", ml: 660, kcal: 192, sugar: 36, fixedSugar: 36, kind: "tea" },
  // 奶霜 is lighter than the generic 奶蓋 topping (subtracting it leaves more sugar
  // than calories), so the foam stays in the drink's own figures
  { name: "五桐號 烏龍奶霜",   name_en: "WooTea Oolong Cream Foam",     ml: 660, kcal: 303.2, sugar: 41.9, fixedSugar: 2.4, kind: "creamer" },
  { name: "五桐號 蕎麥奶霜",   name_en: "WooTea Buckwheat Cream Foam",  ml: 660, kcal: 320.3, sugar: 46, fixedSugar: 6.5,   kind: "creamer" },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "五桐號 玄米蕎麥", name_en: "WooTea Brown Rice Buckwheat Tea", ml: 660, kcal: 23.6, sugar: 4.6, kind: "tea", water: true },
  { name: "五桐號 五桐奶霜", name_en: "WooTea Wootong Cream Foam", ml: 660, kcal: 191.7, sugar: 16.1, fixedSugar: 16.1, kind: "creamer" },
  { name: "五桐號 玄米蕎麥奶茶", name_en: "WooTea Brown Rice Buckwheat Milk Tea", ml: 660, kcal: 348.6, sugar: 46.9, fixedSugar: 7.4, kind: "creamer" },
  // Added in seed v25 (platform labels / dietitian round-ups) — docs/drinks-research.md §17
  { name: "五桐號 老實人紅茶", name_en: "WooTea Honest Black Tea", ml: 660, kcal: 173.4, sugar: 39.5, kind: "tea", water: true },
  { name: "五桐號 一把青茶", name_en: "WooTea Turquoise Tea", ml: 660, kcal: 171.7, sugar: 39.5, kind: "tea", water: true },
  { name: "五桐號 紅柚青茶凍飲", name_en: "WooTea Grapefruit Green Tea with Jelly", ml: 660, kcal: 277.3, sugar: 65.7, fixedSugar: 26.2, kind: "tea" },
  { name: "五桐號 茉莉奶綠", name_en: "WooTea Jasmine Green Milk Tea", ml: 660, kcal: 420.1, sugar: 45.2, fixedSugar: 5.7, kind: "creamer" },
  { name: "五桐號 杏仁凍奶茶", name_en: "WooTea Almond Jelly Milk Tea", ml: 660, kcal: 293, sugar: 51, fixedSugar: 11.5, kind: "creamer" },
  { name: "五桐號 最完美手沖泰奶", name_en: "WooTea Hand-brewed Thai Milk Tea", ml: 660, kcal: 499.2, sugar: 36.7, kind: "creamer" },
  { name: "五桐號 茉莉奶霜", name_en: "WooTea Jasmine Cream Foam", ml: 660, kcal: 304.6, sugar: 41.9, fixedSugar: 2.4, kind: "creamer" },
  { name: "五桐號 五桐奶霜QQ", name_en: "WooTea Wootong Cream Foam with Taro Balls", ml: 660, kcal: 408.8, sugar: 44.6, fixedSugar: 44.6, kind: "creamer" },
  { name: "五桐號 玄米蕎麥拿鐵", name_en: "WooTea Brown Rice Buckwheat Latte", ml: 660, kcal: 285.2, sugar: 52.5, fixedSugar: 13, kind: "milk" },
  // ── 一沐日 — platform labels at its one 660 ml cup, normal sweetness (the highest)
  { name: "一沐日 島韻紅茶",   name_en: "Yi Mu Ri Island Black Tea",    ml: 660, kcal: 200,   sugar: 48,   kind: "tea", water: true },
  { name: "一沐日 糯米香茶",   name_en: "Yi Mu Ri Glutinous Rice Green Tea", ml: 660, kcal: 200, sugar: 48, kind: "tea", water: true },
  { name: "一沐日 粉粿牡丹紅柚", name_en: "Yi Mu Ri Grapefruit with Fen Guo", ml: 660, kcal: 288, sugar: 63, fixedSugar: 15, kind: "tea" },
  { name: "一沐日 糯香檸檬茶", name_en: "Yi Mu Ri Glutinous Lemon Tea", ml: 660, kcal: 385,   sugar: 87,   fixedSugar: 39,  kind: "tea" },
  { name: "一沐日 粉粿桂花檸檬", name_en: "Yi Mu Ri Osmanthus Lemon with Fen Guo", ml: 660, kcal: 359, sugar: 76, fixedSugar: 76, kind: "tea" },
  { name: "一沐日 奶蓋島韻紅", name_en: "Yi Mu Ri Milk Foam Island Black Tea", ml: 660, kcal: 426, sugar: 38, kind: "tea", toppings: ["奶蓋"] },
  { name: "一沐日 蕎麥鮮奶茶", name_en: "Yi Mu Ri Buckwheat Fresh Milk Tea", ml: 660, kcal: 304, sugar: 50, fixedSugar: 2, kind: "milk" },
  { name: "一沐日 逮丸奶茶",   name_en: "Yi Mu Ri Dai Wan Milk Tea",    ml: 660, kcal: 630,   sugar: 77, fixedSugar: 29,   kind: "creamer" },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "一沐日 粉粿黑糖鮮奶茶", name_en: "Yi Mu Ri Brown Sugar Fresh Milk Tea with Fen Guo", ml: 660, kcal: 480, sugar: 52, fixedSugar: 4, kind: "milk" },
  { name: "一沐日 粉粿黑糖奶茶", name_en: "Yi Mu Ri Brown Sugar Milk Tea with Fen Guo", ml: 660, kcal: 436, sugar: 61, fixedSugar: 13, kind: "creamer" },
  { name: "一沐日 粉粿黑糖檸檬", name_en: "Yi Mu Ri Brown Sugar Lemon with Fen Guo", ml: 660, kcal: 354, sugar: 76, fixedSugar: 28, kind: "tea" },
  { name: "一沐日 粉粿牡丹檸檬", name_en: "Yi Mu Ri Peony Lemon with Fen Guo", ml: 660, kcal: 465, sugar: 93, fixedSugar: 45, kind: "tea" },
  // ── 龜記茗品 — platform labels, cold 660 ml
  { name: "龜記 翡翠綠茶",     name_en: "Guiji Jade Green Tea",         ml: 660, kcal: 212,   sugar: 45,   kind: "tea", water: true },
  { name: "龜記 紅柚翡翠",     name_en: "Guiji Grapefruit Green Tea",   ml: 660, kcal: 285,   sugar: 63,   fixedSugar: 18, kind: "tea" },
  { name: "龜記 阿源楊桃綠茶", name_en: "Guiji Starfruit Green Tea",    ml: 660, kcal: 250,   sugar: 60,   fixedSugar: 15, kind: "tea" },
  { name: "龜記 楊桃雷夢",     name_en: "Guiji Starfruit Lemon",        ml: 660, kcal: 299,   sugar: 68,   fixedSugar: 23, kind: "tea" },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "龜記 三十三茶王", name_en: "Guiji No.33 Tea King", ml: 660, kcal: 182, sugar: 37, kind: "tea", water: true },
  { name: "龜記 青四季春", name_en: "Guiji Four Seasons Tea", ml: 660, kcal: 170, sugar: 38, kind: "tea", water: true },
  { name: "龜記 極品紅茶", name_en: "Guiji Premium Black Tea", ml: 660, kcal: 207, sugar: 46, kind: "tea", water: true },
  { name: "龜記 冬瓜茶王", name_en: "Guiji Winter Melon Tea King", ml: 660, kcal: 198, sugar: 45, kind: "tea" },
  { name: "龜記 冬瓜雷夢", name_en: "Guiji Winter Melon Lemon", ml: 660, kcal: 214, sugar: 48, fixedSugar: 3, kind: "tea" },
  { name: "龜記 柳丁翡翠", name_en: "Guiji Orange Jade Green Tea", ml: 660, kcal: 290, sugar: 60, fixedSugar: 15, kind: "tea" },
  { name: "龜記 紫葡蘆薈春", name_en: "Guiji Grape Aloe Four Seasons Tea", ml: 660, kcal: 286, sugar: 78, fixedSugar: 33, kind: "tea" },
  { name: "龜記 豆漿紅茶", name_en: "Guiji Soy Milk Black Tea", ml: 660, kcal: 259, sugar: 43, kind: "milk" },
  { name: "龜記 碎銀普洱鮮乳", name_en: "Guiji Pu'er Fresh Milk Tea", ml: 660, kcal: 304, sugar: 53, fixedSugar: 8, kind: "milk" },
  { name: "龜記 龜記濃乳茶", name_en: "Guiji Guiji Rich Milk Tea", ml: 660, kcal: 310, sugar: 53, fixedSugar: 8, kind: "milk" },
  { name: "龜記 碎銀普洱奶茶", name_en: "Guiji Pu'er Milk Tea", ml: 660, kcal: 578, sugar: 48, fixedSugar: 3, kind: "creamer" },
  // ── 萬波島嶼紅茶 — platform labels (L)
  { name: "萬波 島嶼紅茶",     name_en: "Wanpo Island Black Tea",       ml: 700, kcal: 246,   sugar: 59,   kind: "tea", water: true },
  { name: "萬波 島嶼檸檬茶王", name_en: "Wanpo Island Lemon Tea King",  ml: 700, kcal: 479,   sugar: 95,   fixedSugar: 36,  kind: "tea" },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "萬波 紫蘇金萱", name_en: "Wanpo Perilla Jin Xuan Tea", ml: 700, kcal: 134, sugar: 31, kind: "tea", water: true },
  { name: "萬波 纖麥茶", name_en: "Wanpo Barley Tea", ml: 700, kcal: 135, sugar: 32, kind: "tea", water: true },
  { name: "萬波 白柚麗雅", name_en: "Wanpo Pomelo Li Ya Tea", ml: 700, kcal: 427, sugar: 92, fixedSugar: 33, kind: "tea" },
  { name: "萬波 金鑽鳳梨麗雅", name_en: "Wanpo Pineapple Li Ya Tea", ml: 700, kcal: 514, sugar: 100, fixedSugar: 41, kind: "tea" },
  { name: "萬波 萬事大桔", name_en: "Wanpo Tangerine Tea", ml: 700, kcal: 471, sugar: 107, fixedSugar: 48, kind: "tea" },
  { name: "萬波 紅蘋島嶼", name_en: "Wanpo Red Apple Island Tea", ml: 700, kcal: 497, sugar: 117, fixedSugar: 58, kind: "tea" },
  { name: "萬波 蔗香煙燻烏梅", name_en: "Wanpo Cane Smoked Plum Drink", ml: 700, kcal: 549, sugar: 124, fixedSugar: 65, kind: "tea" },
  { name: "萬波 萬波奶茶", name_en: "Wanpo Wanpo Milk Tea", ml: 700, kcal: 465, sugar: 54, kind: "creamer" },
  { name: "萬波 波霸奶茶", name_en: "Wanpo Boba Milk Tea", ml: 700, kcal: 725, sugar: 59, kind: "creamer", toppings: ["波霸"] },
  { name: "萬波 麥仔奶茶", name_en: "Wanpo Barley Milk Tea", ml: 700, kcal: 355, sugar: 42, kind: "creamer" },
  { name: "萬波 麗雅那堤", name_en: "Wanpo Li Ya Latte", ml: 700, kcal: 349, sugar: 45, kind: "milk" },
  { name: "萬波 楊枝甘露", name_en: "Wanpo Mango Pomelo Sago", ml: 700, kcal: 717, sugar: 95, fixedSugar: 36, kind: "milk" },
  { name: "萬波 椰芒紫米爽", name_en: "Wanpo Coconut Mango Purple Rice", ml: 700, kcal: 614, sugar: 82, fixedSugar: 23, kind: "milk" },
  // ── 珍煮丹 — platform labels (L); brown-sugar syrup isn't adjusted, so it's all fixed
  { name: "珍煮丹 黑糖鮮奶",   name_en: "Truedan Brown Sugar Fresh Milk", ml: 650, kcal: 364, sugar: 42,   fixedSugar: 42, kind: "milk" },
  { name: "珍煮丹 黑糖珍珠鮮奶", name_en: "Truedan Brown Sugar Pearl Fresh Milk", ml: 650, kcal: 619, sugar: 70, fixedSugar: 70, kind: "milk", toppings: ["珍珠"] },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "珍煮丹 復刻紅茶", name_en: "Truedan Classic Black Tea", ml: 650, kcal: 246, sugar: 55, kind: "tea", water: true },
  { name: "珍煮丹 不知春", name_en: "Truedan Four Seasons Tea", ml: 650, kcal: 236, sugar: 55, kind: "tea", water: true },
  { name: "珍煮丹 梅香檸綠", name_en: "Truedan Plum Lemon Green Tea", ml: 650, kcal: 198, sugar: 41, kind: "tea" },
  { name: "珍煮丹 決明子復刻紅茶鮮奶", name_en: "Truedan Cassia Seed Black Tea Fresh Milk", ml: 650, kcal: 348, sugar: 63, fixedSugar: 8, kind: "milk" },
  { name: "珍煮丹 泰式奶茶", name_en: "Truedan Thai Milk Tea", ml: 650, kcal: 336, sugar: 41, kind: "milk" },
  { name: "珍煮丹 黑糖珍珠厚鮮奶", name_en: "Truedan Brown Sugar Pearl Rich Fresh Milk", ml: 650, kcal: 653, sugar: 67, fixedSugar: 52, kind: "milk", toppings: ["珍珠"] },
  { name: "珍煮丹 黑糖仙草鮮奶", name_en: "Truedan Brown Sugar Grass Jelly Fresh Milk", ml: 650, kcal: 424, sugar: 71, fixedSugar: 71, kind: "milk" },
  { name: "珍煮丹 黑糖粉粿鮮奶", name_en: "Truedan Brown Sugar Fen Guo Fresh Milk", ml: 650, kcal: 437, sugar: 43, fixedSugar: 43, kind: "milk" },
  { name: "珍煮丹 黑糖檸檬", name_en: "Truedan Brown Sugar Lemon", ml: 650, kcal: 287, sugar: 61, fixedSugar: 61, kind: "tea" },
  { name: "珍煮丹 手熬黑糖冬瓜茶", name_en: "Truedan Brown Sugar Winter Melon Tea", ml: 650, kcal: 201, sugar: 48, fixedSugar: 48, kind: "tea" },
  { name: "珍煮丹 黑糖檸檬冬瓜", name_en: "Truedan Brown Sugar Lemon Winter Melon", ml: 650, kcal: 230, sugar: 53, fixedSugar: 53, kind: "tea" },
  // ── 鶴茶樓 — platform labels (one store, L)
  { name: "鶴茶樓 鶴頂紅茶",   name_en: "Hechalou Crane Black Tea",     ml: 660, kcal: 174,   sugar: 41,   kind: "tea", water: true },
  { name: "鶴茶樓 鶴頂那堤",   name_en: "Hechalou Crane Latte",         ml: 660, kcal: 290,   sugar: 49,   fixedSugar: 8, kind: "milk" },
  // Added in seed v24 (dietitian round-ups / platform labels) — docs/drinks-research.md §16
  { name: "鶴茶樓 蘋果鶴頂紅茶", name_en: "Hechalou Apple Crane Black Tea", ml: 660, kcal: 252, sugar: 57, fixedSugar: 16, kind: "tea" },
  { name: "鶴茶樓 紅鶴那堤", name_en: "Hechalou Red Crane Latte", ml: 660, kcal: 284, sugar: 48, fixedSugar: 7, kind: "milk" },
  { name: "鶴茶樓 復刻奶茶", name_en: "Hechalou Classic Milk Tea", ml: 660, kcal: 433, sugar: 49, fixedSugar: 8, kind: "creamer" },
  { name: "鶴茶樓 鶴記鴛鴦凍奶茶", name_en: "Hechalou Yuanyang Jelly Milk Tea", ml: 660, kcal: 485, sugar: 74, fixedSugar: 33, kind: "creamer" },
  // Added in seed v25 (platform labels / dietitian round-ups) — docs/drinks-research.md §17
  { name: "鶴茶樓 舶來紅茶", name_en: "Hechalou Imported Black Tea", ml: 660, kcal: 174, sugar: 41, kind: "tea", water: true },
  { name: "鶴茶樓 藝伎紅茶", name_en: "Hechalou Geisha Black Tea", ml: 660, kcal: 174, sugar: 41, kind: "tea", water: true },
  { name: "鶴茶樓 金萱青茶", name_en: "Hechalou Jin Xuan Tea", ml: 660, kcal: 174, sugar: 41, kind: "tea", water: true },
  { name: "鶴茶樓 桂香烏龍茶", name_en: "Hechalou Osmanthus Oolong Tea", ml: 660, kcal: 174, sugar: 41, kind: "tea", water: true },
  { name: "鶴茶樓 冬瓜菊花粉粿桂香烏龍茶", name_en: "Hechalou Winter Melon Chrysanthemum Osmanthus Oolong with Fen Guo", ml: 660, kcal: 304, sugar: 55, fixedSugar: 14, kind: "tea" },
  { name: "鶴茶樓 舶來那堤", name_en: "Hechalou Imported Black Tea Latte", ml: 660, kcal: 290, sugar: 49, fixedSugar: 8, kind: "milk" },
  { name: "鶴茶樓 藝伎那堤", name_en: "Hechalou Geisha Black Tea Latte", ml: 660, kcal: 290, sugar: 49, fixedSugar: 8, kind: "milk" },
  // ── 有飲 — the shop's own calorie table (全糖, largest cup; M 500 / L 660 ml).
  // Drinks listed in both sizes use the L figure; M-only drinks are based on 500 ml
  // and offer only the M cup. Syrup baseline: its plain teas, 39.2 g per 660 ml.
  // 珍珠鮮奶 has no tea or syrup (its base is about all milk), so its sugar is all fixed.
  // Repeated listings (奶霜 and 椪糖 series under two headings) appear once. docs/drinks-research.md §15.
  { name: "有飲 古早味憨厚紅茶", name_en: "Youin Old-style Black Tea", ml: 660, kcal: 183.6, sugar: 39.2, kind: "tea", water: true },
  { name: "有飲 斯里蘭卡醇紅茶", name_en: "Youin Ceylon Black Tea", ml: 660, kcal: 183.6, sugar: 39.2, kind: "tea", water: true },
  { name: "有飲 尚青四季春茶", name_en: "Youin Four Seasons Tea", ml: 660, kcal: 183.6, sugar: 39.2, kind: "tea", water: true },
  { name: "有飲 醇焙烏龍茶", name_en: "Youin Roasted Oolong Tea", ml: 660, kcal: 183.6, sugar: 39.2, kind: "tea", water: true },
  { name: "有飲 焙香黃金穀物茶", name_en: "Youin Roasted Golden Grain Tea", ml: 660, kcal: 183.6, sugar: 39.2, kind: "tea", water: true },
  { name: "有飲 蜜香檸檬四季春", name_en: "Youin Honey Lemon Four Seasons Tea", ml: 660, kcal: 324.8, sugar: 66.4, fixedSugar: 27.2, kind: "tea" },
  { name: "有飲 多肉鳳梨焙烏龍", name_en: "Youin Pineapple Roasted Oolong", ml: 660, kcal: 324.2, sugar: 66.2, fixedSugar: 27, kind: "tea" },
  { name: "有飲 蜜釀蘋果四季", name_en: "Youin Honey Apple Four Seasons Tea", ml: 660, kcal: 416, sugar: 89, fixedSugar: 49.8, kind: "tea" },
  { name: "有飲 台灣柳丁四季", name_en: "Youin Taiwan Orange Four Seasons Tea", ml: 660, kcal: 291, sugar: 62, fixedSugar: 22.8, kind: "tea" },
  { name: "有飲 炎炎夏日水果茶", name_en: "Youin Summer Fruit Tea", ml: 660, kcal: 338.1, sugar: 69.4, fixedSugar: 30.2, kind: "tea" },
  { name: "有飲 粉紅泡泡草莓優優", name_en: "Youin Strawberry Yogurt Drink", ml: 500, kcal: 232.6, sugar: 22.6, kind: "milk", cups: { M: 500 } },
  { name: "有飲 臉紅紅蘋果優優", name_en: "Youin Apple Yogurt Drink", ml: 500, kcal: 389.5, sugar: 56.7, fixedSugar: 27, kind: "milk", cups: { M: 500 } },
  { name: "有飲 台灣囡仔鳳梨優優", name_en: "Youin Pineapple Yogurt Drink", ml: 500, kcal: 354, sugar: 46.9, fixedSugar: 17.2, kind: "milk", cups: { M: 500 } },
  { name: "有飲 酸甘甜百香果優優", name_en: "Youin Passion Fruit Yogurt Drink", ml: 500, kcal: 343.3, sugar: 42.1, fixedSugar: 12.4, kind: "milk", cups: { M: 500 } },
  { name: "有飲 咔滋咔滋椪糖優優", name_en: "Youin Crunchy Dalgona Yogurt Drink", ml: 500, kcal: 381.3, sugar: 58.5, fixedSugar: 28.8, kind: "milk", cups: { M: 500 } },
  { name: "有飲 古早味憨厚奶茶", name_en: "Youin Old-style Milk Tea", ml: 660, kcal: 440.9, sugar: 46.4, fixedSugar: 7.2, kind: "creamer" },
  { name: "有飲 斯里蘭卡厚奶茶", name_en: "Youin Ceylon Milk Tea", ml: 660, kcal: 440.9, sugar: 46.4, fixedSugar: 7.2, kind: "creamer" },
  { name: "有飲 尚青四季奶茶", name_en: "Youin Four Seasons Milk Tea", ml: 660, kcal: 440.9, sugar: 46.4, fixedSugar: 7.2, kind: "creamer" },
  { name: "有飲 醇焙烏龍奶茶", name_en: "Youin Roasted Oolong Milk Tea", ml: 660, kcal: 440.9, sugar: 46.4, fixedSugar: 7.2, kind: "creamer" },
  { name: "有飲 焙香穀物奶茶", name_en: "Youin Roasted Grain Milk Tea", ml: 660, kcal: 440.9, sugar: 46.4, fixedSugar: 7.2, kind: "creamer" },
  { name: "有飲 珍珠奶茶爆擊", name_en: "Youin Pearl Milk Tea Blast", ml: 660, kcal: 599.9, sugar: 62.1, fixedSugar: 7.9, kind: "creamer", toppings: ["珍珠"] },
  { name: "有飲 小時候ㄟ麵茶奶茶", name_en: "Youin Childhood Mian Cha Milk Tea", ml: 660, kcal: 568.4, sugar: 51.5, fixedSugar: 12.3, kind: "creamer" },
  { name: "有飲 濃萃可可奶茶", name_en: "Youin Rich Cocoa Milk Tea", ml: 660, kcal: 442.3, sugar: 59.8, fixedSugar: 20.6, kind: "creamer" },
  { name: "有飲 玫瑰鹽奶霜紅茶", name_en: "Youin Rose Salt Cream Foam Black Tea", ml: 660, kcal: 382.3, sugar: 45.9, fixedSugar: 6.7, kind: "creamer" },
  { name: "有飲 玫瑰鹽奶霜四季春", name_en: "Youin Rose Salt Cream Foam Four Seasons Tea", ml: 660, kcal: 382.3, sugar: 45.9, fixedSugar: 6.7, kind: "creamer" },
  { name: "有飲 玫瑰鹽奶霜烏龍茶", name_en: "Youin Rose Salt Cream Foam Oolong Tea", ml: 660, kcal: 382.3, sugar: 45.9, fixedSugar: 6.7, kind: "creamer" },
  { name: "有飲 玫瑰鹽奶霜穀物茶", name_en: "Youin Rose Salt Cream Foam Grain Tea", ml: 660, kcal: 382.3, sugar: 45.9, fixedSugar: 6.7, kind: "creamer" },
  { name: "有飲 椪糖奶霜紅茶", name_en: "Youin Dalgona Cream Foam Black Tea", ml: 660, kcal: 486.6, sugar: 71.6, fixedSugar: 32.4, kind: "creamer" },
  { name: "有飲 椪糖奶霜四季春", name_en: "Youin Dalgona Cream Foam Four Seasons Tea", ml: 660, kcal: 486.6, sugar: 71.6, fixedSugar: 32.4, kind: "creamer" },
  { name: "有飲 椪糖奶霜烏龍茶", name_en: "Youin Dalgona Cream Foam Oolong Tea", ml: 660, kcal: 486.6, sugar: 71.6, fixedSugar: 32.4, kind: "creamer" },
  { name: "有飲 椪糖奶霜穀物茶", name_en: "Youin Dalgona Cream Foam Grain Tea", ml: 660, kcal: 486.6, sugar: 71.6, fixedSugar: 32.4, kind: "creamer" },
  { name: "有飲 椪糖風味奶霜紅茶", name_en: "Youin Dalgona-flavour Cream Foam Black Tea", ml: 660, kcal: 398.9, sugar: 65.6, fixedSugar: 26.4, kind: "creamer" },
  { name: "有飲 椪糖風味奶霜四季春", name_en: "Youin Dalgona-flavour Cream Foam Four Seasons Tea", ml: 660, kcal: 398.9, sugar: 65.6, fixedSugar: 26.4, kind: "creamer" },
  { name: "有飲 椪糖風味奶霜烏龍茶", name_en: "Youin Dalgona-flavour Cream Foam Oolong Tea", ml: 660, kcal: 398.9, sugar: 65.6, fixedSugar: 26.4, kind: "creamer" },
  { name: "有飲 椪糖風味奶霜穀物茶", name_en: "Youin Dalgona-flavour Cream Foam Grain Tea", ml: 660, kcal: 398.9, sugar: 65.6, fixedSugar: 26.4, kind: "creamer" },
  { name: "有飲 醇濃可可奶霜", name_en: "Youin Rich Cocoa Cream Foam", ml: 660, kcal: 577.7, sugar: 65.5, fixedSugar: 26.3, kind: "creamer" },
  { name: "有飲 草莓可可奶霜", name_en: "Youin Strawberry Cocoa Cream Foam", ml: 660, kcal: 596.9, sugar: 80.8, fixedSugar: 41.6, kind: "creamer" },
  { name: "有飲 焦香椪糖紅茶", name_en: "Youin Caramel Dalgona Black Tea", ml: 660, kcal: 287.8, sugar: 64.9, fixedSugar: 25.7, kind: "tea" },
  { name: "有飲 焦香椪糖四季春", name_en: "Youin Caramel Dalgona Four Seasons Tea", ml: 660, kcal: 287.8, sugar: 64.9, fixedSugar: 25.7, kind: "tea" },
  { name: "有飲 焦香椪糖烏龍茶", name_en: "Youin Caramel Dalgona Oolong Tea", ml: 660, kcal: 287.8, sugar: 64.9, fixedSugar: 25.7, kind: "tea" },
  { name: "有飲 焦香椪糖穀物茶", name_en: "Youin Caramel Dalgona Grain Tea", ml: 660, kcal: 287.8, sugar: 64.9, fixedSugar: 25.7, kind: "tea" },
  { name: "有飲 焦香椪糖奶茶", name_en: "Youin Caramel Dalgona Milk Tea", ml: 660, kcal: 545.2, sugar: 72.1, fixedSugar: 32.9, kind: "creamer" },
  { name: "有飲 焦香椪糖鮮奶茶", name_en: "Youin Caramel Dalgona Fresh Milk Tea", ml: 660, kcal: 274.2, sugar: 37.2, kind: "milk" },
  { name: "有飲 椪糖粿鮮奶茶", name_en: "Youin Dalgona Rice Cake Fresh Milk Tea", ml: 660, kcal: 352.4, sugar: 60.4, kind: "milk", toppings: ["椪糖Q粿"] },
  { name: "有飲 椪糖凍鮮奶茶", name_en: "Youin Dalgona Jelly Fresh Milk Tea", ml: 660, kcal: 324.5, sugar: 55.6, kind: "milk", toppings: ["椪糖凍"] },
  { name: "有飲 椪糖冰淇淋紅茶", name_en: "Youin Dalgona Ice Cream Black Tea", ml: 660, kcal: 367.3, sugar: 67.3, fixedSugar: 28.1, kind: "creamer" },
  { name: "有飲 椪糖冰淇淋四季春", name_en: "Youin Dalgona Ice Cream Four Seasons Tea", ml: 660, kcal: 367.3, sugar: 67.3, fixedSugar: 28.1, kind: "creamer" },
  { name: "有飲 椪糖冰淇淋烏龍茶", name_en: "Youin Dalgona Ice Cream Oolong Tea", ml: 660, kcal: 367.3, sugar: 67.3, fixedSugar: 28.1, kind: "creamer" },
  { name: "有飲 椪糖冰淇淋穀物茶", name_en: "Youin Dalgona Ice Cream Grain Tea", ml: 660, kcal: 367.3, sugar: 67.3, fixedSugar: 28.1, kind: "creamer" },
  { name: "有飲 憨厚紅茶鮮奶茶", name_en: "Youin Old-style Black Tea Fresh Milk Tea", ml: 660, kcal: 319.6, sugar: 48.4, fixedSugar: 9.2, kind: "milk" },
  { name: "有飲 斯里蘭卡鮮奶茶", name_en: "Youin Ceylon Fresh Milk Tea", ml: 660, kcal: 319.6, sugar: 48.4, fixedSugar: 9.2, kind: "milk" },
  { name: "有飲 尚青四季鮮奶茶", name_en: "Youin Four Seasons Fresh Milk Tea", ml: 660, kcal: 319.6, sugar: 48.4, fixedSugar: 9.2, kind: "milk" },
  { name: "有飲 醇焙烏龍鮮奶茶", name_en: "Youin Roasted Oolong Fresh Milk Tea", ml: 660, kcal: 319.6, sugar: 48.4, fixedSugar: 9.2, kind: "milk" },
  { name: "有飲 焙香穀物鮮奶茶", name_en: "Youin Roasted Grain Fresh Milk Tea", ml: 660, kcal: 319.6, sugar: 48.4, fixedSugar: 9.2, kind: "milk" },
  { name: "有飲 黑糖珍珠鮮奶茶", name_en: "Youin Brown Sugar Pearl Fresh Milk Tea", ml: 660, kcal: 395.4, sugar: 54.9, fixedSugar: 0.7, kind: "milk", toppings: ["珍珠"] },
  { name: "有飲 醇濃可可鮮奶", name_en: "Youin Rich Cocoa Fresh Milk", ml: 660, kcal: 524.4, sugar: 69.7, fixedSugar: 30.5, kind: "milk" },
  { name: "有飲 草莓可可鮮奶", name_en: "Youin Strawberry Cocoa Fresh Milk", ml: 500, kcal: 449.9, sugar: 74.5, fixedSugar: 44.8, kind: "milk", cups: { M: 500 } },
  { name: "有飲 燕麥可可鮮奶", name_en: "Youin Oat Cocoa Fresh Milk", ml: 500, kcal: 312.3, sugar: 31.8, fixedSugar: 2.1, kind: "milk", cups: { M: 500 } },
  { name: "有飲 珍珠鮮奶", name_en: "Youin Pearl Fresh Milk", ml: 500, kcal: 299.4, sugar: 23.2, fixedSugar: 8.2, kind: "milk", toppings: ["珍珠"], cups: { M: 500 } },
];

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Builtin drinks renamed or dropped since an earlier seed; removed when nothing references them. */
export const RETIRED_DRINKS = [
  "清心福全 蜜香奶茶",  // the 2026 標示表 calls it 蜂蜜奶茶 again
  "清心福全 珍珠蜜香鮮奶普洱", // likewise 珍珠蜂蜜鮮奶普洱
  "迷客夏 珍珠伯爵紅茶拿鐵", // platforms label 伯爵紅茶拿鐵 without pearls
  "迷客夏 珍珠手炒黑糖鮮奶", // likewise 手炒黑糖鮮奶
];

export interface SeedDrink extends SeedFood {
  /** Chain the drink is from — every drink name is "<brand> <item>". */
  brand: string;
  /** JSON of the chain's cup volumes, from BRAND_CUPS. */
  cup_sizes: string | null;
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
  const m = estimateDrinkMacros(kcal, sugar, d.kind);
  return {
    food_name: d.name, name_en: d.name_en, brand: d.name.split(" ")[0],
    cup_sizes: d.cups ? JSON.stringify(d.cups)
      : BRAND_CUPS[d.name.split(" ")[0]] ? JSON.stringify(BRAND_CUPS[d.name.split(" ")[0]]) : null,
    protein_g: r1(m.p), carbohydrates_g: r1(m.c), fat_g: r1(m.f), calories_kcal: r1(kcal),
    base_quantity: d.ml, base_unit: "ml", category: "飲料",
    counts_as_water: d.water ?? false,
    sugar_g: r1(sugar),
    sugar_fixed_g: Math.min(r1(sugar), d.fixedSugar ?? 0),
    default_toppings: d.toppings ?? [],
  };
});
