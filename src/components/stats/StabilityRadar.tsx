import { clsx } from "clsx";
import { CardHeader } from "@/components/common/CardHeader";
import {
  STABILITY_METRICS, STABILITY_METRIC_ORDER, STABILITY_MIN_DENSITY,
  type StabilityResult,
} from "@/lib/statistics/stability";

interface Props {
  results: StabilityResult[];
  lang: string;
}

const SIZE = 300;
const CENTER = SIZE / 2;
const MAX_R = 100;
/** Margin around the SIZE×SIZE drawing space so axis labels at the
 * horizontal extremes (anchored start/end, so their text runs outward
 * rather than being centered on the point) don't clip against the viewBox. */
const PAD = 50;
const RINGS = [20, 40, 60, 80, 100];
const N = STABILITY_METRIC_ORDER.length; // 7 — one axis per metric, hence the star shape
const ANGLE_STEP = (2 * Math.PI) / N;
const START_ANGLE = -Math.PI / 2; // 12 o'clock, matching every other ring/spoke chart in the app

/** Density tiers — identical 80/50 breakpoints to `densityColor` on the Patterns tab. */
function densityColor(d: number): string {
  return d >= 80 ? "#10b981" : d >= 50 ? "#f59e0b" : "#f43f5e";
}

/** Score tiers: a wider "amber" band than density gets, since real logged
 * behaviour clusters in the middle of this scale (see stability.ts's own
 * calibration note) — 80/50 would paint almost everything but weight red. */
function scoreColor(score: number): string {
  return score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#f43f5e";
}

/** Detail-table track sizes: name | avg | wobble | n | score | density dot. */
const TABLE_COLS = "3.25rem minmax(0,1fr) minmax(0,1fr) 1.5rem 1.75rem 0.5rem";

/** Enough precision to be useful without pushing a column out of alignment:
 *  a decimal only where the value is small enough for one to mean anything. */
function fmtVal(v: number): string {
  return v >= 100 ? Math.round(v).toString() : v.toFixed(1);
}

function angleOf(i: number): number {
  return START_ANGLE + i * ANGLE_STEP;
}

function pt(angle: number, r: number): { x: number; y: number } {
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
}

function polygonPoints(radii: number[]): string {
  return radii.map((r, i) => { const p = pt(angleOf(i), r); return `${p.x},${p.y}`; }).join(" ");
}

