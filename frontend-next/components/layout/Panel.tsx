import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Panel({ title, subtitle, actions, children, className = "" }: PanelProps) {
  return (
    <section
      className={className}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "12px",
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div>
            {title && (
              <h2 style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "-0.1px" }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ fontSize: "12px", color: "var(--color-muted)", marginTop: "2px" }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <div style={{ padding: "20px" }}>{children}</div>
    </section>
  );
}
