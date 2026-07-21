"use client";

import { useState } from "react";
import { radarType, sortByDistance, type MarketData, type RadarType } from "@/lib/gva/api";

const CURRENCIES = ["Alle", "EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

// Marker-Position (left %) auf der Bar: 0% = Long-Linie (links), 100% = Short-Linie (rechts).
function markerPct(item: MarketData, type: RadarType): number {
  const d = Math.min(item.distance ?? 100, 100);
  switch (type) {
    case "hit-short":
      return 100;
    case "hit-long":
      return 0;
    case "short":
      return Math.max(20, 100 - d * 0.8);
    case "long":
      return Math.min(80, d * 0.8);
    default:
      return 50;
  }
}

function rowStyle(type: RadarType): { marker: string; distanceText: string; pulse: boolean } {
  switch (type) {
    case "hit-short":
    case "hit-long":
      return { marker: "bg-warn", distanceText: "text-warn", pulse: true };
    case "short":
      return { marker: "bg-down", distanceText: "text-down", pulse: false };
    case "long":
      return { marker: "bg-up", distanceText: "text-up", pulse: false };
    default:
      return { marker: "bg-neutral", distanceText: "text-muted", pulse: false };
  }
}

interface RadarViewProps {
  data: MarketData[];
  onSelect: (item: MarketData) => void;
}

export default function RadarView({ data, onSelect }: RadarViewProps) {
  const [filter, setFilter] = useState<string>("Alle");

  const filtered = filter === "Alle" ? data : data.filter((d) => d.pair.includes(filter));
  const rows = sortByDistance(filtered);

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <p className="text-muted text-[13px]">
        Der Marktpreis wandert wie auf einem Zeitstrahl zwischen Short und Long.{" "}
        <strong className="text-accent font-medium">Klicke auf ein Paar für Details.</strong>
      </p>

      <div className="flex flex-wrap gap-2">
        {CURRENCIES.map((ccy) => (
          <button
            key={ccy}
            onClick={() => setFilter(ccy)}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors border ${
              filter === ccy
                ? "bg-accent/15 text-accent border-accent"
                : "bg-surface text-muted border-border hover:text-text hover:border-border2"
            }`}
          >
            {ccy}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-md border border-border p-5 space-y-3">
        <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-muted border-b border-border pb-3 px-2">
          <span className="w-24">Paar</span>
          <div className="flex-1 flex justify-between px-4">
            <span className="text-up">Long Line</span>
            <span>Markt Position</span>
            <span className="text-down">Short Line</span>
          </div>
          <span className="w-24 text-right">Distanz</span>
        </div>

        {rows.length === 0 && (
          <div className="text-center text-muted text-sm py-10">
            Keine Paare für diesen Filter.
          </div>
        )}

        {rows.map((item) => {
          const type = radarType(item);
          const style = rowStyle(type);
          const pct = markerPct(item, type);
          const isHit = type === "hit-short" || type === "hit-long";
          const distanceLabel = isHit
            ? "HIT"
            : item.distance != null
              ? `${item.distance.toFixed(1)} Pips`
              : "–";

          return (
            <div
              key={item.pair}
              onClick={() => onSelect(item)}
              className="flex items-center group cursor-pointer hover:bg-surface2 p-2.5 rounded transition-colors -mx-2 border border-transparent hover:border-border2"
            >
              <div className="w-24 font-bold text-[13px] flex items-center gap-2 group-hover:text-accent transition-colors">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${style.marker} ${
                    style.pulse ? "animate-pulse shadow-[0_0_8px_rgba(224,138,60,0.6)]" : ""
                  }`}
                />
                {item.pair}
              </div>

              <div className="flex-1 px-4 relative flex items-center">
                <div className="w-full h-1.5 bg-border rounded-full relative">
                  <div
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-4 bg-up rounded-full ${
                      item.near === "LONG" ? "" : "opacity-30"
                    }`}
                  />
                  <div
                    className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-4 bg-down rounded-full ${
                      item.near === "SHORT" ? "" : "opacity-30"
                    }`}
                  />
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 ${style.marker} border-2 border-bg rounded-full shadow-md z-10 transition-transform group-hover:scale-125`}
                    style={{ left: `${pct}%` }}
                  />
                </div>
              </div>

              <div
                className={`w-24 text-right font-bold text-[13px] font-mono ${style.distanceText}`}
              >
                {distanceLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
