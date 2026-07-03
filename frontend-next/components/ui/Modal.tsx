"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Size = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
}

const SIZES: Record<Size, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 anim-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${SIZES[size]} max-h-[90vh] flex flex-col bg-surface border border-border2 rounded-lg shadow-2xl anim-scale-in`}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between px-5 py-3.5 border-b border-border shrink-0">
            <div>
              {title && <h2 className="text-sm font-semibold">{title}</h2>}
              {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Schließen"
              className="text-muted hover:text-text transition-colors -mr-1"
            >
              <i className="ph-bold ph-x text-base" />
            </button>
          </div>
        )}
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
