"use client";

import BarSeriesChart from "@/components/charts/BarSeriesChart";
import { MONTH_LABELS } from "@/lib/calc/seasonality";
import type { MonthlyStat } from "@/lib/calc/seasonality";

interface SeasonalityDetailProps {
  displayName: string;
  months: MonthlyStat[];
  yearsCovered: number;
}

/** 12 Ø-Monatsreturns als Balken + Trefferquoten-Zeile. */
export default function SeasonalityDetail({
  displayName,
  months,
  yearsCovered,
}: SeasonalityDetailProps) {
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="space-y-3">
      <BarSeriesChart
        data={months.map((m) => ({
          label: MONTH_LABELS[m.month - 1],
          value: m.avgReturn,
          highlight: m.month === currentMonth,
        }))}
        height={280}
        valueLabel={`${displayName} Ø-Return %`}
        yDigits={2}
      />
      <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
        {months.map((m) => (
          <div
            key={m.month}
            className={`rounded p-1.5 text-center border ${
              m.month === currentMonth ? "border-accent bg-accent/10" : "border-border bg-surface2"
            }`}
          >
            <div className="text-[9px] text-muted">{MONTH_LABELS[m.month - 1]}</div>
            <div
              className={`text-[11px] font-mono font-bold ${
                m.hitRate >= 60 ? "text-up" : m.hitRate <= 40 ? "text-down" : "text-text"
              }`}
            >
              {m.years > 0 ? `${m.hitRate.toFixed(0)} %` : "–"}
            </div>
            <div className="text-[8px] text-faint">Treffer</div>
          </div>
        ))}
      </div>
      <p className={`text-[11px] font-mono ${yearsCovered < 8 ? "text-warn" : "text-faint"}`}>
        Datenbasis: ~{yearsCovered} Jahre
        {yearsCovered < 8 && " — Vorsicht, unter 8 Jahren ist die Saisonalität statistisch schwach."}
      </p>
    </div>
  );
}
