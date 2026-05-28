import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { clsx } from "clsx";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";
import { SEED_EXERCISES } from "@/lib/db/seed/exercises";

// Body-part ZH → EN lookup (matches body_part values stored in strength_session)
const BODY_PART_EN: Record<string, string> = {
  "胸": "Chest",
  "背": "Back",
  "腿": "Legs",
  "腹": "Core",
  "手": "Arms",
  "肩": "Shoulders",
};

export interface MetricCfg {
  type: "strength" | "cardio" | "other" | "body" | "diet" | "burn";
  metric: string;
  exerciseName?: string;  // strength: exercise name (optional); cardio: "running"|"swimming"|"cycling"
  bodyPart?: string;      // strength: body-part filter (priority selection)
}

export function metricKey(cfg: MetricCfg): string {
  return `${cfg.type}:${cfg.metric}:${cfg.exerciseName ?? ""}:${cfg.bodyPart ?? ""}`;
}

export function metricLabel(cfg: MetricCfg, lang: string): string {
  let mOpt: { key: string; zh: string; en: string } | undefined;
  if (cfg.type === "cardio" && cfg.exerciseName) {
    mOpt = CARDIO_SUBTYPE_METRICS[cfg.exerciseName]?.find(o => o.key === cfg.metric);
  } else {
    mOpt = METRIC_OPTIONS[cfg.type]?.find(o => o.key === cfg.metric);
  }
  const mStr = lang === "zh" ? (mOpt?.zh ?? cfg.metric) : (mOpt?.en ?? cfg.metric);

  if (cfg.type === "strength") {
    // Exercise takes priority; fall back to bodyPart. Translate for EN.
    if (cfg.exerciseName) {
      const nameEn = lang === "en"
        ? (SEED_EXERCISES.find(e => e.name === cfg.exerciseName)?.name_en ?? cfg.exerciseName)
        : cfg.exerciseName;
      return `${nameEn} · ${mStr}`;
    }
    if (cfg.bodyPart) {
      const bpStr = lang === "en" ? (BODY_PART_EN[cfg.bodyPart] ?? cfg.bodyPart) : cfg.bodyPart;
      return `${bpStr} · ${mStr}`;
    }
  }

  if (cfg.type === "cardio" && cfg.exerciseName) {
    const st = CARDIO_SUBTYPES.find(s => s.key === cfg.exerciseName);
    const stStr = st ? (lang === "zh" ? st.zh : st.en) : cfg.exerciseName;
    return `${stStr} · ${mStr}`;
  }

  const tMap: Record<string, { zh: string; en: string }> = {
    cardio: { zh: "有氧",    en: "Cardio"   },
    other:  { zh: "其他",    en: "Other"    },
    body:   { zh: "身體",    en: "Body"     },
    diet:   { zh: "飲食",    en: "Diet"     },
    burn:   { zh: "運動消耗", en: "Ex. Burn" },
  };
  const t = tMap[cfg.type];
  return t ? `${lang === "zh" ? t.zh : t.en} · ${mStr}` : mStr;
}

const TYPE_OPTIONS = [
  { key: "strength" as const, zh: "重訓",    en: "Strength"  },
  { key: "cardio"   as const, zh: "有氧",    en: "Cardio"    },
  { key: "other"    as const, zh: "其他",    en: "Other"     },
  { key: "body"     as const, zh: "身體",    en: "Body"      },
  { key: "diet"     as const, zh: "飲食",    en: "Diet"      },
  { key: "burn"     as const, zh: "運動消耗", en: "Ex. Burn"  },
];

export const CARDIO_SUBTYPES = [
  { key: "running",  zh: "跑步",  en: "Running"  },
  { key: "swimming", zh: "游泳",  en: "Swimming" },
  { key: "cycling",  zh: "自行車", en: "Cycling"  },
];

const CARDIO_COMMON_METRICS = [
  { key: "distance_km",     zh: "距離",    en: "Distance"  },
  { key: "duration_min",    zh: "時長",    en: "Duration"  },
  { key: "avg_speed",       zh: "平均配速", en: "Avg Speed" },
  { key: "calories_burned", zh: "消耗",    en: "Calories"  },
];

export const CARDIO_SUBTYPE_METRICS: Record<string, { key: string; zh: string; en: string }[]> = {
  running:  CARDIO_COMMON_METRICS,
  swimming: CARDIO_COMMON_METRICS,
  cycling:  CARDIO_COMMON_METRICS,
};

export const METRIC_OPTIONS: Record<string, { key: string; zh: string; en: string }[]> = {
  strength: [
    { key: "max_weight",   zh: "最大重量", en: "Max Weight" },
    { key: "total_volume", zh: "訓練量",   en: "Volume"     },
    // total_reps removed per product decision
  ],
  cardio: [], // unused — cardio uses CARDIO_SUBTYPE_METRICS
  other: [
    { key: "duration_min",    zh: "時長", en: "Duration" },
    { key: "calories_burned", zh: "消耗", en: "Burn"     },
  ],
  body: [
    { key: "weight_kg",   zh: "體重",    en: "Weight"      },
    { key: "sleep_hours", zh: "睡眠時長", en: "Sleep Hours"  },
    { key: "water_ml",    zh: "飲水量",   en: "Water"        },
  ],
  diet: [
    { key: "total_calories", zh: "總熱量", en: "Calories" },
    { key: "carbs_g",        zh: "碳水",   en: "Carbs"    },
    { key: "protein_g",      zh: "蛋白質", en: "Protein"  },
    { key: "fat_g",          zh: "脂肪",   en: "Fat"      },
  ],
  burn: [],  // auto-confirms as "total_burn"
};

