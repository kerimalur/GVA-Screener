export type Direction = "LONG" | "SHORT" | "NEUTRAL";

const STYLE: Record<Direction, string> = {
  LONG: "bg-up text-active",
  SHORT: "bg-down text-active",
  NEUTRAL: "bg-muted text-active",
};

/**
 * Kompakter LONG/SHORT/NEUTRAL-Tag: heller Solid-Chip mit dunklem Text
 * (Referenz-Screenshot Macro Terminal). `label` erlaubt abweichende
 * Beschriftung in derselben Farbwelt (z. B. Impact HIGH/MID).
 */
export default function DirectionTag({
  direction,
  label,
  className = "",
}: {
  direction: Direction;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-(--radius-tag) text-[10px] font-black font-mono uppercase tracking-wider ${STYLE[direction]} ${className}`}
    >
      {label ?? direction}
    </span>
  );
}
