import { clsx } from "clsx";
import { format, parseISO } from "date-fns";
import { CHART_DATE_RANGES } from "@/constants";
import { useLangStore } from "@/store/langStore";
import { MiniCalendar } from "@/components/common/MiniCalendar";
import type { TKey } from "@/lib/i18n";

interface DateRangePillsProps {
  days: number;
  modeCustom: boolean;
  showCustom: boolean;
  onSelectPreset: (d: number) => void;
  onToggleCustom: () => void;
  pillPx?: "px-2.5" | "px-3";
}

export function DateRangePills({
  days, modeCustom, showCustom,
  onSelectPreset, onToggleCustom,
  pillPx = "px-3",
}: DateRangePillsProps) {
  const { t, lang } = useLangStore();
  const dStr = (n: number) => lang === "zh" ? `${n}天` : `${n} days`;
  return (
    <div className="pill-bar overflow-x-auto overscroll-x-contain">
      {CHART_DATE_RANGES.map(({ days: d }) => (
        <button key={d} onClick={() => onSelectPreset(d)}
          className={clsx(`shrink-0 ${pillPx} py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all`,
            !modeCustom && days === d ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
          {dStr(d)}
        </button>
      ))}
      <button onClick={onToggleCustom}
        className={clsx(`shrink-0 ${pillPx} py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all`,
          showCustom || modeCustom ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
        {t("history.custom")}
      </button>
    </div>
  );
}

interface DateRangePickerCardProps {
  customRange: { start: string | null; end: string | null };
  activeDates: Set<string>;
  onRangeChange: (r: { start: string | null; end: string | null }) => void;
  onApply: () => void;
  titleKey: TKey;
  pickStartKey: TKey;
  pickEndKey: TKey;
  applyKey: TKey;
}

export function DateRangePickerCard({
  customRange, activeDates,
  onRangeChange, onApply,
  titleKey, pickStartKey, pickEndKey, applyKey,
}: DateRangePickerCardProps) {
  const { t } = useLangStore();
  return (
    <div className="card space-y-3">
      <p className="text-sm font-semibold text-[var(--text-on-surface)]">{t(titleKey)}</p>
      {!customRange.start || !customRange.end ? (
        <p className="text-xs text-[var(--text-on-surface-muted)]">
          {!customRange.start ? t(pickStartKey) : t(pickEndKey)}
        </p>
      ) : (
        <p className="text-xs text-[var(--text-accent-mid)] font-medium">
          {t("history.selected")}{format(parseISO(customRange.start), "M/d")} — {format(parseISO(customRange.end), "M/d")}
        </p>
      )}
      <MiniCalendar
        activeDates={activeDates}
        mode="range"
        range={customRange}
        onRangeChange={onRangeChange}
      />
      {customRange.start && customRange.end && (
        <button onClick={onApply} className="btn-primary w-full text-sm">
          {t(applyKey)}
        </button>
      )}
    </div>
  );
}
