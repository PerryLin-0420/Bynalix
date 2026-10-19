import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { ChartExportButton } from "@/components/common/ChartExportButton";
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

const HIGHER = "#f97316";
const LOWER  = "#0ea5e9";

const DOW_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const DOW_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ROW_COLS = "4.5rem minmax(0,1fr) 4rem";

function fmtVal(v: number, unit: string): string {
  const abs = Math.abs(v);
  const rounded = abs >= 100 ? Math.round(abs) : Math.round(abs * 10) / 10;
  return `${rounded} ${unit}`;
}

/** Decimal hours (possibly ≥ 24 for an after-midnight meal) → "h:mm". */
function fmtClock(h: number): string {
  const wrapped = ((h % 24) + 24) % 24;
  const hh = Math.floor(wrapped);
  const mm = Math.round((wrapped - hh) * 60);
  return mm === 60 ? `${(hh + 1) % 24}:00` : `${hh}:${String(mm).padStart(2, "0")}`;
}

/** Symmetric axis bound: the largest effect, rounded up to a tidy step. */
function niceMax(xs: number[], step: number, floor: number): number {
  const m = Math.max(floor, ...xs.map(Math.abs));
  return Math.ceil(m / step) * step;
}

/**
 * Weekend-vs-weekday effects as diverging horizontal bars, one row per
 * variable that clears the significance gate, with each row expandable into
 * that variable's averaged Mon–Sun curve.
 *
 * Bars, not one curve per variable: the effects live in different units, so
 * the only honest shared axis is the relative difference, and a bar from zero
 * reads that faster than any line. The week curve is where the shape is
 * (Friday already high? only Sunday?), so it sits behind the row, one
 * variable at a time, in that variable's own unit. Clock-time variables get
 * their own bar group in hours, since "% later" of a time of day means nothing.
 *
 * Renders nothing when no effect is significant — that is the normal case for
 * short or weekday-only records, not something to explain.
 */
