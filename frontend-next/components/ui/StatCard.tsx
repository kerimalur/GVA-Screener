import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Vorzeichenbehaftete Zahl färbt automatisch (up/down) */
  delta?: number;
  deltaLabel?: string;
  icon?: string;
  /** z.B. Sparkline unten in der Karte */
  children?: ReactNode;
  className?: string;
}

export default function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  children,
  className = "",
}: StatCardProps) {
  const deltaColor =
    delta === undefined || delta === 0
      ? "text-muted"
      : delta > 0
        ? "text-up"
        : "text-down";

  return (
    <div className={`bg-surface border border-border rounded-md p-4 ${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
          {label}
        </span>
        {icon && <i className={`ph-bold ${icon} text-muted text-sm`} />}
      </div>
      <div className="text-xl font-semibold font-mono tabular-nums">{value}</div>
      {(delta !== undefined || deltaLabel) && (
        <div className={`mt-1 text-[11px] font-mono ${deltaColor}`}>
          {delta !== undefined && (
            <span>
              {delta > 0 ? "▲ " : delta < 0 ? "▼ " : ""}
              {Math.abs(delta).toLocaleString("de-DE", { maximumFractionDigits: 2 })}
            </span>
          )}
          {deltaLabel && <span className="text-muted ml-1">{deltaLabel}</span>}
        </div>
      )}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
