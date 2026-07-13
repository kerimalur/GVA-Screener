import type { ReactNode } from "react";

/**
 * Einheitliche Seiten-/Sektions-Überschrift: Titel + gedämpfter Untertitel
 * (wie "Macro Terminal / G10 Currency Bias — fundamentales Regime je Währung").
 */
export default function TerminalHeader({
  title,
  subtitle,
  actions,
  size = "page",
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** page = große Seitenüberschrift, section = kompakter Sektions-Kopf */
  size?: "page" | "section";
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div>
        <h2 className={`font-bold tracking-tight ${size === "page" ? "text-2xl" : "text-[14px]"}`}>
          {title}
        </h2>
        {subtitle && <p className="text-[12px] text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