interface Props {
  userId: number;
  from: string;
  to: string;
  value: MetricCfg | null;
  onConfirm: (cfg: MetricCfg) => void;
  onCancel?: () => void;
  showDirection?: boolean;
  direction?: "up" | "down";
  onDirectionChange?: (d: "up" | "down") => void;
  excludeKeys?: string[];
  lang: string;
}

export function MetricPicker({
  userId, from: _from, to: _to,
  value, onConfirm, onCancel,
  showDirection = false,
  direction = "up", onDirectionChange,
  excludeKeys = [],
  lang,
}: Props) {
  const [type, setType]       = useState<MetricCfg["type"]>(value?.type ?? "strength");
  const [metric, setMetric]   = useState(value?.metric ?? "");
  const [exName, setExName]   = useState(value?.exerciseName ?? "");
  const [bodyPart, setBodyPart] = useState(value?.bodyPart ?? "");

  const [exercises, setExercises]   = useState<{ name: string; nameEn: string | null }[]>([]);
  const [bodyParts, setBodyParts]   = useState<string[]>([]);
  const [exSearch, setExSearch]     = useState("");
  const [exLoading, setExLoading]   = useState(false);
  const [bpLoading, setBpLoading]   = useState(false);

  useEffect(() => {
    if (type === "strength") {
      loadBodyParts();
      loadExercises();
    }
  }, [type]);

  useEffect(() => {
    if (type === "burn") setMetric("total_burn");
  }, [type]);

  const loadBodyParts = async () => {
    setBpLoading(true);
    try {
      const db = await getDb();
      const rows = await db.select<{ body_part: string }[]>(
        `SELECT DISTINCT body_part FROM strength_session
         WHERE user_id=? AND body_part IS NOT NULL AND body_part != ''
         ORDER BY body_part`,
        [userId]
      );
      setBodyParts(rows.map(r => r.body_part));
    } catch (e) { logError("MetricPicker", e); }
    setBpLoading(false);
  };

  const loadExercises = async () => {
    setExLoading(true);
    try {
      const db = await getDb();
      // Use the same exercise_database table as ExerciseLog for consistency
      const rows = await db.select<{ name: string; name_en: string | null }[]>(
        `SELECT name, name_en FROM exercise_database
         WHERE category='重訓'
         ORDER BY source_type DESC, name`
      );
      setExercises(rows.map(r => ({
        name: r.name,
        nameEn: (r.name_en || SEED_EXERCISES.find(e => e.name === r.name)?.name_en) ?? null,
      })));
    } catch (e) { logError("MetricPicker", e); }
    setExLoading(false);
  };

  const changeType = (t: MetricCfg["type"]) => {
    setType(t);
    setMetric(t === "burn" ? "total_burn" : "");
    setExName("");
    setExSearch("");
    setBodyPart("");
  };

  // When cardio sub-type changes, reset metric
  const changeCardioSubtype = (sub: string) => {
    setExName(sub);
    setMetric("");
  };

  const isCardio   = type === "cardio";
  const isBurn     = type === "burn";
  const isStrength = type === "strength";

  // Metric options: cardio uses subtype-filtered list; others use METRIC_OPTIONS
  const metricOpts = isCardio
    ? (exName ? CARDIO_SUBTYPE_METRICS[exName] ?? [] : [])
    : (METRIC_OPTIONS[type] ?? []);

  const filteredEx = exSearch
    ? exercises.filter(e =>
        e.name.toLowerCase().includes(exSearch.toLowerCase()) ||
        (e.nameEn ?? "").toLowerCase().includes(exSearch.toLowerCase())
      )
    : exercises;

  // Strength: need metric + (bodyPart OR exerciseName) — exercise is optional
  const canConfirm = isBurn ? true
    : isCardio   ? metric !== "" && exName !== ""
    : isStrength ? metric !== "" && (bodyPart !== "" || exName !== "")
    : metric !== "";

  const isExcluded = (t: string, m: string, ex: string = "", bp: string = "") =>
    excludeKeys.includes(`${t}:${m}:${ex}:${bp}`);

  return (
    <div className="space-y-3">
      {/* Layer 1: Type */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          {lang === "zh" ? "類型" : "Type"}
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => changeType(opt.key)}
              className={clsx(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                type === opt.key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              )}
            >
              {lang === "zh" ? opt.zh : opt.en}
            </button>
          ))}
        </div>
      </div>

      {/* Strength Layer 2: Body part (priority selection) */}
      {isStrength && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {lang === "zh" ? "部位" : "Body Part"}
          </p>
          {bpLoading ? (
            <p className="text-xs text-gray-400 py-1">{lang === "zh" ? "載入中…" : "Loading…"}</p>
          ) : bodyParts.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">{lang === "zh" ? "尚無部位資料" : "No body-part data"}</p>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {bodyParts.map(bp => (
                <button
                  key={bp}
                  onClick={() => setBodyPart(bodyPart === bp ? "" : bp)}
                  className={clsx(
                    "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                    bodyPart === bp
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  )}
                >
                  {lang === "en" ? (BODY_PART_EN[bp] ?? bp) : bp}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cardio Layer 2: sub-type (跑步/游泳/自行車) */}
      {isCardio && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {lang === "zh" ? "運動" : "Exercise"}
          </p>
          <div className="flex gap-1.5">
            {CARDIO_SUBTYPES.map(opt => (
              <button
                key={opt.key}
                onClick={() => changeCardioSubtype(opt.key)}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                  exName === opt.key
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                )}
              >
                {lang === "zh" ? opt.zh : opt.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Layer 3: Metric */}
      {!isBurn && (!isCardio || exName !== "") && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {lang === "zh" ? "指標" : "Metric"}
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {metricOpts.map(opt => {
              const excluded = isExcluded(
                type, opt.key,
                isCardio ? exName : isStrength ? exName : "",
                isStrength ? bodyPart : "",
              );
              return (
                <button
                  key={opt.key}
                  onClick={() => !excluded && setMetric(opt.key)}
                  disabled={excluded}
                  className={clsx(
                    "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                    excluded
                      ? "bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed"
                      : metric === opt.key
                        ? "bg-teal-500 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  )}
                >
                  {lang === "zh" ? opt.zh : opt.en}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Burn hint */}
      {isBurn && (
        <p className="text-xs text-gray-400">
          {lang === "zh" ? "統計日期內的總消耗熱量" : "Total exercise calories burned in the date range"}
        </p>
      )}

      {/* Strength Layer 4: Exercise name picker (optional) */}
      {isStrength && metric && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {lang === "zh" ? "動作（可選）" : "Exercise (Optional)"}
          </p>
          <input
            type="text"
            value={exSearch}
            onChange={e => setExSearch(e.target.value)}
            placeholder={lang === "zh" ? "搜尋動作名稱…" : "Search exercise…"}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs bg-white focus:outline-none focus:border-teal-400 mb-2"
          />
          {exLoading ? (
            <p className="text-xs text-gray-400 text-center py-2">{lang === "zh" ? "載入中…" : "Loading…"}</p>
          ) : filteredEx.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">{lang === "zh" ? "無資料" : "No data"}</p>
          ) : (
            <div className="max-h-36 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
              {filteredEx.map(ex => {
                const excluded = isExcluded(type, metric, ex.name, bodyPart);
                const displayName = lang === "en" ? (ex.nameEn ?? ex.name) : ex.name;
                return (
                  <button
                    key={ex.name}
                    onClick={() => !excluded && setExName(exName === ex.name ? "" : ex.name)}
                    disabled={excluded}
                    className={clsx(
                      "w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between",
                      excluded
                        ? "text-gray-300 cursor-not-allowed"
                        : exName === ex.name
                          ? "bg-teal-50 text-teal-700 font-semibold"
                          : "hover:bg-gray-50 text-gray-700"
                    )}
                  >
                    {displayName}
                    {exName === ex.name && !excluded && <Check size={12} className="text-teal-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
          {exName && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] text-teal-600 font-medium">
                {lang === "en"
                  ? (exercises.find(e => e.name === exName)?.nameEn ?? exName)
                  : exName}
              </span>
              <button
                onClick={() => setExName("")}
                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                {lang === "zh" ? "清除" : "Clear"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Direction toggle */}
      {showDirection && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {lang === "zh" ? "方向" : "Direction"}
          </p>
          <div className="flex gap-1.5">
            {([
              { key: "up"   as const, zh: "越大越好 ⬆️", en: "Higher is better ⬆️" },
              { key: "down" as const, zh: "越小越好 ⬇️", en: "Lower is better ⬇️" },
            ]).map(opt => (
              <button
                key={opt.key}
                onClick={() => onDirectionChange?.(opt.key)}
                className={clsx(
                  "flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all border",
                  direction === opt.key
                    ? opt.key === "up"
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "bg-rose-500 text-white border-rose-500"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                )}
              >
                {lang === "zh" ? opt.zh : opt.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
          >
            {lang === "zh" ? "取消" : "Cancel"}
          </button>
        )}
        <button
          onClick={() => canConfirm && onConfirm({
            type,
            metric,
            exerciseName: (isStrength || isCardio) ? (exName || undefined) : undefined,
            bodyPart: isStrength ? (bodyPart || undefined) : undefined,
          })}
          disabled={!canConfirm}
          className={clsx(
            "flex-1 py-2 rounded-xl text-xs font-semibold transition-colors",
            canConfirm
              ? "bg-gray-900 text-white hover:bg-gray-700"
              : "bg-gray-100 text-gray-300 cursor-not-allowed"
          )}
        >
          {lang === "zh" ? "確認" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
