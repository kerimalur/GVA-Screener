"use client";

import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import { chart } from "@/components/charts/chartTheme";
import type { SeriesPoint } from "@/lib/calc/seriesMath";

interface DxyChartProps {
  dxy: SeriesPoint[];
  broad: SeriesPoint[];
}

/** DXY (berechnet) + Broad Dollar Index (FRED) als Sekundärlinie. */
export default function DxyChart({ dxy, broad }: DxyChartProps) {
  const broadMap = new Map(broad.map((p) => [p.date, p.value]));
  let last: number | null = null;
  const points = dxy.map((p) => {
    last = broadMap.get(p.date) ?? last;
    return { date: p.date, dxy: p.value, broad: last };
  });

  return (
    <TimeSeriesChart
      data={points}
      series={[
        { key: "dxy", label: "DXY (berechnet)", color: chart.accent },
        { key: "broad", label: "Broad Dollar (FRED)", color: chart.warn, yAxis: "right", dashed: true },
      ]}
      height={320}
      yDigits={1}
      defaultTimeframe="5J"
    />
  );
}
