"use client";

import { useEffect } from "react";
import CurrencyDetailSections from "./CurrencyDetailSections";
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

  const total = currency.score.total;
  const dirCls =
    currency.score.direction === "LONG"
      ? "text-up"
      : currency.score.direction === "SHORT"
        ? "text-down"
        : "text-muted";

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
            <span className="text-xl leading-none">{currency.flag}</span>
            <span className="font-mono font-black text-[16px]">{currency.ccy}</span>
            <span className={`font-mono font-black text-[16px] ${dirCls}`}>
              {total !== null ? `${total > 0 ? "+" : ""}${total.toFixed(2)}` : "–"}
            </span>
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
              currency.score.direction === "LONG"
                ? "border-up/40 text-up bg-up/10"
                : currency.score.direction === "SHORT"
                  ? "border-down/40 text-down bg-down/10"
                  : "border-border text-muted"
            }`}>
              {currency.score.direction}
            </span>
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
