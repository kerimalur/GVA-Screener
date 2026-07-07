"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import type { CurrencyBias } from "@/lib/calc/currencyBias";

const LOOKBACKS = ["1W", "1M", "3M"] as const;

/** Währungs-Kompass: 8 klickbare Kacheln mit Long/Short-Bias, Details im Modal. */
export default function CurrencyBiasPanel({
  biases,
  extremeHi,
  extremeLo,
}: {
  biases: CurrencyBias[];
  extremeHi: number;
  extremeLo: number;
}) {
  const [selected, setSelected] = useState<CurrencyBias | null>(null);

  if (biases.length === 0) {
    return (
      <p className="text-muted text-sm font-mono">Daten fehlen — Backfill ausführen.</p>
    );
  }

  const isExtreme = (b: CurrencyBias) =>
    b.percentile !== null && (b.percentile >= extremeHi || b.percentile <= extremeLo);

  return (
    <>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {biases.map((b) => (
          <button
            key={b.ccy}
            onClick={() => setSelected(b)}
            className="bg-surface2 border border-border rounded p-2.5 text-center hover:border-border2 transition-colors cursor-pointer"
          >
            <div className="text-[12px] font-mono font-bold">
              {b.ccy}
              {isExtreme(b) && <span className="text-warn ml-1">⚠</span>}
            </div>
            <div
              className={`text-[11px] font-black tracking-widest my-1 ${
                b.direction === "LONG"
                  ? "text-up"
                  : b.direction === "SHORT"
                    ? "text-down"
                    : "text-faint"
              }`}
            >
              {b.direction ?? "NEUTRAL"}
            </div>
            <div className="text-[9px] text-faint uppercase tracking-wider">
              {b.alignedCount}/{b.factorCount} Faktoren
            </div>
          </button>
        ))}
      </div>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.ccy} — ${selected.direction ?? "NEUTRAL"}` : undefined}
        subtitle="4-Faktoren-Modell: COT-Flow · Leitzins-Trend · CB-Stance · Stärke"
      >
        {selected && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {selected.factors.map((f) => (
                <div key={f.name} className="flex items-start gap-2 text-[11px]">
                  <span
                    className={`shrink-0 mt-0.5 w-14 font-bold font-mono ${
                      f.dir === 1 ? "text-up" : f.dir === -1 ? "text-down" : "text-faint"
                    }`}
                  >
                    {f.dir === 1 ? "LONG" : f.dir === -1 ? "SHORT" : "–"}
                  </span>
                  <span className="text-muted">
                    <span className="text-text font-medium">{f.name}:</span> {f.text}
                  </span>
                </div>
              ))}
            </div>

            {selected.percentile !== null && (
              <p
                className={`text-[11px] font-mono ${
                  isExtreme(selected) ? "text-warn" : "text-muted"
                }`}
              >
                {isExtreme(selected) ? "⚠ " : ""}COT-Perzentil {selected.percentile.toFixed(0)} (5J-Fenster)
                {selected.percentile >= extremeHi
                  ? " — Extrem-Long (Konträr-Risiko)"
                  : selected.percentile <= extremeLo
                    ? " — Extrem-Short (Konträr-Risiko)"
                    : ""}
              </p>
            )}

            <div className="flex gap-4 pt-2 border-t border-border/50">
              {LOOKBACKS.map((lb) => (
                <div key={lb} className="text-[11px] font-mono">
                  <span className="text-faint uppercase mr-1">Stärke {lb}</span>
                  <span className={selected.strength[lb] >= 0 ? "text-up" : "text-down"}>
                    {selected.strength[lb] > 0 ? "+" : ""}
                    {selected.strength[lb].toFixed(2)} %
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
