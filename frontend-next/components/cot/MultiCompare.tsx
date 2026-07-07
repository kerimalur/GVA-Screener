"use client";

import { useEffect, useState } from "react";
import TimeSeriesChart, { type TimeSeriesPoint } from "@/components/charts/TimeSeriesChart";
import { chart } from "@/components/charts/chartTheme";
import { CFTC_CONTRACTS } from "@/lib/constants/cftcContracts";
import type { CotSeriesPoint } from "@/lib/data/cot";

const MAX_SELECT = 4;

/** 2–4 Contracts als Perzentil-Linien übereinander (normalisiert 0–100). */
export default function MultiCompare() {
  const [selected, setSelected] = useState<string[]>(["099741", "096742"]);
  const [seriesByCode, setSeriesByCode] = useState<Record<string, CotSeriesPoint[]>>({});

  useEffect(() => {
    for (const code of selected) {
      if (seriesByCode[code]) continue;
      fetch(`/api/data/cot?code=${code}`)
        .then((r) => r.json())
        .then((json: { series?: CotSeriesPoint[] }) => {
          if (json.series) {
            setSeriesByCode((prev) => ({ ...prev, [code]: json.series! }));
          }
        })
        .catch(() => {});
    }
  }, [selected, seriesByCode]);

  function toggle(code: string) {
    setSelected((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : prev.length < MAX_SELECT
          ? [...prev, code]
          : prev,
    );
  }

  // Merge auf gemeinsame Zeitachse
  const dates = new Set<string>();
  for (const code of selected) {
    for (const p of seriesByCode[code] ?? []) {
      if (p.percentile !== null) dates.add(p.date);
    }
  }
  const points: TimeSeriesPoint[] = [...dates].sort().map((date) => {
    const row: TimeSeriesPoint = { date };
    for (const code of selected) {
      const p = (seriesByCode[code] ?? []).find((s) => s.date === date);
      row[code] = p?.percentile ?? null;
    }
    return row;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {CFTC_CONTRACTS.map((c) => (
          <button
            key={c.code}
            onClick={() => toggle(c.code)}
            className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
              selected.includes(c.code)
                ? "bg-accent/15 text-accent border-accent"
                : "text-muted border-border hover:border-border2"
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="text-[10px] text-faint self-center ml-1">max. {MAX_SELECT}</span>
      </div>
      <TimeSeriesChart
        data={points}
        series={selected.map((code, i) => ({
          key: code,
          label: CFTC_CONTRACTS.find((c) => c.code === code)?.label ?? code,
          color: chart.palette[i % chart.palette.length],
        }))}
        height={260}
        refLineY={50}
        yDigits={0}
        defaultTimeframe="5J"
      />
      <p className="text-[10px] text-faint">
        Normalisiert als Positionierungs-Perzentil (0–100) — direkt vergleichbar über Contracts hinweg.
      </p>
    </div>
  );
}
