import type { ReactNode, MouseEventHandler } from "react";

interface TerminalCardProps {
  children: ReactNode;
  /** klickbare Karte: Hover-Aufhellung + hellerer Rand, cursor-pointer */
  onClick?: MouseEventHandler<HTMLElement>;
  /** zusätzlicher farbiger Rand (z. B. border-up/50 bei LONG-Boxen) */
  className?: string;
  /** kompaktere Innenabstände */
  dense?: boolean;
}

/**
 * Standard-Terminal-Karte: dunkle Fläche, dezenter 1px-Rand, ruhige
 * Innenabstände. Klickbar (onClick) mit deutlichem, aber dezentem Hover.
 */
export default function TerminalCard({ children, onClick, className = "", dense = false }: TerminalCardProps) {
  const base = `bg-surface2 border border-border rounded-(--radius-card) ${dense ? "p-2.5" : "p-3.5"}`;
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${base} text-left w-full cursor-pointer transition-colors hover:bg-surface2/60 hover:brightness-110 hover:border-border2 ${className}`}
      >
        {children}
      </button>
    );
  }
  return <div className={`${base} ${className}`}>{children}</div>;
}
