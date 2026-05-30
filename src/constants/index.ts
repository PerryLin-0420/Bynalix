import type { Mode } from "@/types";

// ─── Pearson Statistics ───────────────────────────────────────────────────────
export const STATS_MIN_DAYS = 7;

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

// ─── Body Part ───────────────────────────────────────────────────────────────
export const BODY_PART_COLORS: Record<string, string> = {
  胸: "#f97316", 背: "#3b82f6", 腿: "#10b981",
  腹: "#f59e0b", 手: "#8b5cf6", 肩: "#ef4444",
};

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

