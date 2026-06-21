export interface BoundSpec {
  zh: string;
  en: string;
  gt?: number;    // exclusive lower: value > gt
  gte?: number;   // inclusive lower: value >= gte
  lt?: number;    // exclusive upper: value < lt
  lte?: number;   // inclusive upper: value <= lte
}

/** Returns a localized error string if `raw` is out of range, null if valid.
 *  Empty string is valid when required=false (optional field). */
export function checkBound(
  raw: string,
  spec: BoundSpec,
  lang: string,
  required = false,
): string | null {
  const empty = raw === "" || raw === undefined || raw === null;
  if (empty) {
    if (required) {
      const label = lang === "zh" ? spec.zh : spec.en;
      return lang === "zh" ? `請輸入${label}` : `Please enter ${label}`;
    }
    return null;
  }
  const v = parseFloat(raw);
  if (isNaN(v)) {
    const label = lang === "zh" ? spec.zh : spec.en;
    return lang === "zh" ? `${label}格式不正確` : `Invalid ${label}`;
  }
  const label = lang === "zh" ? spec.zh : spec.en;
  if (spec.gt  !== undefined && v <= spec.gt)  return lang === "zh" ? `${label}需大於 ${spec.gt}`       : `${label} must be > ${spec.gt}`;
  if (spec.gte !== undefined && v <  spec.gte) return lang === "zh" ? `${label}需為 ${spec.gte} 以上`   : `${label} must be ≥ ${spec.gte}`;
  if (spec.lte !== undefined && v >  spec.lte) return lang === "zh" ? `${label}不能超過 ${spec.lte}`    : `${label} cannot exceed ${spec.lte}`;
  if (spec.lt  !== undefined && v >= spec.lt)  return lang === "zh" ? `${label}需小於 ${spec.lt}`       : `${label} must be < ${spec.lt}`;
  return null;
}

export const BOUNDS = {
  // Body metrics
  weight:        { zh: "體重",     en: "Weight",         gt: 0,   lte: 300  },
  height:        { zh: "身高",     en: "Height",         gt: 0,   lte: 250  },
  age:           { zh: "年齡",     en: "Age",            gt: 0,   lte: 130  },
  bodyFat:       { zh: "體脂率",   en: "Body fat %",     gt: 0,   lt:  100  },
  waist:         { zh: "腰圍",     en: "Waist",          gt: 0,   lte: 200  },
  bodyWater:     { zh: "體水分",   en: "Body water %",   gt: 0,   lt:  100  },
  visceralFat:   { zh: "內臟脂肪",  en: "Visceral fat",   gt: 0,   lte: 40   },
  muscleTrunk:   { zh: "軀幹肌肉",  en: "Trunk muscle",   gt: 0,   lte: 80   },
  muscleArm:     { zh: "手臂肌肉",  en: "Arm muscle",     gt: 0,   lte: 30   },
  muscleLeg:     { zh: "腿部肌肉",  en: "Leg muscle",     gt: 0,   lte: 60   },
  sleepHours:    { zh: "睡眠時間",  en: "Sleep hours",    gte: 0,  lte: 24   },
  // Exercise
  exDuration:    { zh: "時長",     en: "Duration",       gt: 0,   lte: 1440 },
  runDistance:   { zh: "距離",     en: "Distance",       gt: 0              },
  runTime:       { zh: "時間",     en: "Time",           gt: 0,   lte: 1440 },
  strWeight:     { zh: "重量",     en: "Weight",         gt: 0,   lte: 700  },
  strReps:       { zh: "次數",     en: "Reps",           gt: 0              },
  waterMl:       { zh: "水量",     en: "Amount",         gt: 0              },
  // Food
  foodQty:       { zh: "份量",     en: "Quantity",       gt: 0              },
  macroNutrient: { zh: "營養素",   en: "Nutrient",       gte: 0            },
  caloriesVal:   { zh: "熱量",     en: "Calories",       gte: 0             },
  // Goals / profile
  targetWeight:  { zh: "目標體重",  en: "Target weight",  gt: 0,   lte: 300  },
  waterGoal:     { zh: "飲水目標",  en: "Water goal",     gt: 0              },
  mlPerKg:       { zh: "ml/kg",   en: "ml/kg",           gt: 0              },
  macroRatio:    { zh: "宏量素 (g)", en: "Macro (g)",       gte: 0            },
};
