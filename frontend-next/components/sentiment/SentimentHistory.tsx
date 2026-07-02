"use client";

import { useEffect, useState } from "react";
import TimeSeriesChart, { type TimeSeriesPoint } from "@/components/charts/TimeSeriesChart";
import { chart } from "@/components/charts/chartTheme";
import { FX_INSTRUMENTS, toOanda } from "@/lib/constants/instruments";
import type { SeriesPoint } from "@/lib/calc/seriesMath";

/** Verlauf der Retail-Positionierung + Preis-Overlay (akkumuliert aus Cron-Snapshots). */
export default function SentimentHistory({ pairs }: { pairs: string[] }) {
  const [pair, setPair] = useState(pairs[0] ?? "EURUSD");
  const [sentiment, setSentiment] = useState<SeriesPoint[]>([]);
  const [price, setPrice] = useState<SeriesPoint[]>([]);

  useEffect(() => {
    if (!pair) return;
    Promise.all([
      fetch(`/api/data/series?type=sentiment&key=${pair}`).then((r) => r.json()),
      fetch(`/api/data/series?type=price&key=${toOanda(pair)}`).then((r) => r.json()),
    ])
      .then(([s, p]: Array<{ points?: SeriesPoint[] }>) => {
        setSentiment(s.points ?? []);
        setPrice(p.points ?? []);
      })
      .catch(() => {
        setSentiment([]);
        setPrice([]);
      });
  }, [pair]);

  const priceMap = new Map(price.map((p) => [p.date, p.value]));
  const points: TimeSeriesPoint[] = [];
  for (const s of sentiment) {
    const prev = points.length > 0 ? (points[points.length - 1].price as number | null) : null;
    points.push({ date: s.date, long: s.value, price: priceMap.get(s.date) ?? prev });
  }

  const options = pairs.length > 0 ? pairs : FX_INSTRUMENTS.map((i) => i.instrument.replace("_", ""));

  return (
    <div className="space-y-3">
      <select
        value={pair}
        onChange={(e) => setPair(e.target.value)}
        className="bg-surface2 border border-border rounded px-2 py-1 text-[12px] font-mono"
      >
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {points.length < 2 ? (
        <div className="h-48 flex items-center justify-center text-muted text-sm font-mono">
          Noch zu wenig Historie — der tägliche Cron akkumuliert Snapshots.
        </div>
      ) : (
        <TimeSeriesChart
          data={points}
          series={[
            { key: "long", label: "Retail Long-%", color: chart.warn },
            { key: "price", label: pair, color: chart.accent, yAxis: "right" },
          ]}
          height={300}
          refLineY={50}
          yDigits={0}
          defaultTimeframe="Max"
        />
      )}
    </div>
  );
}
