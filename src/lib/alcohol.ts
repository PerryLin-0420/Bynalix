/**
 * Alcoholic drinks. Alcohol (ethanol) is a fourth energy source at 7 kcal/g that
 * protein / carbs / fat don't cover, so a food in the 酒類 category stores its
 * alcohol per base quantity in `alcohol_g`, and its calories include it.
 */

export const ALCOHOL_CATEGORY = "酒類";

/** Density of ethanol (g/ml): alcohol g = ml × ABV% / 100 × 0.789. */
export const ETHANOL_G_PER_ML = 0.789;
export const KCAL_PER_G_ALCOHOL = 7;
/** Taiwan's standard drink (衛福部國健署): 10 g of alcohol. */
export const STANDARD_DRINK_G = 10;

export function alcoholGrams(ml: number, abvPct: number): number {
  return ml * abvPct / 100 * ETHANOL_G_PER_ML;
}

/** ABV % back from a food's alcohol per base quantity (ml, or g taken as ml). */
export function abvOf(food: { alcohol_g?: number | null; base_quantity: number }): number {
  const g = food.alcohol_g ?? 0;
  if (!g || !food.base_quantity) return 0;
  return g / food.base_quantity / ETHANOL_G_PER_ML * 100;
}

export function standardDrinks(alcoholG: number): number {
  return alcoholG / STANDARD_DRINK_G;
}

export interface Serving { zh: string; en: string; ml: number }

const WINE: Serving[]   = [{ zh: "一杯", en: "Glass", ml: 150 }, { zh: "一瓶", en: "Bottle", ml: 750 }];
const SPIRIT: Serving[] = [{ zh: "一口杯", en: "Shot", ml: 30 }, { zh: "一份", en: "Pour", ml: 45 }, { zh: "雙份", en: "Double", ml: 60 }];
const BEER: Serving[]   = [{ zh: "一罐", en: "Can", ml: 330 }, { zh: "大罐", en: "Tall can", ml: 500 }, { zh: "一瓶", en: "Bottle", ml: 600 }];
const COCKTAIL: Serving[] = [{ zh: "一杯", en: "Glass", ml: 200 }, { zh: "大杯", en: "Tall", ml: 300 }];

/** Serving shortcuts by kind; the seed picks one per drink. */
export const SERVINGS = {
  beer: BEER, wine: WINE, spirit: SPIRIT, cocktail: COCKTAIL,
  sake: [{ zh: "一杯", en: "Cup", ml: 60 }, { zh: "一合", en: "Gō", ml: 180 }, { zh: "一瓶", en: "Bottle", ml: 720 }],
  soju: [{ zh: "一杯", en: "Glass", ml: 50 }, { zh: "一瓶", en: "Bottle", ml: 360 }],
  liqueur: [{ zh: "一杯", en: "Glass", ml: 60 }, { zh: "一口杯", en: "Shot", ml: 30 }],
  rice: [{ zh: "一口杯", en: "Shot", ml: 30 }, { zh: "一碗", en: "Bowl", ml: 150 }],
  rtd: [{ zh: "一罐", en: "Can", ml: 350 }, { zh: "大罐", en: "Tall can", ml: 500 }],
} satisfies Record<string, Serving[]>;
export type ServingKind = keyof typeof SERVINGS;

/** Custom alcoholic drinks get a general set. */
export const DEFAULT_SERVINGS: Serving[] = [
  { zh: "一口杯", en: "Shot", ml: 30 }, { zh: "一杯", en: "Glass", ml: 150 }, { zh: "一罐", en: "Can", ml: 330 },
];
