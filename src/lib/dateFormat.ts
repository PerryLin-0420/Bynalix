import { format, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";

const locale = (lang: string) => lang === "zh" ? zhTW : undefined;

/** "M/d EEE" — short day label, e.g. "5/23 Fri" / "5/23 五" */
export function fmtDay(d: string, lang: string): string {
  return format(parseISO(d), "M/d EEE", { locale: locale(lang) });
}

/** "M/d (EEEE)" / "MMM d (EEEE)" — full weekday drawer header */
export function fmtWeekdayHeader(d: string, lang: string): string {
  try {
    return lang === "zh"
      ? format(parseISO(d), "M/d (EEEE)", { locale: zhTW })
      : format(parseISO(d), "MMM d (EEEE)");
  } catch {
    return d;
  }
}
