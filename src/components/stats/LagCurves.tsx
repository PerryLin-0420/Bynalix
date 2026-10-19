import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { CardHeader } from "@/components/common/CardHeader";
import { ChartExportButton } from "@/components/common/ChartExportButton";
import type { LagResult } from "@/lib/statistics/pearson";

export interface LagCurveRow {
  factor: string;
  label: string;
  /** One point per lag that cleared the pair minimum, ordered by lag (0..maxLag). */
  curve: LagResult[];
  best: LagResult | null;
  density: number;
}

interface Props {
  rows: LagCurveRow[];
  /** Whether a correlation of this sign moves weight toward the user's goal. */
  isGood: (r: number) => boolean;
  maxLag: number;
  lang: string;
}

/** |r| at or below this is read as "no relationship" — same cut the rest of the stats page uses. */
const NOISE_R = 0.1;

const GOOD = "#10b981";
const BAD  = "#f43f5e";
const FLAT = "#9ca3af";

const densityColor = (d: number) => d >= 80 ? "#10b981" : d >= 50 ? "#f59e0b" : "#f43f5e";

/** Mini-chart geometry (SVG user units; it scales to the row width). */
const W = 120;
const H = 44;
const PAD = 4;

/**
 * Shared y-range for every row. A per-row scale would make a ±0.08 wiggle look
 * as dramatic as a ±0.5 effect — the whole point of stacking the curves is to
 * compare them, so they all sit on one scale, rounded up to the next 0.1.
 */
function sharedDomain(rows: LagCurveRow[]): number {
  let m = 0.3;
  for (const row of rows) for (const p of row.curve) m = Math.max(m, Math.abs(p.r));
  return Math.min(1, Math.ceil(m * 10) / 10);
}

function lagText(lag: number, zh: boolean): string {
  if (lag === 0) return zh ? "當天" : "same day";
  return zh ? `${lag} 天後` : `${lag}d later`;
}

/**
 * Lag profile per factor, as small multiples: one tiny r-over-lag curve per
 * row, all on the same y-scale, sorted by the strength of their peak.
 *
 * One overlaid line chart was the obvious alternative and the wrong one — with
 * ten factors it becomes spaghetti that needs ten categorical colours, and the
 * colour is then spent on identity instead of on what matters here, whether a
 * point helps or hurts the goal. A factor×lag heatmap is more compact but turns
 * the shape (rising, peaking, fading) into shades nobody can compare by eye.
 * Small multiples keep the curve shape, need no legend, and leave colour free
 * for the goal verdict.
 */
