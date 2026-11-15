/**
 * Built-in alcoholic drinks, by type (no brands), per 100 ml.
 *
 * Alcohol comes from a typical ABV: g = 100 ml × ABV% × 0.789. Carbs / protein
 * are USDA FoodData Central (beer, wine, spirits, liqueur) or Japan's food
 * composition tables (sake, shochu, umeshu). Cocktails are summed from their
 * recipe (IBA official specs, else the common bar spec), ingredient by
 * ingredient, including the melt from shaking / stirring. Calories = alcohol
 * × 7 + (protein + carbs) × 4 + fat × 9. Sources: docs/drinks-research.md §20–21.
 */

import { ETHANOL_G_PER_ML, SERVINGS, alcoholGrams, type Serving, type ServingKind } from "@/lib/alcohol";
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
  { name: "罐裝調酒（水果風味）", name_en: "Canned Fruit Cocktail (RTD)", abv: 4.5, carbs: 8, serving: "rtd" },
];


// ── Cocktails ────────────────────────────────────────────────────────────────

/** Per ml: ABV %, carbs (≈ sugar) g, protein g, fat g; fizz = topped up after shaking. */
interface Ingredient { abv?: number; c?: number; p?: number; f?: number; fizz?: boolean }
const I = {
  spirit:   { abv: 40 },              // gin, vodka, rum, tequila, whisky, brandy, cachaça, pisco, mezcal
  bitters:  { abv: 45 },
  overproof:{ abv: 75 },
  absinthe: { abv: 60 },
  triple:   { abv: 40, c: 0.25 },     // triple sec / orange curaçao / Cointreau
  maraschino:{ abv: 32, c: 0.35 },
  violette: { abv: 20, c: 0.35 },
  apricot:  { abv: 25, c: 0.30 },
  cacao:    { abv: 25, c: 0.35 },
  menthe:   { abv: 25, c: 0.40 },
  cassis:   { abv: 15, c: 0.40 },
  coffeeLiq:{ abv: 20, c: 0.45 },
  amaretto: { abv: 24, c: 0.40 },
  galliano: { abv: 30, c: 0.30 },
  drambuie: { abv: 40, c: 0.30 },
  benedictine:{ abv: 40, c: 0.32 },
  chartreuseG:{ abv: 55, c: 0.25 },
  chartreuseY:{ abv: 40, c: 0.30 },
  campari:  { abv: 25, c: 0.24 },
  aperol:   { abv: 11, c: 0.25 },
  amaro:    { abv: 35, c: 0.15 },     // Amaro Nonino
  fernet:   { abv: 39, c: 0.08 },
  peachSchnapps:{ abv: 20, c: 0.25 },
  cherryLiq:{ abv: 24, c: 0.30 },
  mure:     { abv: 16, c: 0.40 },     // crème de mûre
  irishCream:{ abv: 17, c: 0.20, p: 0.03, f: 0.15 },
  blueCuracao:{ abv: 25, c: 0.30 },
  falernum: { abv: 11, c: 0.40 },
  sweetVermouth:{ abv: 16, c: 0.13 },
  dryVermouth:{ abv: 18, c: 0.03 },
  lillet:   { abv: 17, c: 0.10 },
  port:     { abv: 20, c: 0.10 },
  whiteWine:{ abv: 12, c: 0.026 },
  sparkling:{ abv: 11.5, c: 0.015, fizz: true },
  simple:   { c: 0.60 },              // 1:1 syrup; a sugar cube ≈ 7 ml
  honey:    { c: 0.55 },              // honey / agave / honey-ginger syrup
  grenadine:{ c: 0.60 },
  orgeat:   { c: 0.60, f: 0.02 },
  citrus:   { c: 0.08 },              // lime / lemon juice
  orange:   { c: 0.104, p: 0.007 },
  pineapple:{ c: 0.13, p: 0.004 },
  cranberry:{ c: 0.12 },
  grapefruit:{ c: 0.09 },
  tomato:   { c: 0.035, p: 0.008 },
  peach:    { c: 0.12, p: 0.006 },
  coconutCream:{ c: 0.55, f: 0.12, p: 0.01 },
  cream:    { c: 0.03, p: 0.02, f: 0.36 },
  eggWhite: { p: 0.11 },
  eggYolk:  { p: 0.16, f: 0.27 },
  sourMix:  { c: 0.20 },
  coffee:   {},
  soda:     { fizz: true },
  tonic:    { c: 0.09, fizz: true },
  cola:     { c: 0.106, fizz: true },
  gingerBeer:{ c: 0.09, fizz: true },
  gingerAle:{ c: 0.085, fizz: true },
  grapefruitSoda:{ c: 0.09, fizz: true },
} satisfies Record<string, Ingredient>;
type Ing = keyof typeof I;

