import { Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { NET_VARS, type NetVar, type WeekdayPattern } from "@/lib/statistics/network";

const VAR_UNIT: Record<NetVar, string> = {
  weight_kg: "kg", calories: "kcal", protein_g: "g", carb_g: "g", fat_g: "g",
  water_ml: "ml", exercise_min: "min", exercise_kcal: "kcal",
  strength_volume_kg: "kg", sleep_hours: "hr",
  // Rolling weekly counts — excluded from weekday patterns, listed for completeness
  strength_freq_wk: "x/wk", cardio_freq_wk: "x/wk",
  last_meal_hour: "hr", exercise_hour: "hr", wake_hour: "hr",
  eating_window_h: "hr", max_meal_gap_h: "hr",
};

/**
 * Clock-style variables read as later/earlier, not higher/lower. Meal spacing
 * is measured in hours too but is a duration, so it stays out: a longer eating
 * window is longer, not "later".
 */
const TIME_VARS = new Set<NetVar>(["last_meal_hour", "exercise_hour", "wake_hour"]);

function fmtDiff(v: number, unit: string): string {
  const abs = Math.abs(v);
  const rounded = abs >= 100 ? Math.round(abs) : Math.round(abs * 10) / 10;
  return `${rounded} ${unit}`;
}

/**
 * "One-liner" weekend-vs-weekday pattern cards. Top N significant effects.
 *
 * Renders nothing at all when no effect clears the significance gate — missing
 * weekend data is normal and expected, so an explanatory placeholder would just
 * be noise on most days.
 */
export function WeekdayPatternCards({ patterns, lang, maxCards = 4 }: {
  patterns: WeekdayPattern[];
  lang: string;
  maxCards?: number;
}) {
  const zh = lang === "zh";
  const shown = patterns.slice(0, maxCards);
  if (shown.length === 0) return null;

  return (
    <div className="card space-y-2">
      <p className="text-xs font-semibold text-[var(--text-on-surface)] flex items-center gap-micro.5">
        <Sparkles size={13} className="text-[var(--text-accent)]" />
        {zh ? "發現的規律" : "Discovered Patterns"}
        <span className="font-normal text-10 text-[var(--text-on-surface-muted)]">
          {zh ? "週末 vs 平日" : "weekend vs weekday"}
        </span>
      </p>
      {shown.map(p => {
        const meta = NET_VARS[p.variable];
        const label = zh ? meta.labelZh : meta.labelEn;
        const unit = VAR_UNIT[p.variable];
        const higher = p.diff > 0;
        const isTime = TIME_VARS.has(p.variable);
        const pctTxt = `${Math.abs(Math.round(p.relPct))}%`;
        return (
          <div key={p.variable}
            className="flex items-start gap-2 px-3 py-2 rounded-xl bg-[var(--surface-container-low)]">
            <span className={clsx("text-sm font-bold shrink-0 mt-px",
              higher ? "text-orange-500" : "text-sky-500")}>
              {higher ? "↑" : "↓"}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-on-surface)]">
                {zh
                  ? (isTime
                    ? <>週末的<span className="font-semibold">{label}</span>平均比平日{higher ? "晚" : "早"} <span className="font-semibold">{fmtDiff(p.diff, unit)}</span></>
                    : <>週末的<span className="font-semibold">{label}</span>平均比平日{higher ? "高" : "低"} <span className="font-semibold">{pctTxt}</span>（{higher ? "+" : "−"}{fmtDiff(p.diff, unit)}）</>)
                  : (isTime
                    ? <>Weekend <span className="font-semibold">{label.toLowerCase()}</span> averages <span className="font-semibold">{fmtDiff(p.diff, unit)}</span> {higher ? "later" : "earlier"} than weekdays</>
                    : <>Weekend <span className="font-semibold">{label.toLowerCase()}</span> averages <span className="font-semibold">{pctTxt}</span> {higher ? "higher" : "lower"} than weekdays ({higher ? "+" : "−"}{fmtDiff(p.diff, unit)})</>)}
              </p>
              <p className="text-10 text-[var(--text-on-surface-muted)] mt-0.5">
                {zh
                  ? `週末 n=${p.nWeekend} · 平日 n=${p.nWeekday} · p=${p.p < 0.001 ? "<0.001" : p.p.toFixed(3)}`
                  : `weekend n=${p.nWeekend} · weekday n=${p.nWeekday} · p=${p.p < 0.001 ? "<0.001" : p.p.toFixed(3)}`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
