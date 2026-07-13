export type Regime =
  | "GOLDILOCKS"
  | "REFLATION"
  | "STAGFLATION"
  | "OVERHEATING"
  | "DISINFLATION";

const STYLE: Record<Regime, string> = {
  GOLDILOCKS: "text-regime-goldilocks border-regime-goldilocks/60",
  STAGFLATION: "text-regime-stagflation border-regime-stagflation/60",
  REFLATION: "text-regime-reflation border-regime-reflation/60",
  OVERHEATING: "text-regime-overheating border-regime-overheating/60",
  DISINFLATION: "text-regime-disinflation border-regime-disinflation/60",
};

/** Regime-Label als Outline-Chip: farbiger Text + Rand (Terminal-Referenz). */
export default function RegimeTag({ regime, className = "" }: { regime: Regime; className?: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-(--radius-tag) border text-[10px] font-black font-mono uppercase tracking-wider ${STYLE[regime]} ${className}`}
    >
      {regime}
    </span>
  );
}