export function StabilityRadar({ results, lang }: Props) {
  const zh = lang === "zh";
  const byMetric = new Map(results.map(r => [r.metric, r]));
  const ordered = STABILITY_METRIC_ORDER.map(m => byMetric.get(m)!).filter(Boolean);

  // Score polygon: only real (non-insufficient) axes contribute a vertex, so
  // the shape jumps straight across a gap rather than dipping to a false
  // zero there — the wedge drawn separately below is what marks that gap.
  const validIdx = ordered.map((r, i) => ({ r, i })).filter(({ r }) => r.score != null);
  const scorePolygon = validIdx.length >= 2
    ? validIdx.map(({ i, r }) => pt(angleOf(i), (r.score! / 100) * MAX_R)).map(p => `${p.x},${p.y}`).join(" ")
    : null;

  const half = ANGLE_STEP / 2;

  return (
    <div className="card">
      <CardHeader mb="mb-3"
        title={zh ? "穩定星圖" : "Stability"} />
      <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
        {zh
          ? "體重、熱量、三大營養素、飲水、睡眠這七項，各自的日對日波動有多小 — 分數越高代表越穩定，不受長期趨勢影響（例如穩定減脂中的體重下降不算不穩定）。灰底三角形代表這段區間記錄天數不足，無法計算"
          : "How little weight, calories, the three macros, water and sleep each wobble day to day — higher is more stable, and a steady long-term trend (like weight loss on a cut) doesn't count against it. A greyed wedge means too few logged days in range to score"}
      </p>

      <div className="flex justify-center">
        <svg width={SIZE + PAD * 2} height={SIZE + PAD * 2}
          viewBox={`${-PAD} ${-PAD} ${SIZE + PAD * 2} ${SIZE + PAD * 2}`} className="max-w-full">
          {/* Insufficient-data wedges — drawn first, under the grid and polygon */}
          {ordered.map((r, i) => {
            if (r.score != null) return null;
            const a = angleOf(i);
            const p1 = pt(a - half, MAX_R);
            const p2 = pt(a + half, MAX_R);
            return (
              <polygon key={`wedge-${r.metric}`}
                points={`${CENTER},${CENTER} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
                fill={densityColor(r.density)} fillOpacity={0.16} />
            );
          })}

          {/* Grid rings */}
          {RINGS.map(pct => (
            <polygon key={pct}
              points={polygonPoints(Array(N).fill((pct / 100) * MAX_R))}
              fill="none" stroke="var(--surface-border)" strokeWidth={1} />
          ))}

          {/* Spokes */}
          {STABILITY_METRIC_ORDER.map((_, i) => {
            const p = pt(angleOf(i), MAX_R);
            return <line key={i} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke="var(--surface-border)" strokeWidth={1} />;
          })}

          {/* Score polygon */}
          {scorePolygon && (
            <polygon points={scorePolygon} fill="var(--color-secondary)" fillOpacity={0.25}
              stroke="var(--color-secondary)" strokeWidth={2} strokeLinejoin="round" />
          )}

          {/* Vertex dots for scored axes */}
          {ordered.map((r, i) => {
            if (r.score == null) return null;
            const p = pt(angleOf(i), (r.score / 100) * MAX_R);
            return <circle key={`dot-${r.metric}`} cx={p.x} cy={p.y} r={4} fill={scoreColor(r.score)} stroke="var(--surface)" strokeWidth={1.5} />;
          })}

          {/* Axis labels */}
          {ordered.map((r, i) => {
            const a = angleOf(i);
            const p = pt(a, MAX_R + 22);
            const cos = Math.cos(a);
            const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
            const meta = STABILITY_METRICS[r.metric];
            return (
              <text key={`label-${r.metric}`} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle"
                className="text-10 font-semibold" fill="var(--text-on-surface)">
                {zh ? meta.labelZh : meta.labelEn}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-1">
        {[
          { clx: "#10b981", label: zh ? "穩定" : "Stable" },
          { clx: "#f59e0b", label: zh ? "普通" : "Moderate" },
          { clx: "#f43f5e", label: zh ? "波動大" : "Volatile" },
        ].map(({ clx, label }) => (
          <div key={label} className="flex items-center gap-micro">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: clx }} />
            <span className="text-10 text-[var(--text-on-surface-muted)]">{label}</span>
          </div>
        ))}
      </div>

      {/* Detail table. A real column grid rather than one run-on line per row:
          every figure is the same kind of number down its own column, so the
          seven metrics can be compared by scanning a column instead of
          re-reading a sentence. Numerics are tabular so digits line up. */}
      <div className="mt-2 pt-2 border-t border-[var(--surface-border)]">
        <div className="grid items-center gap-2 pb-1.5 text-9 font-semibold uppercase tracking-wide text-[var(--text-on-surface-muted)]"
          style={{ gridTemplateColumns: TABLE_COLS }}>
          <span>{zh ? "項目" : "Metric"}</span>
          <span className="text-right">{zh ? "平均" : "Avg"}</span>
          <span className="text-right">{zh ? "日波動" : "Wobble"}</span>
          <span className="text-right">n</span>
          <span className="text-right">{zh ? "分數" : "Score"}</span>
          <span />
        </div>
        <div className="divide-y divide-[var(--surface-border)]">
          {ordered.map(r => {
            const meta = STABILITY_METRICS[r.metric];
            return (
              <div key={r.metric}
                className={clsx("grid items-center gap-2 py-2", r.score == null && "opacity-70")}
                style={{ gridTemplateColumns: TABLE_COLS }}>
                <span className="text-xs font-medium text-[var(--text-on-surface)] truncate">
                  {zh ? meta.labelZh : meta.labelEn}
                </span>
                {r.score == null ? (
                  <span className="col-span-3 text-11 text-[var(--text-on-surface-muted)] text-right">
                    {zh ? "資料不足" : "insufficient data"}
                  </span>
                ) : (
                  <>
                    <span className="text-11 font-mono tabular-nums text-right text-[var(--text-on-surface-sub)]">
                      {fmtVal(r.mean!)}<span className="text-gray-400">{meta.unit}</span>
                    </span>
                    <span className="text-11 font-mono tabular-nums text-right text-[var(--text-on-surface-sub)]">
                      ±{fmtVal(r.volatility!)}<span className="text-gray-400">{meta.unit}</span>
                    </span>
                    <span className="text-11 font-mono tabular-nums text-right text-gray-400">{r.nDiffs}</span>
                  </>
                )}
                <span className="text-xs font-mono font-bold tabular-nums text-right"
                  style={{ color: r.score != null ? scoreColor(r.score) : undefined }}>
                  {r.score ?? "—"}
                </span>
                <span className="text-base leading-none text-right" style={{ color: densityColor(r.density) }}>●</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-10 text-[var(--text-on-surface-muted)] mt-2">
        {zh ? "資料密度" : "Data density"}: <span style={{ color: densityColor(90) }}>●</span> ≥80% ·{" "}
        <span style={{ color: densityColor(60) }}>●</span> 50–79% ·{" "}
        <span style={{ color: densityColor(10) }}>●</span> {`<${STABILITY_MIN_DENSITY}%`}
      </p>
    </div>
  );
}
