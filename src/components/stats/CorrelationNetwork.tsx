import { useMemo, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { clsx } from "clsx";
import {
  DOMAIN_COLORS, type CorrelationNetwork as NetworkData,
  type NetEdge, type NetVar, type VarDomain,
} from "@/lib/statistics/network";
import type { Reliability } from "@/lib/statistics/pearson";

const SIZE = 340;           // graph square the node ring is laid out in
const PAD_X = 54;           // extra horizontal viewBox room so labels never clip
const CX = SIZE / 2, CY = SIZE / 2;
const R_NODE_RING = 112;    // node circle radius
const R_LABEL = 138;        // label radius

const POS_COLOR = "#10b981"; // positive correlation
const NEG_COLOR = "#f43f5e"; // negative correlation

const RELIABILITY_LABEL: Record<Reliability, { zh: string; en: string }> = {
  high:         { zh: "高可信", en: "High" },
  medium:       { zh: "中可信", en: "Medium" },
  low:          { zh: "低可信", en: "Low" },
  insufficient: { zh: "資料不足", en: "Insufficient" },
};

const DOMAIN_LABEL: Record<VarDomain, { zh: string; en: string }> = {
  body:     { zh: "身體", en: "Body" },
  diet:     { zh: "飲食", en: "Diet" },
  water:    { zh: "飲水", en: "Water" },
  exercise: { zh: "運動", en: "Exercise" },
  sleep:    { zh: "睡眠", en: "Sleep" },
};

// ── Ring ordering ────────────────────────────────────────────────────────────

const indexOf = (order: NetVar[]) =>
  new Map(order.map((id, i) => [id, i] as const));

/**
 * Count edge crossings for a circular ordering. Two chords cross exactly when
 * one endpoint of the second lies strictly inside the arc spanned by the first;
 * chords sharing an endpoint never cross.
 */
function countCrossings(idx: Map<NetVar, number>, edges: NetEdge[]): number {
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    const a = idx.get(edges[i].source), b = idx.get(edges[i].target);
    if (a == null || b == null) continue;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for (let j = i + 1; j < edges.length; j++) {
      const c = idx.get(edges[j].source), d = idx.get(edges[j].target);
      if (c == null || d == null) continue;
      if (c === a || c === b || d === a || d === b) continue;
      if ((c > lo && c < hi) !== (d > lo && d < hi)) count++;
    }
  }
  return count;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((it, i) => {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) {
      out.push([it, ...rest]);
    }
  });
  return out;
}

/**
 * Lay the connected nodes out around the ring so that domains stay contiguous
 * (grouped) while edge crossings are minimised.
 *
 * With at most 5 domains and 10 variables the search space is tiny, so we can
 * be exhaustive rather than heuristic: fix the first domain (rotations are
 * equivalent on a circle), try every ordering of the remaining domains, and
 * refine each with adjacent same-domain swaps. Fully deterministic — the same
 * data always renders the same graph.
 */
function orderRing(
  connected: NetVar[],
  domainOf: Map<NetVar, VarDomain>,
  edges: NetEdge[],
): NetVar[] {
  if (connected.length < 4) return connected;

  const groups = new Map<VarDomain, NetVar[]>();
  for (const id of connected) {
    const d = domainOf.get(id)!;
    const arr = groups.get(d);
    if (arr) arr.push(id); else groups.set(d, [id]);
  }

  const [head, ...rest] = [...groups.keys()].sort();
  let best = connected;
  let bestScore = Infinity;

  for (const perm of permutations(rest)) {
    let order = [head, ...perm].flatMap(d => groups.get(d)!);
    let score = countCrossings(indexOf(order), edges);
    for (let pass = 0; pass < 3 && score > 0; pass++) {
      let improved = false;
      for (let i = 0; i + 1 < order.length; i++) {
        if (domainOf.get(order[i]) !== domainOf.get(order[i + 1])) continue;
        const cand = [...order];
        [cand[i], cand[i + 1]] = [cand[i + 1], cand[i]];
        const s = countCrossings(indexOf(cand), edges);
        if (s < score) { order = cand; score = s; improved = true; }
      }
      if (!improved) break;
    }
    if (score < bestScore) { bestScore = score; best = order; }
  }
  return best;
}

