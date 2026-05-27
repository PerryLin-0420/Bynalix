interface MacroRingProps {
  value: number;
  target: number;
  color: { from: string; to: string };
  trackColor?: string;
  size?: number;
  strokeWidth?: number;
}

export function MacroRing({ value, target, color, trackColor = "#373d4a1a", size = 64, strokeWidth = 7 }: MacroRingProps) {
  const r    = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const cx   = size / 2;
  const pct  = target > 0 ? value / target : 0;
  const over = pct > 1;

  // Normal arc: capped at 100%
  const normalPct    = Math.min(pct, 1);
  const normalOffset = circ * (1 - normalPct);

  // Overflow arc: excess beyond 100%, capped at another full circle
  const overflowPct    = Math.min(pct - 1, 1);
  const overflowOffset = circ * (1 - overflowPct);

  // Unique gradient ID to prevent conflicts if multiple rings are rendered
  const gradientId = `macro-custom-gradient-${color.from.replace("#", "")}-${color.to.replace("#", "")}`;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color.from} />
          <stop offset="100%" stopColor={color.to} />
        </linearGradient>
      </defs>

      {/* Background track */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />

      {/* Normal progress arc */}
      <circle
        cx={cx} cy={cx} r={r} fill="none" 
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={normalOffset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />

      {/* Overflow arc in red, rendered on top */}
      {over && (
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke="#ef4444"
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={overflowOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      )}
    </svg>
  );
}
