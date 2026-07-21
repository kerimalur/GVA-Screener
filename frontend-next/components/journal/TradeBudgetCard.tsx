"use client";

import type { Trade } from "@/lib/journal/types";
import {
  BLOCK_LABELS,
  budgetState,
  TRADE_BUDGET_PER_MONTH,
  type BoxState,
} from "@/lib/journal/budget";

/**
 * Trade-Budget des Monats als acht Kästchen, in vier Blöcken zu je zwei.
 *
 * Bewusst kontenübergreifend: das Widget steht über dem Konto-Umschalter und
 * ändert sich beim Umschalten nicht — sonst sähe es aus wie ein Konto-Wert.
 * Es bekommt deshalb ALLE Trades, nicht die gefilterten.
 */

const BOX_CLASS: Record<BoxState, string> = {
  used: "bg-accent border-accent",
  open: "bg-transparent border-border2",
  locked: "bg-surface2 border-transparent opacity-50",
  overrun: "bg-down/20 border-down",
};

const BOX_TITLE: Record<BoxState, string> = {
  used: "verbraucht",
  open: "frei",
  locked: "noch nicht freigeschaltet",
  overrun: "über dem Budget",
};

export default function TradeBudgetCard({
  trades,
  jetzt = new Date(),
}: {
  /** ALLE Trades, ungefiltert — das Budget gilt kontenübergreifend. */
  trades: Trade[];
  jetzt?: Date;
}) {
  const s = budgetState(trades, jetzt);
  const monat = jetzt.toLocaleDateString("de-CH", { month: "long" });

  return (
    <div className="bg-surface border border-border rounded-(--radius-card) px-5 py-4">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-faint">
          Budget {monat}
        </span>
        <span className="font-mono text-[12px] text-muted">
          {s.used} / {s.total}
          {s.overrun > 0 ? (
            <span className="text-down font-bold"> · {s.overrun} über Budget</span>
          ) : (
            <span className="text-faint"> · {s.offen} offen</span>
          )}
        </span>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        {BLOCK_LABELS.map((label, blockIdx) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex gap-1">
              {s.boxes.slice(blockIdx * 2, blockIdx * 2 + 2).map((state, i) => (
                <span
                  key={i}
                  title={BOX_TITLE[state]}
                  className={`w-6 h-6 rounded-(--radius-tag) border ${BOX_CLASS[state]}`}
                />
              ))}
            </div>
            <span className="font-mono text-[9px] text-faint text-center">{label}</span>
          </div>
        ))}

        {/* Überzug hängt sichtbar ausserhalb der vier Blöcke. */}
        {s.overrun > 0 && (
          <div className="flex flex-col gap-1 pl-2 border-l border-border">
            <div className="flex gap-1">
              {s.boxes.slice(TRADE_BUDGET_PER_MONTH).map((state, i) => (
                <span
                  key={i}
                  title={BOX_TITLE[state]}
                  className={`w-6 h-6 rounded-(--radius-tag) border ${BOX_CLASS[state]}`}
                />
              ))}
            </div>
            <span className="font-mono text-[9px] text-down text-center">Überzug</span>
          </div>
        )}
      </div>
    </div>
  );
}
