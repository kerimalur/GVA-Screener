"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import type { Trade } from "@/lib/journal/types";

/** Win/Loss/BE-Donut */
export default function WinRateChart({
  trades,
  height = 200,
}: {
  trades: Trade[];
  height?: number;
}) {
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const be = trades.filter((t) => t.result === "breakeven").length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

  const data = [
    { name: "Wins", value: wins, color: chart.up },
    { name: "Losses", value: losses, color: chart.down },
    { name: "Breakeven", value: be, color: chart.neutral },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted text-[12px]" style={{ height }}>
        Keine Daten
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="62%"
            outerRadius="85%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-lg font-semibold font-mono">{winRate.toFixed(0)}%</span>
        <span className="text-[10px] text-muted uppercase tracking-wide">Win Rate</span>
      </div>
    </div>
  );
}
