import { format, addDays, subDays, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { clsx } from "clsx";
import { fmtDay } from "@/lib/dateFormat";
import { useLangStore } from "@/store/langStore";
import { StickyHeader } from "@/components/layout/StickyHeader";

interface Props {
  title: string;
  historyTitle: string;
  selectedDate: string;
  todayStr: string;
  onDateChange: (date: string) => void;
  onHistory: () => void;
}

export function DateNavHeader({ title, historyTitle, selectedDate, todayStr, onDateChange, onHistory }: Props) {
  const { t, lang } = useLangStore();
  const isToday = selectedDate === todayStr;

  return (
    <>
      {/* Sticky header */}
      <StickyHeader row>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-on-bg)]">{title}</h1>
          <p className="text-[var(--text-on-bg-muted)] font-bold text-sm mt-0.5">
            {isToday ? t("common.today") : fmtDay(selectedDate, lang)}
          </p>
        </div>
        <button
          onClick={onHistory}
          className="p-2 text-[var(--text-on-bg)] hover:text-[var(--text-on-bg-muted)] transition-colors mt-0.5"
          title={historyTitle}
        >
          <History size={20} />
        </button>
      </StickyHeader>

      {/* Date navigation */}
      <div className="flex items-center justify-between mb-4 bg-white/10 rounded-xl px-1 py-1">
        <button
          onClick={() => onDateChange(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)] transition-colors active:bg-white/20 rounded-xl"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium text-[var(--text-on-bg)]">
          {isToday
            ? `${t("common.today")} · ${format(parseISO(selectedDate), "M/d")}`
            : fmtDay(selectedDate, lang)}
        </span>
        <button
          onClick={() => {
            const next = format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd");
            if (next <= todayStr) onDateChange(next);
          }}
          className={clsx(
            "min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors rounded-xl",
            selectedDate >= todayStr
              ? "text-[var(--text-on-bg-faint)] cursor-not-allowed"
              : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)] active:bg-white/20"
          )}
          disabled={selectedDate >= todayStr}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </>
  );
}
