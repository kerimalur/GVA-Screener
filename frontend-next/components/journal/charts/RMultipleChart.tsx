"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import type { Trade } from "@/lib/journal/types";

/** Histogramm der R-Multiples in 0.5R-Buckets */
export default function RMultipleChart({
  trades,
  height = 200,
}: {
  trades: Trade[];
  height?: number;
}) {
  const buckets = new Map<number, number>();
  for (const t of trades) {
    const bucket = Math.round((t.rMultiple || 0) * 2) / 2;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }
  const data = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, count]) => ({ r, count, label: `${r > 0 ? "+" : ""}${r}R` }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted text-[12px]" style={{ height }}>
        Keine Daten
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: chart.text, fontSize: 10 }} stroke={chart.axis} />
        <YAxis tick={{ fill: chart.text, fontSize: 10 }} stroke={chart.axis} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => [Number(value), "Trades"]}
          cursor={{ fill: chart.grid, opacity: 0.4 }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.r} fill={d.r > 0 ? chart.up : d.r < 0 ? chart.down : chart.neutral} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
