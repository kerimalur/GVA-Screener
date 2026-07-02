"use client";

import { useEffect, useMemo, useState } from "react";
import TimeSeriesChart, { type TimeSeriesPoint } from "@/components/charts/TimeSeriesChart";
import { chart } from "@/components/charts/chartTheme";
import { rollingCorrelation } from "@/lib/calc/correlations";
import type { SeriesPoint } from "@/lib/calc/seriesMath";

export interface OverlaySpec {
  type: string; // SeriesType
  key: string;
  label?: string;
}

interface OverlayChartProps {
  a: OverlaySpec;
  b: OverlaySpec;
  height?: number;
  /** auf 100 normalisieren statt Dual-Axis */
  normalize?: boolean;
  /** rollierende Korrelation (Fenster in Tagen) im Untertitel */
  corrWindow?: number;
}

async function loadSeries(spec: OverlaySpec): Promise<{ label: string; points: SeriesPoint[] }> {
  const res = await fetch(`/api/data/series?type=${spec.type}&key=${encodeURIComponent(spec.key)}`);
  const json = (await res.json()) as { label?: string; points?: SeriesPoint[]; error?: string };
  if (json.error) throw new Error(json.error);
  return { label: spec.label ?? json.label ?? spec.key, points: json.points ?? [] };
}

/** Zwei beliebige Serien übereinander (Dual-Y oder normalisiert auf 100). */
export default function OverlayChart({
  a,
  b,
  height = 300,
  normalize = false,
  corrWindow = 60,
}: OverlayChartProps) {
  const [seriesA, setSeriesA] = useState<{ label: string; points: SeriesPoint[] } | null>(null);
  const [seriesB, setSeriesB] = useState<{ label: string; points: SeriesPoint[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadSeries(a), loadSeries(b)])
      .then(([ra, rb]) => {
        setSeriesA(ra);
        setSeriesB(rb);
        setError(null);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [a.type, a.key, b.type, b.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { points, corr } = useMemo(() => {
    if (!seriesA || !seriesB) return { points: [] as TimeSeriesPoint[], corr: null as number | null };

    const mapB = new Map(seriesB.points.map((p) => [p.date, p.value]));
    const common = seriesA.points.filter((p) => mapB.has(p.date));

    const baseA = common[0]?.value ?? 1;
    const baseB = common[0] ? mapB.get(common[0].date)! : 1;

    const points: TimeSeriesPoint[] = common.map((p) => ({
      date: p.date,
      a: normalize && baseA !== 0 ? (p.value / baseA) * 100 : p.value,
      b: normalize && baseB !== 0 ? (mapB.get(p.date)! / baseB) * 100 : mapB.get(p.date)!,
    }));

    const corr = rollingCorrelation(
      common.map((p) => p.value),
      common.map((p) => mapB.get(p.date)!),
      corrWindow,
    );
    return { points, corr };
  }, [seriesA, seriesB, normalize, corrWindow]);

  if (error) {
    return <div className="h-40 flex items-center justify-center text-down text-sm font-mono">{error}</div>;
  }
  if (!seriesA || !seriesB) {
    return <div className="h-40 flex items-center justify-center text-muted text-sm font-mono">Lade Overlay …</div>;
  }

  return (
    <div>
      <TimeSeriesChart
        data={points}
        series={[
          { key: "a", label: seriesA.label, color: chart.accent },
          { key: "b", label: seriesB.label, color: chart.warn, yAxis: normalize ? "left" : "right" },
        ]}
        height={height}
        defaultTimeframe="5J"
      />
      {corr !== null && (
        <div className="text-[11px] text-muted font-mono mt-1">
          Rollierende {corrWindow}d-Korrelation:{" "}
          <span className={corr > 0.3 ? "text-up" : corr < -0.3 ? "text-down" : "text-warn"}>
            {corr.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