export function WeekdayPatternChart({ patterns, lang }: { patterns: WeekdayPattern[]; lang: string }) {
  const zh = lang === "zh";
  const [openVar, setOpenVar] = useState<NetVar | null>(null);
  if (patterns.length === 0) return null;

  const rel  = patterns.filter(p => !TIME_VARS.has(p.variable));
  const time = patterns.filter(p => TIME_VARS.has(p.variable));
  const relMax  = niceMax(rel.map(p => p.relPct), 10, 10);
  const timeMax = niceMax(time.map(p => p.diff), 0.5, 0.5);

  const group = (items: WeekdayPattern[], max: number, isTime: boolean, title: string | null) => (
    <div>
      {title && <p className="text-9 font-semibold text-[var(--text-on-surface-muted)] mb-0.5">{title}</p>}
      <div className="divide-y divide-[var(--surface-border)]">
        {items.map(p => {
          const meta = NET_VARS[p.variable];
          const value = isTime ? p.diff : p.relPct;
          const higher = value > 0;
          const pct = Math.min(50, (Math.abs(value) / max) * 50);
          const open = openVar === p.variable;
          const valueTxt = isTime
            ? (zh ? `${higher ? "晚" : "早"} ${fmtVal(p.diff, "hr")}` : `${fmtVal(p.diff, "hr")} ${higher ? "later" : "earlier"}`)
            : `${higher ? "+" : "−"}${Math.abs(Math.round(p.relPct))}%`;
          return (
            <div key={p.variable}>
              <button onClick={() => setOpenVar(open ? null : p.variable)} aria-expanded={open}
                className="w-full grid items-center gap-2 py-1.5 text-left" style={{ gridTemplateColumns: ROW_COLS }}>
                <span className="flex items-center gap-micro min-w-0">
                  <ChevronDown size={12} className={clsx("shrink-0 text-[var(--text-on-surface-muted)] transition-transform", open && "rotate-180")} />
                  <span className="text-xs font-medium text-[var(--text-on-surface)] truncate">{zh ? meta.labelZh : meta.labelEn}</span>
                </span>
                <span className="relative h-3.5">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--surface-border)]" />
                  <span className="absolute top-0.5 bottom-0.5 rounded-sm"
                    style={{
                      background: higher ? HIGHER : LOWER,
                      width: `${pct}%`,
                      ...(higher ? { left: "50%" } : { right: "50%" }),
                    }} />
                </span>
                <span className="text-11 font-mono tabular-nums text-right text-[var(--text-on-surface)]">{valueTxt}</span>
              </button>
              {open && <WeekCurve p={p} isTime={isTime} zh={zh} />}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="card">
      <p className="text-sm font-semibold text-[var(--text-on-surface)] flex items-center gap-micro.5 mb-0.5">
        <Sparkles size={14} className="text-[var(--text-accent)]" />
        {zh ? "週末 vs 平日" : "Weekend vs weekday"}
      </p>
      <p className="text-10 text-[var(--text-on-surface-muted)] mb-2">
        {zh ? "只列出差異顯著的項目 · 點一列看一週平均曲線" : "Significant differences only · tap a row for its average week"}
      </p>

      {/* Axis key: what left and right of the centre line mean */}
      <div className="grid gap-2 text-9 text-[var(--text-on-surface-muted)] mb-1" style={{ gridTemplateColumns: ROW_COLS }}>
        <span />
        <span className="flex justify-between">
          <span><span style={{ color: LOWER }}>◀</span> {zh ? "週末較低／早" : "weekend lower / earlier"}</span>
          <span>{zh ? "較高／晚" : "higher / later"} <span style={{ color: HIGHER }}>▶</span></span>
        </span>
        <span />
      </div>

      <div className="space-y-2">
        {rel.length > 0 && group(rel, relMax, false,
          time.length > 0 ? (zh ? `相對平日（±${relMax}%）` : `vs weekday (±${relMax}%)`) : null)}
        {time.length > 0 && group(time, timeMax, true, zh ? `時間（±${timeMax} 小時）` : `Clock time (±${timeMax} hr)`)}
      </div>
      <ChartExportButton slug="weekday-patterns" />
    </div>
  );
}

/** One variable's average Mon–Sun curve, weekend shaded, weekday mean as the reference. */
function WeekCurve({ p, isTime, zh }: { p: WeekdayPattern; isTime: boolean; zh: boolean }) {
  const unit = VAR_UNIT[p.variable];
  const days = zh ? DOW_ZH : DOW_EN;
  const data = p.byDow.map((d, i) => ({ dow: days[i], v: d?.mean ?? null, n: d?.n ?? 0 }));
  const fmt = (v: number) => isTime ? fmtClock(v) : fmtVal(v, unit);
  const pTxt = p.p < 0.001 ? "<0.001" : p.p.toFixed(3);

  return (
    <div className="pb-2.5 pt-0.5">
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <ReferenceArea x1={days[5]} x2={days[6]} fill="#f3f4f6" fillOpacity={0.9} />
          <ReferenceLine y={p.weekdayMean} stroke="#9ca3af" strokeDasharray="4 3" />
          <XAxis dataKey="dow" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
            width={44} tickFormatter={(v: number) => isTime ? fmtClock(v) : (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1))} />
          <Tooltip
            formatter={(v: number, _k, item: any) => [`${fmt(v)} · n=${item.payload.n}`, zh ? "平均" : "Avg"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
          <Line type="monotone" dataKey="v" stroke={p.diff > 0 ? HIGHER : LOWER} strokeWidth={2}
            connectNulls={false} isAnimationActive={false}
            dot={{ r: 3.5, strokeWidth: 1.5, stroke: "#fff", fill: p.diff > 0 ? HIGHER : LOWER }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-10 text-[var(--text-on-surface-muted)] mt-0.5">
        {zh
          ? `週末平均 ${fmt(p.weekendMean)}，平日 ${fmt(p.weekdayMean)}（虛線） · n=${p.nWeekend}/${p.nWeekday} · p=${pTxt}`
          : `Weekend avg ${fmt(p.weekendMean)}, weekday ${fmt(p.weekdayMean)} (dashed) · n=${p.nWeekend}/${p.nWeekday} · p=${pTxt}`}
      </p>
    </div>
  );
}
