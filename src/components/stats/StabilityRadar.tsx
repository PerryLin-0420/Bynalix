import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { CardHeader } from "@/components/common/CardHeader";
import { ChartExportButton } from "@/components/common/ChartExportButton";
import {
  STABILITY_METRICS, STABILITY_METRIC_ORDER, STABILITY_MIN_DENSITY,
  STABILITY_MIN_DIFFS, STABILITY_REFERENCE_CV,
  type StabilityResult,
} from "@/lib/statistics/stability";

interface Props {
  results: StabilityResult[];
  lang: string;
}

const SIZE = 300;
const CENTER = SIZE / 2;
const MAX_R = 100;
/**
 * Margin around the SIZE×SIZE drawing space. Only the horizontal extremes
 * need room: those labels are anchored start/end so their text runs outward
 * from the point and would clip against the viewBox, while the top and bottom
 * ones are centred and sit well inside it. Padding both axes equally left the
 * chart floating in a tall band of white — obvious once the card is exported
 * as an image.
 */
const PAD_X = 50;
const PAD_Y = 6;
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
const TABLE_COLS = "3.5rem minmax(0,1fr) minmax(0,1fr) 1.5rem 1.75rem 0.5rem";

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
  // the shape jumps straight across a gap rather than dipping to a false zero
  // there. An unscored axis is marked by its muted label and by "資料不足" in
  // the table below — nothing is painted into the plot area for it, because a
  // filled wedge competes with the shape itself for attention and says
  // something the density column already says better.
  const validIdx = ordered.map((r, i) => ({ r, i })).filter(({ r }) => r.score != null);
  const scorePolygon = validIdx.length >= 2
    ? validIdx.map(({ i, r }) => pt(angleOf(i), (r.score! / 100) * MAX_R)).map(p => `${p.x},${p.y}`).join(" ")
    : null;

  return (
    <>
    <div className="card">
      <CardHeader mb="mb-1"
        title={zh ? "穩定星圖" : "Stability"} />
      <p className="text-10 text-[var(--text-on-surface-muted)] mb-3">
        {zh ? "七項核心數字的日對日波動 — 分數越高越穩定" : "Day-to-day wobble across seven core metrics — higher is steadier"}
      </p>

      <div className="flex justify-center">
        <svg width={SIZE + PAD_X * 2} height={SIZE + PAD_Y * 2}
          viewBox={`${-PAD_X} ${-PAD_Y} ${SIZE + PAD_X * 2} ${SIZE + PAD_Y * 2}`} className="max-w-full h-auto">
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
                className="text-10 font-semibold"
                fill={r.score == null ? "var(--text-on-surface-muted)" : "var(--text-on-surface)"}
                fillOpacity={r.score == null ? 0.55 : 1}>
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
                <span className="text-xs font-medium text-[var(--text-on-surface)] whitespace-nowrap">
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
      <ChartExportButton slug="stability" />
    </div>

    <StabilityGuide zh={zh} />
    </>
  );
}

// ── How to read the chart ────────────────────────────────────────────────────

/** One titled block of the guide: a rule on the left, the explanation right. */
function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[var(--surface-border)] pl-3">
      <p className="text-11 font-semibold text-[var(--text-on-surface)] mb-1">{title}</p>
      <div className="space-y-1 text-10 leading-relaxed text-[var(--text-on-surface-muted)]">{children}</div>
    </div>
  );
}

/**
 * The chart's own explanation, given its own card rather than crowding the
 * header: three separate things need saying (what the number means, what a
 * greyed wedge means, what each table column is), and as one paragraph above
 * the chart they were a wall of text nobody reads before the picture.
 */
