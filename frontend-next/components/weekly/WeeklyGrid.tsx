"use client";

import { useMemo, useState } from "react";
import type { WeeklyData } from "@/lib/data/weekly";
import { sortCards, WEEKLY_SORT_MODES, type WeeklySortMode } from "@/lib/weekly/sort";
import WeeklyPairCard from "./WeeklyPairCard";
import WeeklyBtcCard from "./WeeklyBtcCard";

/**
 * Rendert die Weekly-Karten mit rein FAKTISCHER, umschaltbarer Sortierung.
 * Bewusst KEINE Signal-Sortierung (Score/Q5/Q1 out-of-sample widerlegt —
 * siehe lib/weekly/sort.ts). Default = Ereignisdichte der Woche.
 */
export default function WeeklyGrid({ data }: { data: WeeklyData }) {
  const [mode, setMode] = useState<WeeklySortMode>("events");
  const cards = useMemo(() => sortCards(data.cards, mode), [data.cards, mode]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-faint font-mono uppercase tracking-widest text-[9px]">Sortieren</span>
        {WEEKLY_SORT_MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            title={m.hint}
            className={`px-2.5 py-1 rounded font-mono border transition-colors ${
              mode === m.key
                ? "border-accent text-accent bg-accent/15"
                : "border-border/60 text-muted hover:text-text"
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="text-faint font-mono ml-1">· rein faktisch, kein Signal</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <WeeklyBtcCard btc={data.btc} />
        {cards.map((c) => (
          <WeeklyPairCard key={c.instrument} card={c} />
        ))}
      </div>
    </>
  );
}
