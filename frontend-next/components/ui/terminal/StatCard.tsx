import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: number;
  deltaLabel?: string;
  icon?: string;
  children?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Kompakte Zahl-mit-Label-Karte im Terminal-Look (Journal-KPIs, ML-Health,
 * Einstellungen). API-kompatibel zur früheren ui/StatCard — Token-Klassen
 * statt Inline-Styles, Monospace-Wert, Uppercase-Label.
 */
export default function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  children,
  className = "",
  size = "md",
}: StatCardProps) {
  const valueSize = size === "lg" ? "text-4xl" : size === "sm" ? "text-[16px]" : "text-xl";
  const pad = size === "lg" ? "p-6" : "px-5 py-4";

  return (
    <div className={`bg-surface border border-border rounded-(--radius-card) ${pad} ${className}`}>
      <div
        className={`flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-faint ${
          size === "lg" ? "mb-3.5" : "mb-2"
        }`}
      >
        <span>{label}</span>
        {icon && <i className={`ph-bold ${icon} text-[13px] opacity-50`} />}
      </div>
      <div className={`font-mono font-semibold leading-[1.1] tracking-tight ${valueSize}`}>{value}</div>
      {(delta !== undefined || deltaLabel) && (
        <div className="mt-1.5 text-[12px] font-mono text-faint">
          {delta !== undefined && (
            <span className={delta > 0 ? "text-up" : delta < 0 ? "text-down" : ""}>
              {delta > 0 ? "+" : ""}
              {Math.abs(delta).toLocaleString("de-DE", { maximumFractionDigits: 2 })}
            </span>
          )}
          {deltaLabel && <span className={delta !== undefined ? "ml-1.5" : ""}>{deltaLabel}</span>}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
