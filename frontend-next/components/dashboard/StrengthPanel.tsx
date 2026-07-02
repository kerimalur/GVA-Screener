"use client";

import { useState } from "react";
import HeatmapGrid from "@/components/charts/HeatmapGrid";
import type { StrengthResult } from "@/lib/calc/strength";
import { G8_CURRENCIES } from "@/lib/constants/instruments";

const LOOKBACKS = ["1W", "1M", "3M"] as const;
type Lookback = (typeof LOOKBACKS)[number];

/** Currency Strength: Ranking-Liste + Heatmap (Währung × Lookback). */
export default function StrengthPanel({ strength }: { strength: StrengthResult }) {
  const [lb, setLb] = useState<Lookback>("1M");

  const ranking = strength.ranking[lb];
  const maxAbs = Math.max(
    0.1,
    ...LOOKBACKS.flatMap((l) => G8_CURRENCIES.map((c) => Math.abs(strength.scores[l][c] ?? 0))),
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Ranking */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest text-muted">
            Ranking ({lb})
          </span>
          <div className="flex gap-1">
            {LOOKBACKS.map((l) => (
              <button
                key={l}
                onClick={() => setLb(l)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                  lb === l
                    ? "bg-accent/15 text-accent border-accent"
                    : "text-muted border-border hover:border-border2"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          {ranking.map((ccy, i) => {
            const score = strength.scores[lb][ccy] ?? 0;
            const width = Math.min(100, (Math.abs(score) / maxAbs) * 100);
            return (
              <div key={ccy} className="flex items-center gap-2">
                <span className="w-5 text-[10px] font-mono text-faint">{i + 1}.</span>
                <span className="w-10 text-[12px] font-mono font-bold">{ccy}</span>
                <div className="flex-1 h-3.5 bg-surface2 rounded-sm relative overflow-hidden">
                  <div
                    className={`absolute top-0 h-full ${score >= 0 ? "bg-up/60 left-1/2" : "bg-down/60 right-1/2"}`}
                    style={{ width: `${width / 2}%` }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-faint/50" />
                </div>
                <span
                  className={`w-16 text-right text-[11px] font-mono font-bold ${
                    score >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {score > 0 ? "+" : ""}
                  {score.toFixed(2)} %
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Heatmap Währung × Zeitraum */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
          Heatmap (Ø signierter Pair-Return in %)
        </div>
        <HeatmapGrid
          rows={[...G8_CURRENCIES]}
          cols={[...LOOKBACKS]}
          cells={G8_CURRENCIES.map((ccy) =>
            LOOKBACKS.map((l) => ({
              value: strength.scores[l][ccy] ?? null,
              title: `${ccy} ${l}: ${(strength.scores[l][ccy] ?? 0).toFixed(2)} %`,
            })),
          )}
          min={-maxAbs}
          max={maxAbs}
          digits={2}
        />
      </div>
    </div>
  );
}
