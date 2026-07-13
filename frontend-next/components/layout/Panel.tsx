import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Seiten-Sektion im Terminal-Stil: Surface-Fläche, dezenter Rand, ruhiger Header. */
export default function Panel({ title, subtitle, actions, children, className = "" }: PanelProps) {
  return (
    <section className={`bg-surface border border-border rounded-(--radius-card) ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            {title && <h2 className="text-[14px] font-bold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-[12px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
