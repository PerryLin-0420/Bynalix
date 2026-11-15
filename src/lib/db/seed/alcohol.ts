/**
 * Built-in alcoholic drinks, by type (no brands), per 100 ml.
 *
 * Alcohol comes from a typical ABV: g = 100 ml × ABV% × 0.789. Carbs / protein
 * are USDA FoodData Central (beer, wine, spirits, liqueur) or Japan's food
 * composition tables (sake, shochu, umeshu); cocktails are worked out from a
 * standard recipe without ice. Calories = alcohol × 7 + (protein + carbs) × 4
 * + fat × 9. Sources and choices: docs/drinks-research.md §20.
 */

import { alcoholGrams, type ServingKind } from "@/lib/alcohol";
import type { SeedFood } from "./foods";

interface AlcoholSpec {
  name: string; name_en: string;
  /** Typical alcohol by volume, %. */
  abv: number;
  carbs: number; protein?: number; fat?: number;
  serving: ServingKind;
}

const ALCOHOL: AlcoholSpec[] = [
  // ── 啤酒 (a can is 330 ml, a Taiwanese bottle 600 ml)
  { name: "啤酒",           name_en: "Beer",                   abv: 5,    carbs: 3.6, protein: 0.5, serving: "beer" },
  { name: "淡啤酒",         name_en: "Light Beer",             abv: 4.2,  carbs: 1.6, protein: 0.2, serving: "beer" },
  { name: "小麥啤酒",       name_en: "Wheat Beer",             abv: 5,    carbs: 4.5, protein: 0.6, serving: "beer" },
  { name: "黑啤酒",         name_en: "Stout / Dark Beer",      abv: 5,    carbs: 4.5, protein: 0.4, serving: "beer" },
  { name: "精釀啤酒（IPA）", name_en: "Craft Beer (IPA)",       abv: 6.5,  carbs: 5,   protein: 0.6, serving: "beer" },
  { name: "無酒精啤酒",     name_en: "Non-alcoholic Beer",     abv: 0.5,  carbs: 5,   protein: 0.2, serving: "beer" },
  // ── 葡萄酒
  { name: "紅酒",           name_en: "Red Wine",               abv: 13.5, carbs: 2.6, protein: 0.1, serving: "wine" },
  { name: "白酒（白葡萄酒）", name_en: "White Wine",           abv: 12,   carbs: 2.6, protein: 0.1, serving: "wine" },
  { name: "粉紅酒",         name_en: "Rosé Wine",              abv: 12,   carbs: 3.8, protein: 0.1, serving: "wine" },
  { name: "氣泡酒（香檳）",  name_en: "Sparkling Wine (Champagne)", abv: 12, carbs: 2.5, protein: 0.1, serving: "wine" },
  { name: "甜白酒（甜點酒）", name_en: "Dessert Wine",         abv: 15,   carbs: 13.7, protein: 0.2, serving: "liqueur" },
  // ── 東亞酒類
  { name: "清酒",           name_en: "Sake",                   abv: 15,   carbs: 4.9, protein: 0.4, serving: "sake" },
  { name: "燒酎（日本燒酒）", name_en: "Shochu",               abv: 25,   carbs: 0,   serving: "spirit" },
  { name: "韓國燒酒",       name_en: "Soju",                   abv: 16.5, carbs: 2,   serving: "soju" },
  { name: "梅酒",           name_en: "Umeshu (Plum Wine)",     abv: 12,   carbs: 20.7, protein: 0.1, serving: "liqueur" },
  { name: "高粱酒（58 度）", name_en: "Kaoliang Liquor (58%)",  abv: 58,   carbs: 0,   serving: "spirit" },
  { name: "高粱酒（38 度）", name_en: "Kaoliang Liquor (38%)",  abv: 38,   carbs: 0,   serving: "spirit" },
  { name: "紹興酒",         name_en: "Shaoxing Wine",          abv: 15,   carbs: 3,   protein: 0.5, serving: "rice" },
  { name: "米酒（19.5 度）", name_en: "Rice Wine (19.5%)",      abv: 19.5, carbs: 0,   serving: "rice" },
  // ── 烈酒 (40% unless noted)
  { name: "威士忌",         name_en: "Whisky",                 abv: 40,   carbs: 0,   serving: "spirit" },
  { name: "白蘭地",         name_en: "Brandy",                 abv: 40,   carbs: 0,   serving: "spirit" },
  { name: "伏特加",         name_en: "Vodka",                  abv: 40,   carbs: 0,   serving: "spirit" },
  { name: "琴酒",           name_en: "Gin",                    abv: 40,   carbs: 0,   serving: "spirit" },
  { name: "蘭姆酒",         name_en: "Rum",                    abv: 40,   carbs: 0,   serving: "spirit" },
  { name: "龍舌蘭",         name_en: "Tequila",                abv: 40,   carbs: 0,   serving: "spirit" },
  { name: "香甜酒（利口酒）", name_en: "Liqueur",               abv: 25,   carbs: 35,  serving: "liqueur" },
  // ── 調酒 (recipe, no ice) — named in the original, as bars list them
  { name: "Whisky Highball",     name_en: "Whisky Highball",        abv: 7,    carbs: 0,   serving: "cocktail" },
  { name: "Gin and Tonic",         name_en: "Gin and Tonic",          abv: 9,    carbs: 7,   serving: "cocktail" },
  { name: "Screwdriver",       name_en: "Screwdriver",            abv: 11,   carbs: 7.6, protein: 0.5, serving: "cocktail" },
  { name: "Mojito",         name_en: "Mojito",                 abv: 12,   carbs: 9.3, serving: "cocktail" },
  { name: "Margarita",       name_en: "Margarita",              abv: 26,   carbs: 6,   serving: "cocktail" },
  { name: "Long Island Iced Tea",       name_en: "Long Island Iced Tea",   abv: 21,   carbs: 9.8, serving: "cocktail" },
  { name: "罐裝調酒（水果風味）", name_en: "Canned Fruit Cocktail (RTD)", abv: 4.5, carbs: 8, serving: "rtd" },
];

// Two decimals, so the ABV read back from it stays exact (31.56 g → 40.0%)
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface SeedAlcohol extends SeedFood {
  alcohol_g: number;
  serving: ServingKind;
}

export const SEED_ALCOHOL: SeedAlcohol[] = ALCOHOL.map(a => {
  const alc = alcoholGrams(100, a.abv);
  const p = a.protein ?? 0, f = a.fat ?? 0;
  return {
    food_name: a.name, name_en: a.name_en,
    protein_g: p, carbohydrates_g: a.carbs, fat_g: f,
    calories_kcal: Math.round(alc * 7 + (p + a.carbs) * 4 + f * 9),
    base_quantity: 100, base_unit: "ml", category: "酒類",
    alcohol_g: r2(alc), serving: a.serving,
  };
});

/** Serving shortcuts of each built-in drink, by name. */
export const ALCOHOL_SERVING_BY_NAME = new Map(SEED_ALCOHOL.map(a => [a.food_name, a.serving]));