export function CorrelationNetwork({ network, lang }: {
  network: NetworkData;
  lang: string;
}) {
  const [selNode, setSelNode] = useState<NetVar | null>(null);
  const [selEdge, setSelEdge] = useState<NetEdge | null>(null);

  const { nodes, edges } = network;
  const zh = lang === "zh";

  /**
   * Circular layout. Only variables that actually produced a significant link
   * make it onto the ring — unlinked ones are listed separately below instead
   * of taking up prime space and stretching every edge across the graph. Ring
   * slots are allocated from the connected set (so spacing adapts to how many
   * results there are) and ordered to minimise crossings.
   */
  const { positions, ringNodes, isolatedNodes } = useMemo(() => {
    const degree = new Map<NetVar, number>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const domainOf = new Map(nodes.map(n => [n.id, n.domain] as const));
    const connected = nodes.filter(n => (degree.get(n.id) ?? 0) > 0);
    const isolated  = nodes.filter(n => (degree.get(n.id) ?? 0) === 0);

    const order = orderRing(connected.map(n => n.id), domainOf, edges);
    const byId = new Map(nodes.map(n => [n.id, n] as const));
    const map = new Map<NetVar, { x: number; y: number; angle: number }>();
    order.forEach((id, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / order.length;
      map.set(id, {
        x: CX + R_NODE_RING * Math.cos(angle),
        y: CY + R_NODE_RING * Math.sin(angle),
        angle,
      });
    });
    return {
      positions: map,
      ringNodes: order.map(id => byId.get(id)!),
      isolatedNodes: isolated,
    };
  }, [nodes, edges]);

  const nodeLabel = (id: NetVar) => {
    const n = nodes.find(x => x.id === id);
    return n ? (zh ? n.labelZh : n.labelEn) : id;
  };

  const isEdgeDimmed = (e: NetEdge) =>
    selNode != null && e.source !== selNode && e.target !== selNode;
  const isNodeDimmed = (id: NetVar) => {
    if (selNode == null) return false;
    if (id === selNode) return false;
    return !edges.some(e =>
      (e.source === selNode && e.target === id) || (e.target === selNode && e.source === id));
  };

  const edgeWidth = (r: number) => 0.8 + Math.min(Math.abs(r), 1) * 2.2;

  // Node draw radius (mirrors the value used when rendering the node circle)
  const nodeRadius = (id: NetVar) => {
    const n = nodes.find(x => x.id === id);
    return n ? 8 + Math.min(n.density, 100) / 100 * 6 : 10;
  };

  // Pull point `p` toward `(cx,cy)` by distance `d`. For a quadratic bezier the
  // tangent at an endpoint points exactly at the control point, so this walks
  // along the curve itself.
  const shrink = (p: { x: number; y: number }, cx: number, cy: number, d: number) => {
    const dx = cx - p.x, dy = cy - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
  };

  /**
   * Build an edge's path. The control point is offset *perpendicular* to the
   * chord rather than pulled toward the centre: centre-pulled arcs all funnel
   * through the middle of the graph and pile up on each other, whereas a
   * consistent sideways bow — widened slightly per edge index — keeps chords
   * that would otherwise be collinear as visibly separate arcs.
   *
   * Both endpoints are then trimmed back along the curve to the node rim (with
   * room reserved for the lag arrowhead), so an edge attaches wherever its own
   * curve meets the circle instead of at a fixed anchor point.
   */
  const edgePath = (e: NetEdge, i: number) => {
    const p1 = positions.get(e.source), p2 = positions.get(e.target);
    if (!p1 || !p2) return "";
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = len * 0.16 + (i % 3) * 4;
    const cx = (p1.x + p2.x) / 2 + (-dy / len) * bow;
    const cy = (p1.y + p2.y) / 2 + ( dx / len) * bow;
    const startGap = nodeRadius(e.source) + 2;
    const endGap   = nodeRadius(e.target) + (e.lag > 0 ? edgeWidth(e.r) + 4 : 2);
    const s = shrink(p1, cx, cy, startGap);
    const t = shrink(p2, cx, cy, endGap);
    return `M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`;
  };

  const domainsPresent = [...new Set(ringNodes.map(n => n.domain))];

  if (edges.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-sm text-[var(--text-on-surface-muted)]">
          {zh
            ? "此區間尚無通過顯著性檢定的變因關係（|r| ≥ 0.3、p < 0.05、n ≥ 14）"
            : "No significant variable relationships in this range yet (|r| ≥ 0.3, p < 0.05, n ≥ 14)"}
        </p>
        <p className="text-10 text-[var(--text-on-surface-muted)] mt-1">
          {zh ? "持續記錄更多天數以解鎖" : "Keep logging to unlock"}
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-[var(--text-on-surface)]">
          {zh ? "變因關係網絡" : "Variable Network"}
        </p>
        <span className="text-10 text-[var(--text-on-surface-muted)]">
          {zh ? "相關 ≠ 因果" : "Correlation ≠ causation"}
        </span>
      </div>
      <p className="text-10 text-[var(--text-on-surface-muted)] mb-2">
        {zh
          ? "以每日「變化量」計算 Spearman 相關 · 點節點聚焦、點連線看散點"
          : "Spearman on day-over-day changes · tap a node to focus, tap an edge for the scatter"}
      </p>

      <svg viewBox={`${-PAD_X} 0 ${SIZE + PAD_X * 2} ${SIZE}`}
        className="w-full max-w-sm mx-auto block select-none">
        <defs>
          <marker id="net-arrow-pos" viewBox="0 0 8 8" refX="7" refY="4"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill={POS_COLOR} />
          </marker>
          <marker id="net-arrow-neg" viewBox="0 0 8 8" refX="7" refY="4"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill={NEG_COLOR} />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const color = e.r >= 0 ? POS_COLOR : NEG_COLOR;
          const dimmed = isEdgeDimmed(e);
          const selected = selEdge === e;
          return (
            <g key={i} opacity={dimmed ? 0.08 : 1} style={{ transition: "opacity .2s" }}>
              <path d={edgePath(e, i)} fill="none" stroke={color}
                strokeWidth={edgeWidth(e.r) + (selected ? 1 : 0)}
                strokeDasharray={e.lag > 0 ? "6 4" : undefined}
                strokeLinecap="round"
                markerEnd={e.lag > 0 ? `url(#net-arrow-${e.r >= 0 ? "pos" : "neg"})` : undefined}
                opacity={selected ? 1 : 0.75} />
              {/* invisible wide hit area */}
              <path d={edgePath(e, i)} fill="none" stroke="transparent" strokeWidth={14}
                style={{ cursor: "pointer" }}
                onClick={() => { setSelEdge(selected ? null : e); }} />
            </g>
          );
        })}

        {/* Nodes (only those carrying at least one significant link) */}
        {ringNodes.map(n => {
          const pos = positions.get(n.id)!;
          const dimmed = isNodeDimmed(n.id);
          const selected = selNode === n.id;
          const rNode = 8 + Math.min(n.density, 100) / 100 * 6; // 8–14 by density
          const labelX = CX + R_LABEL * Math.cos(pos.angle);
          const labelY = CY + R_LABEL * Math.sin(pos.angle);
          const anchor = Math.abs(Math.cos(pos.angle)) < 0.35
            ? "middle" : Math.cos(pos.angle) > 0 ? "start" : "end";
          return (
            <g key={n.id} opacity={dimmed ? 0.2 : 1} style={{ transition: "opacity .2s", cursor: "pointer" }}
              onClick={() => { setSelNode(selected ? null : n.id); setSelEdge(null); }}>
              <circle cx={pos.x} cy={pos.y} r={rNode}
                fill={DOMAIN_COLORS[n.domain]}
                stroke={selected ? "var(--text-on-surface)" : "var(--surface)"}
                strokeWidth={selected ? 2.5 : 1.5} />
              <text x={labelX} y={labelY} textAnchor={anchor} dominantBaseline="middle"
                fontSize={11} fontWeight={selected ? 700 : 500}
                fill="var(--text-on-surface)">
                {zh ? n.labelZh : n.labelEn}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
        {domainsPresent.map(d => (
          <span key={d} className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)]">
            <span className="w-2 h-2 rounded-full" style={{ background: DOMAIN_COLORS[d] }} />
            {zh ? DOMAIN_LABEL[d].zh : DOMAIN_LABEL[d].en}
          </span>
        ))}
        <span className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)]">
          <span className="inline-block w-4 h-0.5 rounded" style={{ background: POS_COLOR }} />
          {zh ? "正相關" : "Positive"}
        </span>
        <span className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)]">
          <span className="inline-block w-4 h-0.5 rounded" style={{ background: NEG_COLOR }} />
          {zh ? "負相關" : "Negative"}
        </span>
        <span className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)]">
          <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          {zh ? "延遲影響（箭頭=方向）" : "Lagged (arrow = direction)"}
        </span>
      </div>

      {/* Variables with no significant link — listed instead of drawn, so the
          graph only carries variables that actually produced a result */}
      {isolatedNodes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--surface-border)]">
          <p className="text-10 text-[var(--text-on-surface-muted)] mb-1.5">
            {zh ? "此區間無顯著關聯" : "No significant link in this range"}
          </p>
          <div className="flex flex-wrap gap-1">
            {isolatedNodes.map(n => (
              <span key={n.id}
                className="flex items-center gap-1 text-10 text-[var(--text-on-surface-muted)] rounded-full border border-[var(--surface-border)] px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: DOMAIN_COLORS[n.domain] }} />
                {zh ? n.labelZh : n.labelEn}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Edge detail: scatter of differenced pairs */}
      {selEdge && (
        <div className="mt-3 pt-3 border-t border-[var(--surface-border)]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-[var(--text-on-surface)]">
              {nodeLabel(selEdge.source)}
              {selEdge.lag > 0
                ? <span className="text-[var(--text-accent)]"> {zh ? `領先 ${selEdge.lag} 天 →` : ` leads by ${selEdge.lag}d →`} </span>
                : <span className="text-[var(--text-on-surface-muted)]"> ↔ </span>}
              {nodeLabel(selEdge.target)}
            </p>
            <button onClick={() => setSelEdge(null)}
              className="text-10 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
              {zh ? "關閉" : "Close"}
            </button>
          </div>
          <p className="text-10 text-[var(--text-on-surface-muted)] mb-2">
            r = <span className={clsx("font-bold", selEdge.r >= 0 ? "text-emerald-500" : "text-rose-500")}>{selEdge.r.toFixed(2)}</span>
            {" · "}n = {selEdge.n}
            {" · "}p = {selEdge.p < 0.001 ? "<0.001" : selEdge.p.toFixed(3)}
            {" · "}{zh ? RELIABILITY_LABEL[selEdge.reliability].zh : RELIABILITY_LABEL[selEdge.reliability].en}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis type="number" dataKey="x" name={nodeLabel(selEdge.source)}
                tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
                axisLine={false} tickLine={false}
                label={{ value: `Δ ${nodeLabel(selEdge.source)}`, position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--text-on-surface-muted)" }} />
              <YAxis type="number" dataKey="y" name={nodeLabel(selEdge.target)}
                tick={{ fontSize: 9, fill: "var(--text-on-surface-muted)" }}
                axisLine={false} tickLine={false} />
              <ReferenceLine x={0} stroke="var(--surface-border)" />
              <ReferenceLine y={0} stroke="var(--surface-border)" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as { x: number; y: number; date: string };
                  return (
                    <div className="bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl px-2.5 py-1.5 text-10 shadow-lg">
                      <p className="font-semibold text-[var(--text-on-surface)]">{d.date}</p>
                      <p className="text-[var(--text-on-surface-muted)]">Δ{nodeLabel(selEdge.source)}: {d.x.toFixed(1)}</p>
                      <p className="text-[var(--text-on-surface-muted)]">Δ{nodeLabel(selEdge.target)}: {d.y.toFixed(1)}</p>
                    </div>
                  );
                }} />
              <Scatter data={selEdge.pairs} fill={selEdge.r >= 0 ? POS_COLOR : NEG_COLOR} fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-10 text-[var(--text-on-surface-muted)] mt-1">
            {zh
              ? "每點為一天：X = 前者的當日變化，Y = 後者的當日變化"
              : "Each dot is one day: X = day-over-day change of the first variable, Y = the second"}
          </p>
        </div>
      )}
    </div>
  );
}
