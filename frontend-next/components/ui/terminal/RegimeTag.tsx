export type Regime =
  | "GOLDILOCKS"
  | "REFLATION"
  | "STAGFLATION"
  | "OVERHEATING"
  | "DISINFLATION";

const STYLE: Record<Regime, string> = {
  GOLDILOCKS: "bg-regime-goldilocks-dim text-regime-goldilocks border-regime-goldilocks/30",
  STAGFLATION: "bg-regime-stagflation-dim text-regime-stagflation border-regime-stagflation/30",
  REFLATION: "bg-regime-reflation-dim text-regime-reflation border-regime-reflation/30",
  OVERHEATING: "bg-regime-overheating-dim text-regime-overheating border-regime-overheating/30",
  DISINFLATION: "bg-regime-disinflation-dim text-regime-disinflation border-regime-disinflation/30",
};

/** Regime-Label als farbig hinterlegter Uppercase-Tag (Terminal-Stil). */
export default function RegimeTag({ regime, className = "" }: { regime: Regime; className?: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-(--radius-tag) border text-[10px] font-black uppercase tracking-wider ${STYLE[regime]} ${className}`}
    >
      {regime}
    </span>
  );
}
