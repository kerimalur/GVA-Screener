"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
  ReferenceLine,
} from "recharts";
import {
  chart,
  tooltipStyle,
  fmtCompact,
  fmtDate,
  timeframeCutoff,
  TIMEFRAMES,
  type Timeframe,
} from "./chartTheme";

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  yAxis?: "left" | "right";
  dashed?: boolean;
}

export interface TimeSeriesPoint {
  date: string; // 'YYYY-MM-DD'
  [key: string]: string | number | null;
}

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  series: SeriesDef[];
  height?: number;
  /** Zeitraum-Pills anzeigen (default true) */
  timeframes?: boolean;
  defaultTimeframe?: Timeframe;
  /** Brush-Zoom (default true ab 90 Punkten) */
  brush?: boolean;
  /** horizontale Referenzlinie (z.B. 0) */
  refLineY?: number;
  yDigits?: number;
}

export default function TimeSeriesChart({
  data,
  series,
  height = 320,
  timeframes = true,
  defaultTimeframe = "5J",
  brush,
  refLineY,
  yDigits,
}: TimeSeriesChartProps) {
  const [tf, setTf] = useState<Timeframe>(defaultTimeframe);

  const visible = useMemo(() => {
    const cutoff = timeframeCutoff(tf);
    return cutoff ? data.filter((d) => d.date >= cutoff) : data;
  }, [data, tf]);

  const hasRight = series.some((s) => s.yAxis === "right");
  const showBrush = brush ?? visible.length > 90;

  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-muted text-sm font-mono">
        Keine Daten — Backfill ausführen
      </div>
    );
  }

  return (
    <div>
      {timeframes && (
        <div className="flex gap-1 mb-2 items-center">
          <span className="mr-auto text-[10px] font-mono text-muted">
            {visible.length} von {data.length} Punkten
          </span>
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                tf === t
                  ? "bg-accent/15 text-accent border-accent"
                  : "text-muted border-border hover:border-border2"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
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
            tickFormatter={fmtDate}
            stroke={chart.axis}
            minTickGap={40}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: chart.text, fontSize: 10, fontFamily: "monospace" }}
            stroke={chart.axis}
            tickFormatter={(v: number) => (yDigits != null ? v.toFixed(yDigits) : fmtCompact(v))}
            domain={["auto", "auto"]}
            width={55}
          />
          {hasRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: chart.text, fontSize: 10, fontFamily: "monospace" }}
              stroke={chart.axis}
              tickFormatter={(v: number) => fmtCompact(v)}
              domain={["auto", "auto"]}
              width={55}
            />
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(l) => fmtDate(String(l))}
            formatter={(value, name) => [
              typeof value === "number"
                ? value.toLocaleString("de-DE", { maximumFractionDigits: 5 })
                : String(value),
              String(name),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: chart.text }} />
          {refLineY != null && (
            <ReferenceLine yAxisId="left" y={refLineY} stroke={chart.faint} strokeDasharray="4 4" />
          )}
          {series.map((s, i) => (
            <Line
              key={s.key}
              yAxisId={s.yAxis ?? "left"}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? chart.palette[i % chart.palette.length]}
              strokeWidth={1.5}
              strokeDasharray={s.dashed ? "5 3" : undefined}
              dot={false}
              connectNulls
            />
          ))}
          {showBrush && (
            <Brush
              dataKey="date"
              height={24}
              stroke={chart.accent}
              fill={chart.surface}
              tickFormatter={fmtDate}
              travellerWidth={8}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}
