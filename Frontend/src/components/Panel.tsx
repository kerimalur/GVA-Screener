import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}

// Einheitliche Terminal-Panel-Chrome (Header-Strip + Body).
export default function Panel({ title, subtitle, right, children, className, bodyClass }: PanelProps) {
  return (
    <div className={`bg-bgSurface rounded-xl border border-borderLight shadow-sm overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-borderLight px-5 py-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-textMuted">{title}</h3>
          {subtitle && <span className="text-[10px] text-neutral font-medium">{subtitle}</span>}
        </div>
        {right}
      </div>
      <div className={bodyClass ?? 'p-5'}>{children}</div>
    </div>
  );
}

// Kleiner LIVE-Indikator für Panel-Header.
export function LiveTag() {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-win">
      <span className="w-1.5 h-1.5 rounded-full bg-win animate-pulse"></span>
      Live
    </span>
  );
}
