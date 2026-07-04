"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
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

/** Equity-Verlauf in Kontowährung + optionale Drawdown-Fläche */
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="i"
          tick={{ fill: chart.text, fontSize: 10 }}
          stroke={chart.axis}
          tickFormatter={(i: number) => (data[i]?.date ? fmtDate(data[i].date) : "")}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: chart.text, fontSize: 10 }}
          stroke={chart.axis}
          tickFormatter={(v: number) => fmtNumber(v, 0)}
          width={70}
          domain={["auto", "auto"]}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(i) => {
            const idx = Number(i);
            return data[idx]?.date ? fmtDate(data[idx].date) : "Start";
          }}
          formatter={(value, name) => [
            fmtNumber(Number(value)),
            name === "balance" ? "Balance" : "Drawdown",
          ]}
        />
        <ReferenceLine y={startBalance} stroke={chart.faint} strokeDasharray="4 4" />
        {showDrawdown && (
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="none"
            fill={chart.down}
            fillOpacity={0.15}
            yAxisId={0}
          />
        )}
        <Area
          type="monotone"
          dataKey="balance"
          stroke={color}
          strokeWidth={2}
          fill="url(#equityFill)"
        />
        <Line type="monotone" dataKey="balance" stroke={color} strokeWidth={0} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
