"use client";

import { useEffect, useState } from "react";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import { chart } from "@/components/charts/chartTheme";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";
import type { SeriesPoint } from "@/lib/calc/seriesMath";

type Mode = "spread_10y" | "rate_diff";

/** Historischer Chart: 10Y-Spread oder Zinsdifferenz je Pair, mit Pair-Auswahl. */
export default function SpreadChart({ initialPair = "EUR_USD" }: { initialPair?: string }) {
  const [pair, setPair] = useState(initialPair);
  const [mode, setMode] = useState<Mode>("spread_10y");
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [label, setLabel] = useState("");

  useEffect(() => {
    fetch(`/api/data/series?type=${mode}&key=${pair}`)
      .then((r) => r.json())
      .then((json: { label?: string; points?: SeriesPoint[] }) => {
        setPoints(json.points ?? []);
        setLabel(json.label ?? "");
      })
      .catch(() => setPoints([]));
  }, [pair, mode]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          className="bg-surface2 border border-border rounded px-2 py-1 text-[12px] font-mono"
        >
          {FX_INSTRUMENTS.map((i) => (
            <option key={i.instrument} value={i.instrument}>
              {i.displayName}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {(
            [
              ["spread_10y", "10Y-Spread"],
              ["rate_diff", "Zinsdifferenz"],
            ] as const
          ).map(([m, l]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors ${
                mode === m
                  ? "bg-accent/15 text-accent border-accent"
                  : "text-muted border-border hover:border-border2"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        {points.length === 0 && <span className="text-[11px] text-muted font-mono">lädt …</span>}
      </div>
      <TimeSeriesChart
        data={points.map((p) => ({ date: p.date, value: p.value }))}
        series={[{ key: "value", label: label || pair, color: chart.accent }]}
        height={280}
        refLineY={0}
        yDigits={2}
        defaultTimeframe="5J"
      />
    </div>
  );
}
