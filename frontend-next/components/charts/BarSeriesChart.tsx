"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { chart, tooltipStyle, fmtCompact } from "./chartTheme";

export interface BarPoint {
  label: string;
  value: number;
  highlight?: boolean;
}

interface BarSeriesChartProps {
  data: BarPoint[];
  height?: number;
  valueLabel?: string;
  yDigits?: number;
}

/** Balken pos/neg gefärbt (up/down); optional hervorgehobener Balken (accent). */
export default function BarSeriesChart({
  data,
  height = 260,
  valueLabel = "Wert",
  yDigits,
}: BarSeriesChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-muted text-sm font-mono">
        Keine Daten
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: chart.text, fontSize: 10, fontFamily: "monospace" }}
          stroke={chart.axis}
        />
        <YAxis
          tick={{ fill: chart.text, fontSize: 10, fontFamily: "monospace" }}
          stroke={chart.axis}
          tickFormatter={(v: number) => (yDigits != null ? v.toFixed(yDigits) : fmtCompact(v))}
          width={55}
        />
        {/* cursor: neutraler Hover — Blau kommt in der Palette nicht vor */}
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => [
            typeof value === "number"
              ? value.toLocaleString("de-DE", { maximumFractionDigits: 3 })
              : String(value),
            valueLabel,
          ]}
          cursor={{ fill: "rgba(255,255,255,0.06)" }}
        />
        <ReferenceLine y={0} stroke={chart.faint} />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.highlight ? chart.accent : d.value >= 0 ? chart.up : chart.down}
              fillOpacity={d.highlight ? 1 : 0.75}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
