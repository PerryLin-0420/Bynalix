import { useState } from "react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek,
  format, parseISO, isSameMonth, isToday, isBefore, isAfter, isSameDay,
  addMonths, subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  activeDates: Set<string>;
  mode: "single" | "range";
  selectedDate?: string | null;
  range?: { start: string | null; end: string | null };
  onSelectDate?: (d: string) => void;
  onRangeChange?: (r: { start: string | null; end: string | null }) => void;
}

const WEEK_DAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function MiniCalendar({
  activeDates,
  mode,
  selectedDate,
  range,
  onSelectDate,
  onRangeChange,
}: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (mode === "single" && selectedDate) return parseISO(selectedDate);
    if (mode === "range" && range?.start) return parseISO(range.start);
    return new Date();
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);

  // Build grid: start from Monday of the week containing monthStart
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: monthEnd });

  // Pad to full weeks (6 rows × 7 cols = 42 cells)
  const totalCells = Math.ceil(days.length / 7) * 7;
  const paddedDays: (Date | null)[] = [...days];
  while (paddedDays.length < totalCells) paddedDays.push(null);

  const handleDayClick = (d: Date) => {
    const str = format(d, "yyyy-MM-dd");
    if (!activeDates.has(str)) return;

    if (mode === "single") {
      onSelectDate?.(str);
    } else {
      // Range mode
      const current = range ?? { start: null, end: null };
      if (!current.start || (current.start && current.end)) {
        // Start fresh
        onRangeChange?.({ start: str, end: null });
      } else {
        // Second click: set end (swap if needed)
        const startDate = parseISO(current.start);
        const clickedDate = d;
        if (isBefore(clickedDate, startDate)) {
          onRangeChange?.({ start: str, end: current.start });
        } else {
          onRangeChange?.({ start: current.start, end: str });
        }
      }
    }
  };

  const isInRange = (d: Date): boolean => {
    if (mode !== "range" || !range?.start || !range?.end) return false;
    const start = parseISO(range.start);
    const end   = parseISO(range.end);
    return !isBefore(d, start) && !isAfter(d, end);
  };

  const isRangeEndpoint = (d: Date): boolean => {
    if (mode !== "range") return false;
    const str = format(d, "yyyy-MM-dd");
    return str === range?.start || str === range?.end;
  };

  const isSelected = (d: Date): boolean => {
    if (mode === "single") {
      return !!selectedDate && isSameDay(d, parseISO(selectedDate));
    }
    return isRangeEndpoint(d);
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 select-none">
      {/* Header: month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCurrentMonth(m => subMonths(m, 1))}
          className="icon-btn rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        ><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-gray-800">
          {format(currentMonth, "yyyy年M月")}
        </span>
        <button
          onClick={() => setCurrentMonth(m => addMonths(m, 1))}
          className="icon-btn rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        ><ChevronRight size={16} /></button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map(wd => (
          <div key={wd} className="text-center text-10 font-medium text-gray-400 py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {paddedDays.map((d, idx) => {
          if (!d) {
            return <div key={`pad-${idx}`} />;
          }

          const str       = format(d, "yyyy-MM-dd");
          const isActive  = activeDates.has(str);
          const inCurMon  = isSameMonth(d, currentMonth);
          const today     = isToday(d);
          const selected  = isSelected(d);
          const inRange   = isInRange(d);

          return (
            <div
              key={str}
              onClick={() => isActive && d ? handleDayClick(d) : undefined}
              className={clsx(
                "relative flex items-center justify-center h-8 rounded-lg text-xs font-medium transition-all",
                !inCurMon && "opacity-30",
                isActive ? "cursor-pointer" : "cursor-not-allowed",
                // Range fill (behind endpoints)
                inRange && !selected && "bg-teal-50 text-teal-700 rounded-none",
                // Hover for active
                isActive && !selected && "hover:bg-teal-100",
                // Selected / endpoint
                selected && "bg-teal-500 text-white rounded-lg z-10",
                // Non-active text
                !isActive && "text-gray-200",
                // Normal active text
                isActive && !selected && !inRange && "text-gray-800",
              )}
            >
              {d.getDate()}
              {/* Today ring */}
              {today && !selected && (
                <span className="absolute inset-0 rounded-lg ring-2 ring-teal-400 pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
