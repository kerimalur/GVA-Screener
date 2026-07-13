import type { ReactNode } from "react";

/**
 * Einheitliche Seiten-/Sektions-Überschrift: Titel + gedämpfter Untertitel
 * (wie "Macro Terminal / G10 Currency Bias — fundamentales Regime je Währung").
 */
export default function TerminalHeader({
  title,
  subtitle,
  actions,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div>
        <h2 className="text-[14px] font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-[12px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
