"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { chart, tooltipStyle, fmtNumber, fmtDate } from "@/components/charts/chartTheme";
import type { Trade } from "@/lib/journal/types";

interface EquityChartProps {
  trades: Trade[];
  startBalance: number;
  showDrawdown?: boolean;
  height?: number;
}

/** Equity-Verlauf in Kontowährung + optionale Drawdown-Fläche (eigene Y-Achse) */
export default function EquityChart({
  trades,
  startBalance,
  showDrawdown = true,
  height = 420,
}: EquityChartProps) {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const data: { i: number; date: string; balance: number; drawdown: number }[] = [
    { i: 0, date: "", balance: startBalance, drawdown: 0 },
  ];
  let balance = startBalance;
  let peak = startBalance;
  for (let i = 0; i < sorted.length; i++) {
    balance += sorted[i].profitAmount ?? 0;
    if (balance > peak) peak = balance;
    data.push({
      i: i + 1,
      date: sorted[i].date,
      balance: Math.round(balance * 100) / 100,
      drawdown: Math.round((balance - peak) * 100) / 100,
    });
  }

  const positive = balance >= startBalance;
  const color = positive ? chart.up : chart.down;

  // Drawdown-Achse: Min-Wert + 50% Puffer damit die Fläche gut sichtbar ist
  const minDD = Math.min(...data.map((d) => d.drawdown), -0.01);
  const ddDomain: [number, number] = [minDD * 1.8, 0];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="ddFill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={chart.down} stopOpacity={0.4} />
            <stop offset="100%" stopColor={chart.down} stopOpacity={0.05} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />

        {/* Datum-Achse */}
        <XAxis
          dataKey="i"
          tick={{ fill: chart.text, fontSize: 10 }}
          stroke={chart.axis}
          tickFormatter={(i: number) => (data[i]?.date ? fmtDate(data[i].date) : "")}
          minTickGap={50}
        />

        {/* Balance-Achse (links) */}
        <YAxis
          yAxisId="bal"
          tick={{ fill: chart.text, fontSize: 10 }}
          stroke={chart.axis}
          tickFormatter={(v: number) => fmtNumber(v, 0)}
          width={72}
          domain={["auto", "auto"]}
        />

        {/* Drawdown-Achse (rechts, versteckt — nur für Skalierung) */}
        {showDrawdown && (
          <YAxis
            yAxisId="dd"
            orientation="right"
            hide
            domain={ddDomain}
          />
        )}

        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(i) => {
            const idx = Number(i);
            return data[idx]?.date ? fmtDate(data[idx].date) : "Start";
          }}
          formatter={(value, name) => {
            const v = Number(value);
            if (name === "balance") return [fmtNumber(v), "Balance"];
            if (name === "drawdown") return [fmtNumber(v), "Drawdown"];
            return [fmtNumber(v), name];
          }}
        />

        {/* Startlinie */}
        <ReferenceLine yAxisId="bal" y={startBalance} stroke={chart.faint} strokeDasharray="4 4" />

        {/* Drawdown-Fläche */}
        {showDrawdown && (
          <Area
            yAxisId="dd"
            type="monotone"
            dataKey="drawdown"
            stroke={chart.down}
            strokeWidth={1}
            fill="url(#ddFill)"
          />
        )}

        {/* Equity-Kurve */}
        <Area
          yAxisId="bal"
          type="monotone"
          dataKey="balance"
          stroke={color}
          strokeWidth={2}
          fill="url(#equityFill)"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
