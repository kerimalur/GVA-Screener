export type Direction = "LONG" | "SHORT" | "NEUTRAL";

const STYLE: Record<Direction, string> = {
  LONG: "bg-up-dim text-up border-up/30",
  SHORT: "bg-down-dim text-down border-down/30",
  NEUTRAL: "bg-neutral-dim text-muted border-border",
};

/**
 * Kompakter LONG/SHORT/NEUTRAL-Tag: Dim-Hintergrund + farbiger Uppercase-Text.
 * `label` erlaubt abweichende Beschriftung in derselben Farbwelt
 * (z. B. Impact-Tags HIGH=SHORT-rot, MID=warn über className).
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
      className={`inline-block px-1.5 py-0.5 rounded-(--radius-tag) border text-[10px] font-black font-mono uppercase tracking-wider ${STYLE[direction]} ${className}`}
    >
      {label ?? direction}
    </span>
  );
}
