"use client";

import { useEffect, useState } from "react";
import HeatmapGrid from "@/components/charts/HeatmapGrid";

const WINDOWS = [20, 60, 200] as const;
const GROUPS = {
  Majors: ["EUR_USD", "GBP_USD", "USD_JPY", "USD_CHF", "USD_CAD", "AUD_USD", "NZD_USD"],
  Alle: null as string[] | null,
};

interface ApiResponse {
  window: number;
  keys: string[];
  matrix: (number | null)[][];
  error?: string;
}

/** Korrelationsmatrix (Log-Returns) mit Fenster- und Gruppen-Umschalter. */
export default function CorrelationMatrix() {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(60);
  const [group, setGroup] = useState<keyof typeof GROUPS>("Majors");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/data/correlations?window=${window}`)
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((e) => setError(String(e)));
  }, [window]);

  if (error) {
    return <div className="h-40 flex items-center justify-center text-down text-sm font-mono">{error}</div>;
  }

  const filterKeys = GROUPS[group];
  const indices =
    data === null
      ? []
      : data.keys
          .map((k, i) => ({ k, i }))
          .filter(({ k }) => !filterKeys || filterKeys.includes(k));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold border transition-colors ${
                window === w
                  ? "bg-accent/15 text-accent border-accent"
                  : "text-muted border-border hover:border-border2"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(Object.keys(GROUPS) as Array<keyof typeof GROUPS>).map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors ${
                group === g
                  ? "bg-accent/15 text-accent border-accent"
                  : "text-muted border-border hover:border-border2"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="h-40 flex items-center justify-center text-muted text-sm font-mono">
          Berechne Korrelationen …
        </div>
      ) : (
        <HeatmapGrid
          rows={indices.map(({ k }) => k.replace("_", "/"))}
          cols={indices.map(({ k }) => k.replace("_", "/"))}
          cells={indices.map(({ i }) =>
            indices.map(({ i: j }) => ({
              value: data.matrix[i]?.[j] ?? null,
              title: `${data.keys[i]} × ${data.keys[j]}: ${(data.matrix[i]?.[j] ?? 0).toFixed(2)}`,
            })),
          )}
          min={-1}
          max={1}
          digits={2}
        />
      )}
    </div>
  );
}
