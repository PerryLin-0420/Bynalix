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

const SIZE = 340;           // viewBox square
const CX = SIZE / 2, CY = SIZE / 2;
const R_NODE_RING = 118;    // node circle radius
const R_LABEL = 148;        // label radius

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

export function CorrelationNetwork({ network, lang }: {
  network: NetworkData;
  lang: string;
}) {
  const [selNode, setSelNode] = useState<NetVar | null>(null);
  const [selEdge, setSelEdge] = useState<NetEdge | null>(null);

  const { nodes, edges } = network;
  const zh = lang === "zh";

  // Circular layout: deterministic positions, grouped so same-domain nodes sit together
  const positions = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => a.domain.localeCompare(b.domain));
    const map = new Map<NetVar, { x: number; y: number; angle: number }>();
    sorted.forEach((n, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sorted.length;
      map.set(n.id, {
        x: CX + R_NODE_RING * Math.cos(angle),
        y: CY + R_NODE_RING * Math.sin(angle),
        angle,
      });
    });
    return map;
  }, [nodes]);

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

  const edgeWidth = (r: number) => 1 + Math.min(Math.abs(r), 1) * 3.5;

  // Node draw radius (mirrors the value used when rendering the node circle)
  const nodeRadius = (id: NetVar) => {
    const n = nodes.find(x => x.id === id);
    return n ? 8 + Math.min(n.density, 100) / 100 * 6 : 10;
  };

  // Pull point `p` toward `(cx,cy)` by distance `d` — approximates walking along
  // the quadratic bezier's tangent near its endpoints.
  const shrink = (p: { x: number; y: number }, cx: number, cy: number, d: number) => {
    const dx = cx - p.x, dy = cy - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
  };

  // Quadratic bezier control point pulled toward center for a gentle curve.
  // Endpoints are trimmed back to each node's rim (plus room for the lag
  // arrowhead) so the line and arrow sit outside the nodes instead of being
  // hidden beneath the circles that are drawn on top.
  const edgePath = (e: NetEdge) => {
    const p1 = positions.get(e.source), p2 = positions.get(e.target);
    if (!p1 || !p2) return "";
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const cx = mx + (CX - mx) * 0.35, cy = my + (CY - my) * 0.35;
    const startGap = nodeRadius(e.source) + 2;
    const endGap   = nodeRadius(e.target) + (e.lag > 0 ? edgeWidth(e.r) + 4 : 2);
    const s = shrink(p1, cx, cy, startGap);
    const t = shrink(p2, cx, cy, endGap);
    return `M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`;
  };

  const domainsPresent = [...new Set(nodes.map(n => n.domain))];

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

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-sm mx-auto block select-none">
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
              <path d={edgePath(e)} fill="none" stroke={color}
                strokeWidth={edgeWidth(e.r) + (selected ? 1 : 0)}
                strokeDasharray={e.lag > 0 ? "6 4" : undefined}
                strokeLinecap="round"
                markerEnd={e.lag > 0 ? `url(#net-arrow-${e.r >= 0 ? "pos" : "neg"})` : undefined}
                opacity={selected ? 1 : 0.75} />
              {/* invisible wide hit area */}
              <path d={edgePath(e)} fill="none" stroke="transparent" strokeWidth={14}
                style={{ cursor: "pointer" }}
                onClick={() => { setSelEdge(selected ? null : e); }} />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map(n => {
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