/** S shaken (+25 % melt), St stirred (+20 %), B built / blended (none) — melt on the still part only. */
type Method = "S" | "St" | "B";
const MELT: Record<Method, number> = { S: 0.25, St: 0.20, B: 0 };

const COCKTAILS: [name: string, method: Method, recipe: [Ing, number][]][] = [
  // IBA — The Unforgettables
  ["Alexander", "S", [["spirit", 30], ["cacao", 30], ["cream", 30]]],
  ["Americano", "B", [["campari", 30], ["sweetVermouth", 30], ["soda", 60]]],
  ["Angel Face", "S", [["spirit", 60], ["apricot", 30]]],
  ["Aviation", "S", [["spirit", 45], ["maraschino", 15], ["citrus", 15], ["violette", 5]]],
  ["Between the Sheets", "S", [["spirit", 60], ["triple", 30], ["citrus", 20]]],
  ["Boulevardier", "St", [["spirit", 45], ["campari", 30], ["sweetVermouth", 30]]],
  ["Brandy Crusta", "S", [["spirit", 52.5], ["maraschino", 7.5], ["triple", 7.5], ["citrus", 15], ["simple", 7.5], ["bitters", 2]]],
  ["Casino", "S", [["spirit", 40], ["maraschino", 10], ["bitters", 10], ["citrus", 10]]],
  ["Clover Club", "S", [["spirit", 45], ["grenadine", 15], ["citrus", 15], ["eggWhite", 20]]],
  ["Daiquiri", "S", [["spirit", 60], ["citrus", 20], ["simple", 15]]],
  ["Dry Martini", "St", [["spirit", 60], ["dryVermouth", 10]]],
  ["Gin Fizz", "S", [["spirit", 45], ["citrus", 30], ["simple", 10], ["soda", 60]]],
  ["Hanky Panky", "St", [["spirit", 45], ["sweetVermouth", 45], ["fernet", 7.5]]],
  ["Last Word", "S", [["spirit", 22.5], ["chartreuseG", 22.5], ["maraschino", 22.5], ["citrus", 22.5]]],
  ["Manhattan", "St", [["spirit", 50], ["sweetVermouth", 20], ["bitters", 1]]],
  ["Martinez", "St", [["spirit", 45], ["sweetVermouth", 45], ["maraschino", 5], ["bitters", 2]]],
  ["Mary Pickford", "S", [["spirit", 60], ["pineapple", 60], ["maraschino", 10], ["grenadine", 5]]],
  ["Monkey Gland", "S", [["spirit", 50], ["orange", 30], ["grenadine", 5], ["absinthe", 1]]],
  ["Negroni", "St", [["spirit", 30], ["campari", 30], ["sweetVermouth", 30]]],
  ["Old Fashioned", "St", [["spirit", 45], ["simple", 7], ["bitters", 2]]],
  ["Paradise", "S", [["spirit", 35], ["apricot", 20], ["orange", 15]]],
  ["Planter's Punch", "S", [["spirit", 45], ["orange", 35], ["pineapple", 35], ["citrus", 20], ["grenadine", 10], ["simple", 10]]],
  ["Porto Flip", "S", [["spirit", 15], ["port", 45], ["eggYolk", 10]]],
  ["Ramos Fizz", "S", [["spirit", 45], ["cream", 60], ["citrus", 30], ["simple", 30], ["eggWhite", 30], ["soda", 60]]],
  ["Rusty Nail", "St", [["spirit", 45], ["drambuie", 25]]],
  ["Sazerac", "St", [["spirit", 50], ["simple", 7], ["absinthe", 2], ["bitters", 2]]],
  ["Sidecar", "S", [["spirit", 50], ["triple", 20], ["citrus", 20]]],
  ["Stinger", "St", [["spirit", 50], ["menthe", 20]]],
  ["Tuxedo", "St", [["spirit", 30], ["dryVermouth", 30], ["maraschino", 2.5], ["absinthe", 1], ["bitters", 2]]],
  ["Vieux Carré", "St", [["spirit", 60], ["sweetVermouth", 30], ["benedictine", 5], ["bitters", 2]]],
  ["Whiskey Sour", "S", [["spirit", 45], ["citrus", 25], ["simple", 20], ["eggWhite", 20]]],
  ["White Lady", "S", [["spirit", 40], ["triple", 30], ["citrus", 20]]],
  // IBA — Contemporary Classics
  ["Bellini", "B", [["sparkling", 100], ["peach", 50]]],
  ["Black Russian", "St", [["spirit", 50], ["coffeeLiq", 20]]],
  ["Bloody Mary", "B", [["spirit", 45], ["tomato", 90], ["citrus", 15]]],
  ["Caipirinha", "B", [["spirit", 60], ["citrus", 20], ["simple", 13]]],
  ["Champagne Cocktail", "B", [["sparkling", 90], ["spirit", 10], ["simple", 7], ["bitters", 2]]],
  ["Corpse Reviver #2", "S", [["spirit", 30], ["triple", 30], ["lillet", 30], ["citrus", 30], ["absinthe", 1]]],
  ["Cosmopolitan", "S", [["spirit", 40], ["triple", 15], ["citrus", 15], ["cranberry", 30]]],
  ["Cuba Libre", "B", [["spirit", 50], ["cola", 120], ["citrus", 10]]],
  ["French 75", "S", [["spirit", 30], ["citrus", 15], ["simple", 15], ["sparkling", 60]]],
  ["French Connection", "St", [["spirit", 35], ["amaretto", 35]]],
  ["Golden Dream", "S", [["galliano", 20], ["triple", 20], ["orange", 20], ["cream", 10]]],
  ["Grasshopper", "S", [["menthe", 20], ["cacao", 20], ["cream", 20]]],
  ["Hemingway Special", "S", [["spirit", 60], ["grapefruit", 40], ["maraschino", 15], ["citrus", 15]]],
  ["Horse's Neck", "B", [["spirit", 40], ["gingerAle", 120], ["bitters", 2]]],
  ["Irish Coffee", "B", [["spirit", 50], ["coffee", 120], ["cream", 50], ["simple", 8]]],
  ["Kir", "B", [["whiteWine", 90], ["cassis", 10]]],
  ["Long Island Iced Tea", "S", [["spirit", 60], ["triple", 15], ["citrus", 25], ["simple", 30], ["cola", 30]]],
  ["Mai Tai", "S", [["spirit", 60], ["triple", 15], ["orgeat", 15], ["citrus", 30], ["simple", 7.5]]],
  ["Margarita", "S", [["spirit", 50], ["triple", 20], ["citrus", 15]]],
  ["Mimosa", "B", [["sparkling", 75], ["orange", 75]]],
  ["Mint Julep", "St", [["spirit", 60], ["simple", 8]]],
  ["Mojito", "B", [["spirit", 45], ["citrus", 20], ["simple", 15], ["soda", 60]]],
  ["Moscow Mule", "B", [["spirit", 45], ["gingerBeer", 120], ["citrus", 10]]],
  ["Piña Colada", "B", [["spirit", 50], ["coconutCream", 30], ["pineapple", 50]]],
  ["Pisco Sour", "S", [["spirit", 60], ["citrus", 30], ["simple", 20], ["eggWhite", 20]]],
  ["Sea Breeze", "B", [["spirit", 40], ["cranberry", 120], ["grapefruit", 30]]],
  ["Sex on the Beach", "B", [["spirit", 40], ["peachSchnapps", 20], ["orange", 40], ["cranberry", 40]]],
  ["Singapore Sling", "S", [["spirit", 30], ["cherryLiq", 15], ["triple", 7.5], ["benedictine", 7.5], ["pineapple", 120], ["citrus", 15], ["grenadine", 10], ["bitters", 1]]],
  ["Tequila Sunrise", "B", [["spirit", 45], ["orange", 90], ["grenadine", 15]]],
  ["Vesper", "S", [["spirit", 60], ["lillet", 7.5]]],
  ["Zombie", "S", [["spirit", 90], ["overproof", 15], ["falernum", 15], ["citrus", 20], ["grapefruit", 15], ["grenadine", 5], ["absinthe", 1], ["bitters", 1]]],
  // IBA — New Era
  ["Aperol Spritz", "B", [["sparkling", 90], ["aperol", 60], ["soda", 30]]],
  ["Bee's Knees", "S", [["spirit", 52.5], ["citrus", 22.5], ["honey", 22.5]]],
  ["Bramble", "B", [["spirit", 40], ["citrus", 15], ["simple", 10], ["mure", 15]]],
  ["Dark 'n' Stormy", "B", [["spirit", 60], ["gingerBeer", 100]]],
  ["Espresso Martini", "S", [["spirit", 50], ["coffeeLiq", 10], ["simple", 10], ["coffee", 30]]],
  ["Garibaldi", "B", [["campari", 50], ["orange", 120]]],
  ["Gin Basil Smash", "S", [["spirit", 60], ["citrus", 20], ["simple", 15]]],
  ["Kir Royal", "B", [["sparkling", 90], ["cassis", 10]]],
  ["Lemon Drop Martini", "S", [["spirit", 25], ["triple", 20], ["citrus", 15]]],
  ["Naked and Famous", "S", [["spirit", 22.5], ["chartreuseY", 22.5], ["aperol", 22.5], ["citrus", 22.5]]],
  ["Paloma", "B", [["spirit", 50], ["citrus", 5], ["grapefruitSoda", 100]]],
  ["Paper Plane", "S", [["spirit", 30], ["aperol", 30], ["amaro", 30], ["citrus", 30]]],
  ["Penicillin", "S", [["spirit", 67.5], ["citrus", 22.5], ["honey", 22.5]]],
  ["Russian Spring Punch", "S", [["spirit", 25], ["cassis", 15], ["citrus", 25], ["simple", 10], ["sparkling", 60]]],
  ["Southside", "S", [["spirit", 60], ["citrus", 30], ["simple", 15]]],
  ["Tommy's Margarita", "S", [["spirit", 60], ["citrus", 30], ["honey", 15]]],
  // Other classics
  ["Amaretto Sour", "S", [["amaretto", 45], ["citrus", 30], ["simple", 10], ["eggWhite", 15]]],
  ["B-52", "B", [["coffeeLiq", 20], ["irishCream", 20], ["triple", 20]]],
  ["Blue Hawaii", "B", [["spirit", 45], ["blueCuracao", 15], ["pineapple", 90], ["sourMix", 30]]],
  ["Death in the Afternoon", "B", [["absinthe", 30], ["sparkling", 120]]],
  ["Gimlet", "S", [["spirit", 60], ["citrus", 15], ["simple", 15]]],
  ["Gin and Tonic", "B", [["spirit", 45], ["tonic", 150]]],
  ["Godfather", "St", [["spirit", 35], ["amaretto", 35]]],
  ["Harvey Wallbanger", "B", [["spirit", 45], ["orange", 90], ["galliano", 15]]],
  ["Hurricane", "S", [["spirit", 100], ["simple", 30], ["orange", 30], ["citrus", 15], ["grenadine", 7.5]]],
  ["Kamikaze", "S", [["spirit", 30], ["triple", 30], ["citrus", 30]]],
  ["Mudslide", "S", [["spirit", 30], ["coffeeLiq", 30], ["irishCream", 30]]],
  ["Rob Roy", "St", [["spirit", 50], ["sweetVermouth", 20], ["bitters", 1]]],
  ["Salty Dog", "B", [["spirit", 45], ["grapefruit", 120]]],
  ["Screwdriver", "B", [["spirit", 45], ["orange", 120]]],
  ["Tom Collins", "B", [["spirit", 45], ["citrus", 30], ["simple", 15], ["soda", 60]]],
  ["White Russian", "B", [["spirit", 50], ["coffeeLiq", 20], ["cream", 30]]],
  ["Whisky Highball", "B", [["spirit", 45], ["soda", 150]]],
];

