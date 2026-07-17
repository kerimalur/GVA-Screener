"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import type { RealYieldPoint } from "@/lib/calc/realYield";

/**
 * Verlaufs-Chart der Real-Yield-Ansicht: Real Yield (bzw. Paar-Differenz) je
 * Monat als Balken (grün ≥ 0, rot < 0), Leitzins & CPI YoY als Linien.
 * Alle Serien in derselben Einheit (%/pp) → bewusst EINE Y-Achse.
 */

const WINDOWS = ["12M", "18M", "Max"] as const;
type HistoryWindow = (typeof WINDOWS)[number];

function cutoffFor(w: HistoryWindow): string | null {
  if (w === "Max") return null;
  const d = new Date();
  d.setMonth(d.getMonth() - (w === "12M" ? 12 : 18));
  return d.toISOString().slice(0, 10);
}

const fmtMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });

export default function RealYieldHistoryChart({
  data,
  ryLabel,
  rateLabel,
  cpiLabel,
  unit = "%",
  height = 280,
}: {
  data: RealYieldPoint[];
  ryLabel: string;
  rateLabel: string;
  cpiLabel: string;
  unit?: string;
  height?: number;
}) {
  const [win, setWin] = useState<HistoryWindow>("18M");

  const visible = useMemo(() => {
    const cutoff = cutoffFor(win);
    return cutoff ? data.filter((p) => p.date >= cutoff) : data;
  }, [data, win]);

  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-muted text-sm font-mono"
      >
        Keine Daten für diese Auswahl
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 mb-2 items-center">
        <span className="mr-auto text-[10px] font-mono text-muted">
          {visible.length} von {data.length} Monaten
        </span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setWin(w)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
              win === w
                ? "bg-accent/15 text-accent border-accent"
                : "text-muted border-border hover:border-border2"
            }`}
          >
            {w}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div
          style={{ height }}
          className="flex items-center justify-center text-muted text-sm font-mono"
        >
          Keine Daten im gewählten Zeitraum
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={visible} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fill: chart.text, fontSize: 10, fontFamily: "monospace" }}
              tickFormatter={fmtMonth}
              stroke={chart.axis}
              minTickGap={30}
            />
            <YAxis
              tick={{ fill: chart.text, fontSize: 10, fontFamily: "monospace" }}
              stroke={chart.axis}
              tickFormatter={(v: number) => v.toFixed(1)}
              domain={["auto", "auto"]}
              width={50}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(l) => fmtMonth(String(l))}
              formatter={(value, name) => [
                typeof value === "number"
                  ? `${value >= 0 ? "+" : ""}${value.toFixed(2)} ${unit}`
                  : String(value),
                String(name),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: chart.text }} />
            <ReferenceLine y={0} stroke={chart.faint} strokeDasharray="4 4" />
            <Bar
              dataKey="realYield"
              name={`${ryLabel} (Balken)`}
              fill={chart.up}
              maxBarSize={22}
              radius={[2, 2, 0, 0]}
            >
              {visible.map((p) => (
                <Cell
                  key={p.date}
                  fill={p.realYield >= 0 ? chart.up : chart.down}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="rate"
              name={rateLabel}
              stroke={chart.accent}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="cpi"
              name={cpiLabel}
              stroke={chart.warn}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
