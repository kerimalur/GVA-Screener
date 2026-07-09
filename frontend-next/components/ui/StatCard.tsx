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
  const deltaColor =
    delta === undefined || delta === 0 ? "" : delta > 0 ? "color:var(--color-up)" : "color:var(--color-down)";

  const valueSize = size === "lg" ? "36px" : size === "sm" ? "16px" : "20px";
  const padding = size === "lg" ? "26px" : "18px 20px";
  const radius = size === "lg" ? "18px" : "16px";

  return (
    <div
      className={className}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: radius,
        padding: padding,
      }}
    >
      <div style={{
        fontSize: "11px", fontWeight: 700, letterSpacing: "0.8px",
        color: "var(--color-faint)", textTransform: "uppercase",
        marginBottom: size === "lg" ? "14px" : "8px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span>{label}</span>
        {icon && <i className={`ph-bold ${icon}`} style={{ fontSize: "13px", opacity: 0.5 }} />}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', var(--font-mono), monospace",
        fontSize: valueSize,
        fontWeight: 600,
        letterSpacing: "-0.5px",
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {(delta !== undefined || deltaLabel) && (
        <div style={{
          marginTop: "6px",
          fontSize: "12px",
          color: "var(--color-faint)",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {delta !== undefined && (
            <span style={delta !== 0 ? { color: delta > 0 ? "var(--color-up)" : "var(--color-down)" } : {}}>
              {delta > 0 ? "+" : ""}{Math.abs(delta).toLocaleString("de-DE", { maximumFractionDigits: 2 })}
            </span>
          )}
          {deltaLabel && <span style={{ color: "var(--color-faint)", marginLeft: delta !== undefined ? "6px" : "0" }}>{deltaLabel}</span>}
        </div>
      )}
      {children && <div style={{ marginTop: "12px" }}>{children}</div>}
    </div>
  );
}