function StabilityGuide({ zh }: { zh: boolean }) {
  const halving = STABILITY_REFERENCE_CV;
  const columns: [string, string][] = zh
    ? [
      ["平均", "該項目在這段區間的平均值，也是相對波動的分母"],
      ["日波動", "相鄰兩天差值的標準差 — 每天平均跳動多少"],
      ["n", "實際用到的「連續兩天都有記錄」配對數"],
      ["分數", "0–100，由相對波動換算"],
      ["●", "資料密度，與其他統計頁面同一組顏色"],
    ]
    : [
      ["Avg", "Mean value over the range — the denominator of relative wobble"],
      ["Wobble", "Stdev of consecutive-day differences — the typical daily jump"],
      ["n", "Consecutive-day pairs actually used"],
      ["Score", "0–100, converted from relative wobble"],
      ["●", "Data density, same colours as the other stats pages"],
    ];

  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      {/* The whole header is the toggle: on a phone a chevron alone is a
          small target, and there is nothing else in this card to tap. */}
      <button onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left">
        <span className="text-sm font-semibold text-[var(--text-on-surface)]">
          {zh ? "怎麼看這張圖" : "How to read this"}
        </span>
        <ChevronDown size={16}
          className={clsx("shrink-0 text-[var(--text-on-surface-muted)] transition-transform",
            open && "rotate-180")} />
      </button>

      {open && <div className="space-y-3.5 mt-3">
        <GuideSection title={zh ? "分數＝日對日波動有多小" : "The score is how little it wobbles day to day"}>
          <p>
            {zh
              ? "取每天與前一天的差當作波動，再除以整體平均，得到與單位無關的「相對波動」。相對波動每增加 " + halving + "，分數就減半。"
              : `Each day's change from the day before is the wobble; dividing by the overall mean makes it unit-free. Every ${halving} of relative wobble halves the score.`}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {[[0, 100], [halving, 50], [halving * 2, 25]].map(([cv, sc]) => (
              <span key={cv} className="rounded-lg bg-[var(--surface-container-low)] px-2 py-1 font-mono tabular-nums text-10">
                {cv.toFixed(1)} → <span className="font-bold" style={{ color: scoreColor(sc) }}>{sc}</span>
              </span>
            ))}
          </div>
          <p>
            {zh
              ? "因為看的是「差」而不是整段的變異，長期趨勢不會被算成不穩定 — 穩定減脂中一路下降的體重仍然是高分。"
              : "Because it reads differences rather than spread around the mean, a long-term trend doesn't count as instability — weight falling steadily on a cut still scores high."}
          </p>
        </GuideSection>

        <GuideSection title={zh ? "資料不足的項目不給分" : "A metric without enough data isn't scored"}>
          <p>
            {zh
              ? `記錄天數低於區間的 ${STABILITY_MIN_DENSITY}%，或「連續兩天都有記錄」不足 ${STABILITY_MIN_DIFFS} 次，就不計分（與其他統計頁面同一道門檻）。`
              : `Fewer than ${STABILITY_MIN_DENSITY}% of the range's days logged, or under ${STABILITY_MIN_DIFFS} consecutive-day pairs, and it is left unscored — the same gate the other stats pages use.`}
          </p>
          <p>
            {zh
              ? "這種項目的軸標籤會變淡，星形直接跨過那個角，而不是掉到 0 — 沒有資料不等於不穩定。實際的資料密度看下方表格最右邊的色點。"
              : "Its axis label is dimmed and the star jumps straight across that axis instead of dipping to zero — missing data is not the same as instability. The actual density is the coloured dot at the right of the table below."}
          </p>
        </GuideSection>

        <GuideSection title={zh ? "下方表格的欄位" : "The columns below"}>
          <dl className="grid gap-x-2.5 gap-y-1" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}>
            {columns.map(([term, desc]) => (
              <Fragment key={term}>
                <dt className="text-10 font-semibold text-[var(--text-on-surface)] text-right whitespace-nowrap">{term}</dt>
                <dd className="text-10">{desc}</dd>
              </Fragment>
            ))}
          </dl>
        </GuideSection>
      </div>}
    </div>
  );
}
