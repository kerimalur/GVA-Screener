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
    <section className={`bg-surface border border-border rounded-md ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div>
            {title && <h2 className="text-[13px] font-semibold">{title}</h2>}
            {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
