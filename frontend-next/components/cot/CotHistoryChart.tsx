"use client";

import { useEffect, useMemo, useState } from "react";
import TimeSeriesChart, { type TimeSeriesPoint } from "@/components/charts/TimeSeriesChart";
import { chart } from "@/components/charts/chartTheme";
import type { CotSeriesPoint } from "@/lib/data/cot";

interface ApiResponse {
  contract: { code: string; label: string; priceInstrument: string | null };
  series: CotSeriesPoint[];
  prices: Array<{ date: string; close: number }>;
  error?: string;
}

/** Netto-Positionen (NonComm/Comm) + Preis-Overlay + Perzentil-Unterchart. */
export default function CotHistoryChart({ code }: { code: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/data/cot?code=${code}`)
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((e) => setError(String(e)));
  }, [code]);

  const { mainPoints, pctPoints } = useMemo(() => {
    if (!data) return { mainPoints: [], pctPoints: [] };
    const priceByDate = new Map(data.prices.map((p) => [p.date, p.close]));
    // Preis auf Report-Daten mappen (nächster verfügbarer Schlusskurs davor)
    const priceDates = data.prices.map((p) => p.date);
    let pi = 0;
    const mainPoints: TimeSeriesPoint[] = data.series.map((s) => {
      while (pi < priceDates.length - 1 && priceDates[pi + 1] <= s.date) pi++;
      const price = priceByDate.get(priceDates[pi]);
      return {
        date: s.date,
        net: s.net,
        comm: s.commNet,
        price: priceDates[pi] <= s.date && price !== undefined ? price : null,
      };
    });
    const pctPoints: TimeSeriesPoint[] = data.series.map((s) => ({
      date: s.date,
      pct: s.percentile,
    }));
    return { mainPoints, pctPoints };
  }, [data]);

  if (error) {
    return (
      <div className="h-60 flex items-center justify-center text-down text-sm font-mono">{error}</div>
    );
  }
  if (!data) {
    return (
      <div className="h-60 flex items-center justify-center text-muted text-sm font-mono">
        Lade COT-Historie …
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TimeSeriesChart
        data={mainPoints}
        series={[
          { key: "net", label: "Non-Comm Netto", color: chart.accent },
          { key: "comm", label: "Commercials Netto", color: chart.warn, dashed: true },
          ...(data.contract.priceInstrument
            ? [{ key: "price", label: data.contract.priceInstrument, color: chart.neutral, yAxis: "right" as const }]
            : []),
        ]}
        height={340}
        refLineY={0}
        defaultTimeframe="5J"
      />
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1">
          Positionierungs-Perzentil (rollierend, 5J-Fenster) — ≥90 Extrem-Long · ≤10 Extrem-Short
        </div>
        <TimeSeriesChart
          data={pctPoints}
          series={[{ key: "pct", label: "Perzentil", color: chart.up }]}
          height={140}
          timeframes={false}
          brush={false}
          refLineY={50}
          yDigits={0}
        />
      </div>
    </div>
  );
}
