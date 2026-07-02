"use client";

import { useRouter } from "next/navigation";
import HeatmapGrid from "@/components/charts/HeatmapGrid";
import { MONTH_LABELS } from "@/lib/calc/seasonality";

export interface SeasonRow {
  instrument: string;
  displayName: string;
  values: (number | null)[]; // 12 Ø-Returns
}

/** Instrument × Monat, aktueller Monat markiert; Klick öffnet Detail. */
export default function SeasonalityHeatmap({ rows }: { rows: SeasonRow[] }) {
  const router = useRouter();
  const currentMonth = new Date().getMonth(); // 0-basiert

  const maxAbs = Math.max(
    0.2,
    ...rows.flatMap((r) => r.values.map((v) => Math.abs(v ?? 0))),
  );

  return (
    <HeatmapGrid
      rows={rows.map((r) => r.displayName)}
      cols={MONTH_LABELS}
      cells={rows.map((r) =>
        r.values.map((v, m) => ({
          value: v,
          highlight: m === currentMonth,
          title: `${r.displayName} ${MONTH_LABELS[m]}: Ø ${v !== null ? v.toFixed(2) : "–"} %`,
        })),
      )}
      min={-maxAbs}
      max={maxAbs}
      digits={2}
      onCellClick={(ri) => router.push(`/saisonalitaet?instrument=${rows[ri].instrument}`)}
    />
  );
}
