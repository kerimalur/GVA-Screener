import type { ReactNode } from 'react';

interface ModalShellProps {
  title: ReactNode;
  badge?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string; // tailwind max-w-* class
}

// Einheitliche Modal-Hülle (Overlay + Karte + Header + optionaler Footer).
export default function ModalShell({ title, badge, onClose, children, footer, maxWidth = 'max-w-md' }: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 bg-textMain/40 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-300 p-4"
      onClick={onClose}
    >
      <div className={`bg-bgSurface rounded-2xl shadow-hover w-full ${maxWidth} p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-5">
          <div>
            <h3 className="text-2xl font-black text-textMain tracking-tight">{title}</h3>
            {badge && <div className="mt-2">{badge}</div>}
          </div>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain hover:bg-bgBase p-2 rounded-lg transition-colors"
          >
            <i className="ph-bold ph-x text-lg"></i>
          </button>
        </div>

        <div className="space-y-4">{children}</div>

        {footer && (
          <div className="mt-6 pt-4 border-t border-borderLight flex items-center gap-1.5 text-[11px] text-textMuted font-medium">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
