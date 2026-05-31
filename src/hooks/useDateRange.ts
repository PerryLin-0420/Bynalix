import { useState } from "react";
import { format, subDays } from "date-fns";

export function useDateRange(defaultDays: number) {
  const [days, setDays]               = useState(defaultDays);
  const [showCustom, setShowCustom]   = useState(false);
  const [customRange, setCustomRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [modeCustom, setModeCustom]   = useState(false);

  const getFromTo = (): { from: string; to: string } => {
    if (modeCustom && customRange.start && customRange.end)
      return { from: customRange.start, to: customRange.end };
    return {
      from: format(subDays(new Date(), days - 1), "yyyy-MM-dd"),
      to:   format(new Date(), "yyyy-MM-dd"),
    };
  };

  const rangeTotal = modeCustom && customRange.start && customRange.end
    ? Math.round((new Date(customRange.end).getTime() - new Date(customRange.start).getTime()) / 86400000) + 1
    : days;

  const selectPreset = (d: number) => {
    setDays(d);
    setModeCustom(false);
    setShowCustom(false);
    setCustomRange({ start: null, end: null });
  };

  return {
    days,
    showCustom, setShowCustom,
    customRange, setCustomRange,
    modeCustom, setModeCustom,
    getFromTo, rangeTotal, selectPreset,
  };
}
