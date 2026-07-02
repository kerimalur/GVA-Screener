import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "./util";
import type { SeasonalityResult } from "@/lib/calc/seasonality";

export interface SeasonalityStatRow {
  instrument: string;
  cal_month: number;
  avg_return: number;
  hit_rate: number;
  n_years: number;
}

/** Saisonalitäts-Statistiken aus der Postgres-View (alle Instrumente). */
export async function getSeasonalityStats(
  db: SupabaseClient,
): Promise<Map<string, SeasonalityResult>> {
  const rows = await pagedSelect<SeasonalityStatRow>(
    db,
    "seasonality_stats",
    "*",
    (q) => q.order("instrument").order("cal_month"),
  );

  const byInstrument = new Map<string, SeasonalityResult>();
  for (const row of rows) {
    let entry = byInstrument.get(row.instrument);
    if (!entry) {
      entry = {
        months: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          avgReturn: 0,
          hitRate: 0,
          years: 0,
        })),
        yearsCovered: 0,
      };
      byInstrument.set(row.instrument, entry);
    }
    entry.months[row.cal_month - 1] = {
      month: row.cal_month,
      avgReturn: row.avg_return,
      hitRate: row.hit_rate,
      years: row.n_years,
    };
    entry.yearsCovered = Math.max(entry.yearsCovered, row.n_years);
  }
  return byInstrument;
}
