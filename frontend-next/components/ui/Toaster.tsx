"use client";

import { create } from "zustand";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Kurzform für Feature-Code: toast.success('Gespeichert') */
export const toast = {
  success: (m: string) => useToastStore.getState().push("success", m),
  error: (m: string) => useToastStore.getState().push("error", m),
  info: (m: string) => useToastStore.getState().push("info", m),
};

const KIND_STYLES: Record<ToastKind, { icon: string; cls: string }> = {
  success: { icon: "ph-check-circle", cls: "border-up/40 text-up" },
  error: { icon: "ph-warning-circle", cls: "border-down/40 text-down" },
  info: { icon: "ph-info", cls: "border-accent/40 text-accent" },
};

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80">
      {toasts.map((t) => {
        const k = KIND_STYLES[t.kind];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 px-3.5 py-2.5 bg-surface2 border rounded-md shadow-lg anim-slide-up ${k.cls}`}
          >
            <i className={`ph-bold ${k.icon} text-base mt-px shrink-0`} />
            <span className="text-[12px] text-text flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-text shrink-0"
              aria-label="Schließen"
            >
              <i className="ph-bold ph-x text-xs" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
