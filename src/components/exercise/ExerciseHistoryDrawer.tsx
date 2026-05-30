import { useState, useEffect } from "react";
import { fmtWeekdayHeader } from "@/lib/dateFormat";
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";
import { useLangStore } from "@/store/langStore";
import { HistoryDrawerShell } from "@/components/layout/HistoryDrawerShell";

interface Props {
  open: boolean;
  userId: number;
  onClose: () => void;
  onSelectDate: (date: string) => void;
}

interface DaySummary {
  log_date: string;
  session_count: number;
  total_kcal: number;
}

interface ExerciseDetail {
  id: number;
  exercise_name: string;
  name_en: string | null;
  duration_min: number;
  calories_burned: number;
  intensity: string;
  category: string | null;
}

export function ExerciseHistoryDrawer({ open, userId, onClose, onSelectDate }: Props) {
  const { t, lang } = useLangStore();
  const [summaries, setSummaries]         = useState<DaySummary[]>([]);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [details, setDetails]             = useState<Record<string, ExerciseDetail[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadSummaries();
      setExpanded(null);
    }
  }, [open, userId]);

  const loadSummaries = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<DaySummary[]>(`
        SELECT log_date,
          COUNT(*) as session_count,
          ROUND(SUM(calories_burned), 0) as total_kcal
        FROM exercise_log
        WHERE user_id = ?
        GROUP BY log_date
        ORDER BY log_date DESC
        LIMIT 90
      `, [userId]);
      setSummaries(rows);
    } catch (e) { logError("ExerciseHistoryDrawer", e); }
  };

  const toggleExpand = async (date: string) => {
    if (expanded === date) {
      setExpanded(null);
      return;
    }
    setExpanded(date);
    if (!details[date]) {
      setLoadingDetail(date);
      try {
        const db = await getDb();
        const rows = await db.select<ExerciseDetail[]>(`
          SELECT id, exercise_name, name_en, duration_min, calories_burned, intensity, category
          FROM exercise_log
          WHERE user_id = ? AND log_date = ?
          ORDER BY log_time
        `, [userId, date]);
        setDetails(d => ({ ...d, [date]: rows }));
      } catch (e) { logError("ExerciseHistoryDrawer", e); }
      setLoadingDetail(null);
    }
  };

  const deleteEntry = async (date: string, id: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM exercise_log WHERE id = ?", [id]);
      const rows = await db.select<ExerciseDetail[]>(`
        SELECT id, exercise_name, name_en, duration_min, calories_burned, intensity, category
        FROM exercise_log
        WHERE user_id = ? AND log_date = ?
        ORDER BY log_time
      `, [userId, date]);
      setDetails(d => ({ ...d, [date]: rows }));
      await loadSummaries();
    } catch (e) { logError("ExerciseHistoryDrawer", e); }
  };


  const INTENSITY_LABELS_T: Record<string, string> = {
    light:    t("exercise.light"),
    moderate: t("exercise.moderate"),
    intense:  t("exercise.intense"),
  };

  return (
    <HistoryDrawerShell open={open} title={t("exHistory.title")} onClose={onClose}>
      {summaries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              {t("exHistory.noData")}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {summaries.map(s => {
                const isExp = expanded === s.log_date;
                const dayDetails = details[s.log_date] ?? [];

                return (
                  <div key={s.log_date}>
                    {/* Summary row */}
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">
                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleExpand(s.log_date)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                      >
                        {isExp
                          ? <ChevronDown size={16} />
                          : <ChevronRight size={16} />
                        }
                      </button>

                      {/* Date info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{fmtWeekdayHeader(s.log_date, lang)}</p>
                        <p className="text-xs text-gray-400">{s.session_count} {t("exHistory.items")} · {s.total_kcal} kcal</p>
                      </div>

                    </div>

                    {/* Expanded detail */}
                    {isExp && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {loadingDetail === s.log_date ? (
                          <p className="text-xs text-gray-400 text-center py-3">{t("common.loading")}</p>
                        ) : dayDetails.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-3">{t("common.noData")}</p>
                        ) : (
                          <>
                            <div className="divide-y divide-gray-100">
                              {dayDetails.map(item => (
                                <div key={item.id} className="flex items-center gap-2 px-5 py-2.5">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate">{(lang === "en" && item.name_en) ? item.name_en : item.exercise_name}</p>
                                    <p className="text-[10px] text-gray-400">
                                      {item.duration_min} {t("exercise.min")} · {INTENSITY_LABELS_T[item.intensity] ?? item.intensity}
                                    </p>
                                  </div>
                                  <span className="text-xs font-semibold text-orange-500 shrink-0">
                                    {Math.round(item.calories_burned)} kcal
                                  </span>
                                  <button
                                    onClick={() => deleteEntry(s.log_date, item.id)}
                                    className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="px-5 py-2.5 border-t border-gray-200">
                              <button
                                onClick={() => { onSelectDate(s.log_date); onClose(); }}
                                className="w-full py-2 rounded-xl bg-teal-500 text-white text-xs font-semibold hover:bg-teal-600 transition-colors"
                              >
                                {t("exHistory.goToDate")}
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
    </HistoryDrawerShell>
  );
}
