"use client";

import { useEffect } from "react";
import CurrencyDetailSections from "./CurrencyDetailSections";
import { BiasScore, DirectionTag } from "@/components/ui/terminal";
import type { TerminalCurrency } from "@/lib/data/terminal";

/** Detail-Popup einer Währung: 4 Sub-Scores + Intermarket-Panel. */
export default function CurrencyModal({
  currency,
  onClose,
}: {
  currency: TerminalCurrency;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-4 md:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-surface border border-border2 rounded-xl shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 bg-surface border-b border-border rounded-t-xl">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[11px] font-bold text-faint uppercase">{currency.iso}</span>
            <span className="font-mono font-black text-[16px]">{currency.ccy}</span>
            <BiasScore
              value={currency.score.total === null ? null : currency.score.total * 100}
              digits={0}
              threshold={15}
              size="sm"
              className="text-[16px]"
            />
            <DirectionTag direction={currency.score.direction} />
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-text text-[18px] leading-none px-2 py-1 cursor-pointer"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          <CurrencyDetailSections currency={currency} />
        </div>
      </div>
    </div>
  );
}
