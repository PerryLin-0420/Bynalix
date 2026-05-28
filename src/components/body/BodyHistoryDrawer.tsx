import { useState, useEffect } from "react";
import { fmtWeekdayHeader } from "@/lib/dateFormat";
import { X, ChevronRight, ChevronDown } from "lucide-react";
import { useSwipeClose } from "@/hooks/useSwipe";
import { clsx } from "clsx";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";
import { useLangStore } from "@/store/langStore";

type Tab = "weight" | "body" | "sleep";

interface Props {
  open: boolean;
  tab: Tab;
  userId: number;
  onClose: () => void;
  onSelectDate: (date: string) => void;
}

interface DaySummary {
  log_date: string;
  count: number;
}

interface WeightDetail {
  id: number;
  weight_kg: number;
  body_fat_pct: number | null;
  measurement_type: string;
  log_time: string;
}

interface BodyDetail {
  id: number;
  body_fat_pct: number | null;
  waist_cm: number | null;
  skeletal_muscle_kg: number | null;
  log_time: string;
}

interface SleepDetail {
  id: number;
  quality: string;
  duration_hours: number | null;
  log_time: string;
}

type DayDetails =
  | { type: "weight"; items: WeightDetail[] }
  | { type: "body";   items: BodyDetail[] }
  | { type: "sleep";  items: SleepDetail[] };

const SLEEP_COLORS: Record<string, string> = {
  good: "#10b981", normal: "#f59e0b", poor: "#ef4444",
};
const WEIGHT_TYPE_ZH: Record<string, string> = {
  fasting: "空腹", before_meal: "飯前", after_meal: "飯後",
};
const WEIGHT_TYPE_EN: Record<string, string> = {
  fasting: "Fasting", before_meal: "Pre-meal", after_meal: "Post-meal",
};