export function LagCurves({ rows, isGood, maxLag, lang }: Props) {
  const zh = lang === "zh";
  const [openId, setOpenId] = useState<string | null>(null);
  const dom = sharedDomain(rows);

  const sorted = [...rows].sort((a, b) =>
    (b.best ? Math.abs(b.best.r) : -1) - (a.best ? Math.abs(a.best.r) : -1));

  const xOf = (lag: number) => PAD + (lag / maxLag) * (W - PAD * 2);
  const yOf = (r: number) => H / 2 - (r / dom) * (H / 2 - PAD);
  const pointColor = (r: number) => Math.abs(r) <= NOISE_R ? FLAT : isGood(r) ? GOOD : BAD;

  return (
    <div className="card">
      <CardHeader mb="mb-1" title={zh ? "延遲影響曲線 → 體重變化" : "Lag curves → weight change"} />
      <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
        {zh
          ? `與 0–${maxLag} 天後 3 日體重變化的相關 r · 峰值＝影響最明顯的那天`
          : `r against the 3-day weight change 0–${maxLag} days later · the peak is when it shows most`}
      </p>

      {/* Column header — the mini-chart axis is shared, so it is labelled once. */}
      <div className="grid items-end gap-2 pb-1 text-9 font-semibold text-[var(--text-on-surface-muted)]"
        style={{ gridTemplateColumns: "4.5rem minmax(0,1fr) 4.25rem 0.5rem" }}>
        <span>{zh ? "項目" : "Factor"}</span>
        <span className="flex justify-between px-0.5">
          <span>{zh ? "當天" : "0d"}</span>
          <span className="opacity-70">r ±{dom.toFixed(1)}</span>
          <span>{maxLag}d</span>
        </span>
        <span className="text-right">{zh ? "峰值" : "Peak"}</span>
        <span />
      </div>

      <div className="divide-y divide-[var(--surface-border)]">
        {sorted.map(row => {
          const { best } = row;
          const open = openId === row.factor;
          const peakClr = best ? pointColor(best.r) : FLAT;
          // Contiguous runs only — a lag that fell under the pair minimum is a
          // gap in the line, not a point interpolated across.
          const segments: LagResult[][] = [];
          for (const p of row.curve) {
            const last = segments[segments.length - 1];
            if (last && p.lag === last[last.length - 1].lag + 1) last.push(p);
            else segments.push([p]);
          }
          return (
            <div key={row.factor}>
              <button onClick={() => setOpenId(open ? null : row.factor)} aria-expanded={open}
                className={clsx("w-full grid items-center gap-2 py-2 text-left", !best && "opacity-60")}
                style={{ gridTemplateColumns: "4.5rem minmax(0,1fr) 4.25rem 0.5rem" }}>
                <span className="flex items-center gap-micro min-w-0">
                  <ChevronDown size={12} className={clsx("shrink-0 text-[var(--text-on-surface-muted)] transition-transform", open && "rotate-180")} />
                  <span className="text-xs font-medium text-[var(--text-on-surface)] truncate">{row.label}</span>
                </span>

                {best ? (
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-11 block">
                    {/* No-effect band and zero line */}
                    <rect x={0} y={yOf(NOISE_R)} width={W} height={yOf(-NOISE_R) - yOf(NOISE_R)}
                      fill="var(--surface-container-low, #f3f4f6)" />
                    <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--surface-border, #e5e7eb)"
                      strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    {segments.map((seg, i) => (
                      <polyline key={i} points={seg.map(p => `${xOf(p.lag)},${yOf(p.r)}`).join(" ")}
                        fill="none" stroke="var(--text-on-surface-sub)" strokeWidth={1.5}
                        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    ))}
                    {/* Peak marker as a vertical tick, since circles would stretch with the row width */}
                    <line x1={xOf(best.lag)} x2={xOf(best.lag)} y1={H / 2} y2={yOf(best.r)}
                      stroke={peakClr} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : (
                  <span className="text-11 text-[var(--text-on-surface-muted)] text-center">
                    {zh ? "資料不足" : "insufficient data"}
                  </span>
                )}

                <span className="flex flex-col items-end leading-tight">
                  {best ? (
                    <>
                      <span className="text-xs font-mono font-bold tabular-nums" style={{ color: peakClr }}>
                        {best.r >= 0 ? "+" : ""}{best.r.toFixed(2)}
                      </span>
                      <span className="text-10 text-[var(--text-on-surface-muted)]">{lagText(best.lag, zh)}</span>
                    </>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </span>
                <span className="text-base leading-none text-right" style={{ color: densityColor(row.density) }}>●</span>
              </button>

              {open && <LagDetail row={row} maxLag={maxLag} dom={dom} zh={zh}
                pointColor={pointColor} isGood={isGood} />}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-[var(--surface-border)] text-10 text-[var(--text-on-surface-muted)]">
        {[
          { c: GOOD, l: zh ? "有助目標" : "Supports goal" },
          { c: BAD,  l: zh ? "不利目標" : "Works against" },
          { c: FLAT, l: zh ? `無明顯關聯 (|r|≤${NOISE_R})` : `No clear link (|r|≤${NOISE_R})` },
        ].map(({ c, l }) => (
          <span key={l} className="flex items-center gap-micro">
            <span className="w-2.5 h-[3px] rounded-full inline-block" style={{ background: c }} />{l}
          </span>
        ))}
        <span>
          {zh ? "密度" : "Density"}: <span style={{ color: densityColor(90) }}>●</span>≥80%{" "}
          <span style={{ color: densityColor(60) }}>●</span>50–79%{" "}
          <span style={{ color: densityColor(10) }}>●</span>&lt;50%
        </span>
      </div>
      <ChartExportButton slug="lag-curves" />
    </div>
  );
}

/** Full-size curve for one factor: real axes, per-lag sample size, and a sentence reading it. */
function LagDetail({ row, maxLag, dom, zh, pointColor, isGood }: {
  row: LagCurveRow;
  maxLag: number;
  dom: number;
  zh: boolean;
  pointColor: (r: number) => string;
  isGood: (r: number) => boolean;
}) {
  const byLag = new Map(row.curve.map(p => [p.lag, p]));
  const data = Array.from({ length: maxLag + 1 }, (_, lag) => {
    const p = byLag.get(lag);
    return { lag, r: p ? p.r : null, n: p?.sampleSize ?? 0 };
  });
  const best = row.best;

  const summary = !best
    ? (zh ? "可用的配對天數不足，無法計算。" : "Not enough paired days to compute.")
    : Math.abs(best.r) <= NOISE_R
      ? (zh ? `${row.label}在 0–${maxLag} 天內都看不出與體重變化的明顯關聯。`
            : `${row.label} shows no clear link to weight change at any delay from 0 to ${maxLag} days.`)
      : zh
        ? `${row.label}的影響在${best.lag === 0 ? "當天" : `約 ${best.lag} 天後`}最明顯（r=${best.r >= 0 ? "+" : ""}${best.r.toFixed(2)}），方向${isGood(best.r) ? "有助" : "不利"}目前目標。`
        : `${row.label} shows most ${best.lag === 0 ? "on the same day" : `about ${best.lag} days later`} (r=${best.r >= 0 ? "+" : ""}${best.r.toFixed(2)}), in the direction that ${isGood(best.r) ? "supports" : "works against"} your goal.`;

  return (
    <div className="pb-3 pt-1">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <ReferenceArea y1={-NOISE_R} y2={NOISE_R} fill="#f3f4f6" fillOpacity={0.8} />
          <ReferenceLine y={0} stroke="#d1d5db" />
          <XAxis dataKey="lag" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false}
            tickFormatter={(v: number) => v === 0 ? (zh ? "當天" : "0d") : `${v}d`} />
          <YAxis domain={[-dom, dom]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
            tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip
            formatter={(v: number, _k, item: any) => [`${v >= 0 ? "+" : ""}${v.toFixed(3)} · n=${item.payload.n}`, "r"]}
            labelFormatter={(l: number) => lagText(l, zh)}
            contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
          <Line type="monotone" dataKey="r" stroke="#6b7280" strokeWidth={2} connectNulls={false}
            isAnimationActive={false}
            dot={(p: any) => p.payload.r == null ? <g key={p.key} /> : (
              <circle key={p.key} cx={p.cx} cy={p.cy} r={best && p.payload.lag === best.lag ? 5 : 3.5}
                fill={pointColor(p.payload.r)} stroke="#fff" strokeWidth={1.5} />
            )}
            activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-11 text-[var(--text-on-surface-sub)] mt-1">{summary}</p>
    </div>
  );
}