/** A cocktail's totals and its glass (ml, melt included), summed from the recipe. */
function cocktailFrom(recipe: [Ing, number][], method: Method) {
  let alc = 0, c = 0, p = 0, f = 0, still = 0, fizz = 0;
  for (const [k, ml] of recipe) {
    const g: Ingredient = I[k];
    alc += ml * (g.abv ?? 0) / 100 * ETHANOL_G_PER_ML;
    c += ml * (g.c ?? 0); p += ml * (g.p ?? 0); f += ml * (g.f ?? 0);
    if (g.fizz) fizz += ml; else still += ml;
  }
  const glass = still * (1 + MELT[method]) + fizz;
  return { alc, c, p, f, glass };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
// Two decimals, so the ABV read back from it stays exact (31.56 g → 40.0%)
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface SeedAlcohol extends SeedFood {
  alcohol_g: number;
  /** Serving shortcuts the drink opens on. */
  servings: Serving[];
}

export interface SeedCocktail { name: string; method: Method; glass: number; abv: number; kcal: number }
export const COCKTAIL_TABLE: SeedCocktail[] = [];

export const SEED_ALCOHOL: SeedAlcohol[] = [
  ...ALCOHOL.map(a => {
    const alc = alcoholGrams(100, a.abv);
    const p = a.protein ?? 0, f = a.fat ?? 0;
    return {
      food_name: a.name, name_en: a.name_en,
      protein_g: p, carbohydrates_g: a.carbs, fat_g: f,
      calories_kcal: Math.round(alc * 7 + (p + a.carbs) * 4 + f * 9),
      base_quantity: 100, base_unit: "ml", category: "酒類",
      alcohol_g: r2(alc), servings: SERVINGS[a.serving],
    };
  }),
  ...COCKTAILS.map(([name, method, recipe]) => {
    const t = cocktailFrom(recipe, method);
    const k = 100 / t.glass;   // per 100 ml
    const glass = Math.round(t.glass / 5) * 5;
    const kcal = t.alc * 7 + (t.c + t.p) * 4 + t.f * 9;
    COCKTAIL_TABLE.push({ name, method, glass, abv: r1(t.alc / ETHANOL_G_PER_ML / t.glass * 100), kcal: Math.round(kcal) });
    return {
      food_name: name, name_en: name,
      protein_g: r1(t.p * k), carbohydrates_g: r1(t.c * k), fat_g: r1(t.f * k),
      calories_kcal: Math.round(kcal * k),
      base_quantity: 100, base_unit: "ml", category: "酒類",
      alcohol_g: r2(t.alc * k),
      servings: [{ zh: "一杯", en: "Glass", ml: glass }, { zh: "兩杯", en: "Two", ml: glass * 2 }],
    };
  }),
];

/** Serving shortcuts of each built-in drink, by name. */
export const ALCOHOL_SERVINGS_BY_NAME = new Map(SEED_ALCOHOL.map(a => [a.food_name, a.servings]));
