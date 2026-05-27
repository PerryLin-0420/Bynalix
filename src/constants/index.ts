import type { Mode, MealType, ActivityLevel, WeightMeasType, Intensity } from "@/types";

// ─── Pearson Statistics ───────────────────────────────────────────────────────
export const STATS_MIN_DAYS = 14;

// ─── Modes ───────────────────────────────────────────────────────────────────
export const MODE_META: Record<Mode, {
  label: string; desc: string; group: "cut" | "bulk" | "maintain" | "custom";
  accent: string; accentBg: string; accentText: string;
}> = {
  cut_slow:        { label: "慢速減脂", desc: "每週 −0.25% 體重", group: "cut",      accent: "#ef4444", accentBg: "bg-red-50",    accentText: "text-red-600"    },
  cut_normal:      { label: "標準減脂", desc: "每週 −0.5% 體重",  group: "cut",      accent: "#ef4444", accentBg: "bg-red-50",    accentText: "text-red-600"    },
  cut_aggressive:  { label: "積極減脂", desc: "每週 −0.75% 體重", group: "cut",      accent: "#dc2626", accentBg: "bg-red-100",   accentText: "text-red-700"    },
  bulk_lean:       { label: "精實增肌", desc: "每週 +0.25% 體重", group: "bulk",     accent: "#3b82f6", accentBg: "bg-blue-50",   accentText: "text-blue-600"   },
  bulk_normal:     { label: "標準增肌", desc: "每週 +0.5% 體重",  group: "bulk",     accent: "#3b82f6", accentBg: "bg-blue-50",   accentText: "text-blue-600"   },
  bulk_aggressive: { label: "積極增肌", desc: "每週 +0.75% 體重", group: "bulk",     accent: "#2563eb", accentBg: "bg-blue-100",  accentText: "text-blue-700"   },
  maintain:        { label: "維持體重", desc: "TDEE 維持",         group: "maintain", accent: "#10b981", accentBg: "bg-green-50",  accentText: "text-green-600"  },
  custom:          { label: "自訂目標", desc: "手動設定",          group: "custom",   accent: "#8b5cf6", accentBg: "bg-purple-50", accentText: "text-purple-600" },
};

export const MODE_GOAL: Record<Mode, "cut" | "bulk" | "maintain"> = {
  cut_slow: "cut", cut_normal: "cut", cut_aggressive: "cut",
  bulk_lean: "bulk", bulk_normal: "bulk", bulk_aggressive: "bulk",
  maintain: "maintain", custom: "maintain",
};

// ─── Meal Types ───────────────────────────────────────────────────────────────
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "點心",
};

// ─── Activity Levels ──────────────────────────────────────────────────────────
export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary:         "久坐（幾乎不運動）",
  lightly_active:    "輕度活動（每週 1–2 次）",
  moderately_active: "中度活動（每週 3–4 次）",
  very_active:       "高度活動（每週 5–6 次）",
  extra_active:      "極高活動（每天運動）",
};

// ─── Weight Measurement Types ─────────────────────────────────────────────────
export const WEIGHT_TYPE_LABELS: Record<WeightMeasType, string> = {
  fasting:     "空腹",
  before_meal: "飯前",
  after_meal:  "飯後",
};

// ─── Intensity ────────────────────────────────────────────────────────────────
export const INTENSITY_LABELS: Record<Intensity, string> = {
  light:    "輕度",
  moderate: "中等",
  intense:  "高強度",
};

// ─── Food Categories ──────────────────────────────────────────────────────────
export const FOOD_CATEGORIES = [
  "主食", "肉類", "海鮮", "蛋奶豆", "蔬菜", "水果", "堅果油脂", "乳製品", "加工食品", "補劑", "其他",
] as const;

// ─── Exercise Categories ──────────────────────────────────────────────────────
export const EXERCISE_CATEGORIES = [
  "有氧", "重訓", "球類", "水上運動", "伸展", "其他",
] as const;

// ─── Charts ───────────────────────────────────────────────────────────────────
export const MACRO_COLORS = {
  protein:  "#ef4444",
  carb:     "#f59e0b",
  fat:      "#3b82f6",
  calories: "#111827",
  water:    "#60a5fa",
  exercise: "#f97316",
} as const;

export const CHART_DATE_RANGES = [
  { label: "14天", days: 14 },
  { label: "30天", days: 30 },
  { label: "90天", days: 90 },
] as const;

// ─── Water ────────────────────────────────────────────────────────────────────
export const WATER_DAILY_GOAL_ML = 2000;
export const WATER_PRESETS_ML    = [150, 250, 350, 500] as const;
