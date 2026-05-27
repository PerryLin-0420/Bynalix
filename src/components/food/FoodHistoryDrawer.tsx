import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import { X, ChevronRight, ChevronDown } from "lucide-react";
import { useSwipeClose } from "@/hooks/useSwipe";
import { clsx } from "clsx";
import { getDb } from "@/lib/db";
import { useLangStore } from "@/store/langStore";

interface Props {
  open: boolean;
  userId: number;
  onClose: () => void;
  onSelectDate: (date: string) => void;
}

interface DaySummary {
  log_date: string;
  meal_count: number;
  total_cal: number;
}

interface MealItemRaw {
  meal_type: string;
  cal: number;
}

interface MealGroup {
  meal_type: string; // normalized English key
  item_count: number;
  total_cal: number;
}

// Normalize any DB variant (Chinese or English) → canonical English key
const NORMALIZE_TYPE: Record<string, string> = {
  breakfast: "breakfast", 早餐: "breakfast",
  lunch:     "lunch",     午餐: "lunch",
  dinner:    "dinner",    晚餐: "dinner",
  snack:     "snack",     點心: "snack",
};

// Canonical key → display label
const MEAL_LABEL_ZH: Record<string, string> = {
  breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "點心",
};
const MEAL_LABEL_EN: Record<string, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack",
};

export function FoodHistoryDrawer({ open, userId, onClose, onSelectDate }: Props) {
  const { t, lang } = useLangStore();
  const swipeClose = useSwipeClose(onClose);
  const [summaries, setSummaries]         = useState<DaySummary[]>([]);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [details, setDetails]             = useState<Record<string, MealGroup[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  useEffect(() => {
    if (open) { loadSummaries(); setExpanded(null); }
  }, [open, userId]);

  const loadSummaries = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<DaySummary[]>(`
        SELECT ml.log_date,
          COUNT(ml.meal_log_id) as meal_count,
          ROUND(SUM(fd.calories_kcal * ml.quantity / fd.base_quantity), 0) as total_cal
        FROM meal_log ml
        JOIN food_database fd ON fd.food_id = ml.food_id
        WHERE ml.user_id = ?
        GROUP BY ml.log_date
        ORDER BY ml.log_date DESC
        LIMIT 90
      `, [userId]);
      setSummaries(rows);
    } catch { }
  };

  const toggleExpand = async (date: string) => {
    if (expanded === date) { setExpanded(null); return; }
    setExpanded(date);
    if (!details[date]) {
      setLoadingDetail(date);
      try {
        const db = await getDb();
        const rows = await db.select<MealItemRaw[]>(`
          SELECT ml.meal_type,
            ROUND(fd.calories_kcal * ml.quantity / fd.base_quantity, 0) as cal
          FROM meal_log ml
          JOIN food_database fd ON fd.food_id = ml.food_id
          WHERE ml.user_id = ? AND ml.log_date = ?
          ORDER BY ml.log_time
        `, [userId, date]);

        // Normalize meal_type (DB may store English keys or Chinese labels)
        // then group in JS to avoid SQL GROUP BY mismatches
        const map = new Map<string, MealGroup>();
        for (const row of rows) {
          const key = NORMALIZE_TYPE[row.meal_type] ?? row.meal_type;
          const existing = map.get(key);
          if (existing) {
            existing.item_count += 1;
            existing.total_cal  += Number(row.cal);
          } else {
            map.set(key, { meal_type: key, item_count: 1, total_cal: Number(row.cal) });
          }
        }
        setDetails(d => ({ ...d, [date]: Array.from(map.values()) }));
      } catch { }
      setLoadingDetail(null);
    }
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      return lang === "en"
        ? format(parseISO(dateStr), "MMM d, yyyy (EEEE)")
        : format(parseISO(dateStr), "M月d日 (EEEE)", { locale: zhTW });
    } catch { return dateStr; }
  };

  const mealLabel = (type: string) =>
    lang === "en"
      ? (MEAL_LABEL_EN[type] ?? type)
      : (MEAL_LABEL_ZH[type] ?? type);

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 bg-black/40 z-[55] transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={clsx(
          "fixed top-0 right-0 h-full w-full sm:w-[360px] bg-white shadow-2xl z-[60] flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
        {...swipeClose}
      >
        {/* Safe-area cover for Android status bar */}
        <div className="shrink-0" style={{ height: "env(safe-area-inset-top)" }} />
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{t("food.history")}</h2>
          <button onClick={onClose} className="p-2 -mr-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {summaries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              {t("food.noLog")}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {summaries.map(s => {
                const isExp    = expanded === s.log_date;
                const dayGroups = details[s.log_date] ?? [];

                return (
                  <div key={s.log_date}>
                    {/* Summary row */}
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">
                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleExpand(s.log_date)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                      >
                        {isExp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>

                      {/* Date info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{formatDateLabel(s.log_date)}</p>
                        <p className="text-xs text-gray-400">
                          {s.meal_count} {lang === "en" ? "items" : "項"} · {s.total_cal} kcal
                        </p>
                      </div>

                    </div>

                    {/* Expanded detail — grouped by meal type */}
                    {isExp && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {loadingDetail === s.log_date ? (
                          <p className="text-xs text-gray-400 text-center py-3">{t("common.loading")}</p>
                        ) : dayGroups.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-3">{t("common.noData")}</p>
                        ) : (
                          <>
                            <div className="divide-y divide-gray-100">
                              {dayGroups.map(g => (
                                <div key={g.meal_type} className="flex items-center gap-2 px-5 py-2.5">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800">{mealLabel(g.meal_type)}</p>
                                    <p className="text-[10px] text-gray-400">
                                      {g.item_count} {lang === "en" ? "items" : "項"}
                                    </p>
                                  </div>
                                  <span className="text-xs font-semibold text-orange-500 shrink-0">
                                    {g.total_cal} kcal
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="px-5 py-2.5 border-t border-gray-200">
                              <button
                                onClick={() => { onSelectDate(s.log_date); onClose(); }}
                                className="w-full py-2 rounded-xl bg-teal-500 text-white text-xs font-semibold hover:bg-teal-600 transition-colors"
                              >
                                {t("food.goToDate")}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
