interface ProgressRingProps {
  /** 0..100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** CSS-Farbwert; Default färbt nach Wert (up/down/warn) */
  color?: string;
  label?: string;
}

export default function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  color,
  label,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const auto =
    clamped >= 66 ? "var(--color-up)" : clamped >= 33 ? "var(--color-warn)" : "var(--color-down)";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border2)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? auto}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <span className="absolute text-[11px] font-mono font-semibold">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
