export type Regime =
  | "GOLDILOCKS"
  | "REFLATION"
  | "STAGFLATION"
  | "OVERHEATING"
  | "DISINFLATION";

const STYLE: Record<Regime, string> = {
  GOLDILOCKS: "bg-regime-goldilocks text-bg",
  STAGFLATION: "bg-regime-stagflation text-bg",
  REFLATION: "bg-regime-reflation text-bg",
  OVERHEATING: "bg-regime-overheating text-bg",
  DISINFLATION: "bg-regime-disinflation text-bg",
};

/** Regime-Label als heller Solid-Chip mit dunklem Text (Terminal-Referenz). */
export default function RegimeTag({ regime, className = "" }: { regime: Regime; className?: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-(--radius-tag) text-[10px] font-black font-mono uppercase tracking-wider ${STYLE[regime]} ${className}`}
    >
      {regime}
    </span>
  );
}