export function BodyHistoryDrawer({ open, tab, userId, onClose, onSelectDate }: Props) {
  const { lang } = useLangStore();
  const swipeClose = useSwipeClose(onClose);
  const [summaries, setSummaries]         = useState<DaySummary[]>([]);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [details, setDetails]             = useState<Record<string, DayDetails>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  // Reload when drawer opens OR tab changes
  useEffect(() => {
    if (open) { loadSummaries(); setExpanded(null); setDetails({}); }
  }, [open, tab, userId]);

  const loadSummaries = async () => {
    try {
      const db = await getDb();
      let rows: DaySummary[] = [];
      if (tab === "weight") {
        rows = await db.select<DaySummary[]>(
          `SELECT log_date, COUNT(*) as count FROM weight_log
           WHERE user_id=? GROUP BY log_date ORDER BY log_date DESC LIMIT 90`,
          [userId]);
      } else if (tab === "body") {
        rows = await db.select<DaySummary[]>(
          `SELECT log_date, COUNT(*) as count FROM body_composition_log
           WHERE user_id=? GROUP BY log_date ORDER BY log_date DESC LIMIT 90`,
          [userId]);
      } else {
        rows = await db.select<DaySummary[]>(
          `SELECT sleep_date as log_date, COUNT(*) as count FROM sleep_log
           WHERE user_id=? GROUP BY sleep_date ORDER BY sleep_date DESC LIMIT 90`,
          [userId]);
      }
      setSummaries(rows);
    } catch (e) { logError("BodyHistoryDrawer", e); }
  };

  const toggleExpand = async (date: string) => {
    if (expanded === date) { setExpanded(null); return; }
    setExpanded(date);
    if (!details[date]) {
      setLoadingDetail(date);
      try {
        const db = await getDb();
        if (tab === "weight") {
          const items = await db.select<WeightDetail[]>(
            `SELECT id, weight_kg, body_fat_pct, measurement_type, log_time
             FROM weight_log WHERE user_id=? AND log_date=? ORDER BY log_time`,
            [userId, date]);
          setDetails(d => ({ ...d, [date]: { type: "weight", items } }));
        } else if (tab === "body") {
          const items = await db.select<BodyDetail[]>(
            `SELECT id, body_fat_pct, waist_cm, skeletal_muscle_kg, log_time
             FROM body_composition_log WHERE user_id=? AND log_date=? ORDER BY log_time`,
            [userId, date]);
          setDetails(d => ({ ...d, [date]: { type: "body", items } }));
        } else {
          const items = await db.select<SleepDetail[]>(
            `SELECT id, quality, duration_hours, log_time
             FROM sleep_log WHERE user_id=? AND sleep_date=? ORDER BY log_time`,
            [userId, date]);
          setDetails(d => ({ ...d, [date]: { type: "sleep", items } }));
        }
      } catch (e) { logError("BodyHistoryDrawer", e); }
      setLoadingDetail(null);
    }
  };


  const summarySubtext = (s: DaySummary) => {
    const n = Number(s.count);
    if (tab === "weight") return lang === "zh" ? `體重 ${n} 筆` : `${n} weight record${n > 1 ? "s" : ""}`;
    if (tab === "body")   return lang === "zh" ? `體態 ${n} 筆` : `${n} body record${n > 1 ? "s" : ""}`;
    return lang === "zh" ? `睡眠 ${n} 筆` : `${n} sleep record${n > 1 ? "s" : ""}`;
  };

  const drawerTitle = () => {
    if (tab === "weight") return lang === "zh" ? "體重歷史" : "Weight History";
    if (tab === "body")   return lang === "zh" ? "體態歷史" : "Body Comp History";
    return lang === "zh" ? "睡眠歷史" : "Sleep History";
  };

  const sleepLabel = (q: string) => {
    const zh: Record<string, string> = { good: "睡得好", normal: "普通", poor: "失眠" };
    const en: Record<string, string> = { good: "Good", normal: "Normal", poor: "Poor" };
    return lang === "zh" ? (zh[q] ?? q) : (en[q] ?? q);
  };

  const renderDetail = (day: DayDetails) => {
    if (day.type === "weight") {
      return day.items.map(w => (
        <div key={w.id} className="flex items-center gap-2 px-5 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800">
              {w.weight_kg} kg
              {w.body_fat_pct != null && ` · 體脂 ${w.body_fat_pct}%`}
            </p>
            <p className="text-[10px] text-gray-400">
              {lang === "zh" ? WEIGHT_TYPE_ZH[w.measurement_type] : WEIGHT_TYPE_EN[w.measurement_type]}
              {w.log_time ? ` · ${w.log_time.slice(0, 5)}` : ""}
            </p>
          </div>
        </div>
      ));
    }
    if (day.type === "body") {
      return day.items.map(b => (
        <div key={b.id} className="flex items-center gap-2 px-5 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800">
              {lang === "zh" ? "體態測量" : "Body comp"}
            </p>
            <p className="text-[10px] text-gray-400">
              {[
                b.body_fat_pct != null ? `體脂 ${b.body_fat_pct}%` : null,
                b.waist_cm != null ? `腰圍 ${b.waist_cm}cm` : null,
                b.skeletal_muscle_kg != null ? `肌肉 ${b.skeletal_muscle_kg}kg` : null,
              ].filter(Boolean).join(" · ") || "—"}
              {b.log_time ? ` · ${b.log_time.slice(0, 5)}` : ""}
            </p>
          </div>
        </div>
      ));
    }
    // sleep
    return day.items.map(sl => (
      <div key={sl.id} className="flex items-center gap-2 px-5 py-2.5">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: SLEEP_COLORS[sl.quality] ?? "#9ca3af" }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800">
            {sleepLabel(sl.quality)}
            {sl.duration_hours != null ? ` · ${sl.duration_hours}h` : ""}
          </p>
          {sl.log_time && (
            <p className="text-[10px] text-gray-400">{sl.log_time.slice(0, 5)}</p>
          )}
        </div>
      </div>
    ));
  };

  return (
    <>
      <div
        className={clsx(
          "fixed inset-0 bg-black/40 z-[55] transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
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
          <h2 className="text-lg font-bold text-gray-900">{drawerTitle()}</h2>
          <button onClick={onClose} className="p-2 -mr-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {summaries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              {lang === "zh" ? "尚無歷史記錄" : "No history"}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {summaries.map(s => {
                const isExp = expanded === s.log_date;
                const day   = details[s.log_date];

                return (
                  <div key={s.log_date}>
                    {/* Summary row */}
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <button
                        onClick={() => toggleExpand(s.log_date)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                      >
                        {isExp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{fmtWeekdayHeader(s.log_date, lang)}</p>
                        <p className="text-xs text-gray-400">{summarySubtext(s)}</p>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExp && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {loadingDetail === s.log_date ? (
                          <p className="text-xs text-gray-400 text-center py-3">
                            {lang === "zh" ? "載入中…" : "Loading…"}
                          </p>
                        ) : !day ? null : (
                          <>
                            <div className="divide-y divide-gray-100">
                              {renderDetail(day)}
                            </div>
                            <div className="px-5 py-2.5 border-t border-gray-200">
                              <button
                                onClick={() => { onSelectDate(s.log_date); onClose(); }}
                                className="w-full py-2 rounded-xl bg-teal-500 text-white text-xs font-semibold hover:bg-teal-600 transition-colors"
                              >
                                {lang === "zh" ? "前往此日" : "Go to this date"}
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
