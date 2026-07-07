import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "./util";
import type { SeriesPoint } from "@/lib/calc/seriesMath";
import { yoyFromIndex } from "@/lib/calc/seriesMath";
import { seriesFor, FRED_BY_ID, type FredCategory } from "@/lib/constants/fredSeries";

/** Zeitreihe aus fred_series (chronologisch, nur non-null). */
export async function getFredSeries(
  db: SupabaseClient,
  seriesId: string,
  since?: string,
): Promise<SeriesPoint[]> {
  const rows = await pagedSelect<{ date: string; value: number | null }>(
    db,
    "fred_series",
    "date, value",
    (q) => {
      let query = q.eq("series_id", seriesId).order("date", { ascending: true });
      if (since) query = query.gte("date", since);
      return query;
    },
  );
  return rows
    .filter((r): r is { date: string; value: number } => r.value !== null)
    .map((r) => ({ date: r.date, value: r.value }));
}

/** Stale-Flags aller Serien. */
export async function getStaleFlags(db: SupabaseClient): Promise<Map<string, boolean>> {
  const { data } = await db.from("fred_series_meta").select("series_id, is_stale");
  return new Map((data ?? []).map((r) => [r.series_id as string, Boolean(r.is_stale)]));
}

/** 5 Jahre zurück — reicht für YoY (12/4 Lags) + 24er-Sparkline aller Frequenzen. */
function defaultCategorySince(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
}

export interface CategoryValue {
  seriesId: string;
  label: string;
  latest: number | null;
  latestDate: string | null;
  /** letzte 24 Punkte für Sparkline */
  spark: SeriesPoint[];
  isStale: boolean;
  isYoY: boolean;
}

/**
 * Kategorie-Wert eines Währungsraums (CPI/GDP-Indizes werden zu YoY %
 * umgerechnet). null wenn keine Serie definiert.
 */
export async function getCategoryValue(
  db: SupabaseClient,
  ccy: string,
  category: FredCategory,
  staleFlags: Map<string, boolean>,
  since?: string,
): Promise<CategoryValue | null> {
  const def = seriesFor(ccy, category);
  if (!def) return null;

  // Nur Latest + 24-Punkte-Sparkline nötig — ohne Cutoff lädt z.B. DGS10
  // die komplette Tageshistorie seit 1962 (16+ paginierte Requests).
  let series = await getFredSeries(db, def.id, since ?? defaultCategorySince());
  let isYoY = false;
  if (def.isIndex && series.length > 0) {
    const quarterly = def.id.includes("Q") || category === "gdp";
    series = yoyFromIndex(series, quarterly ? 4 : 12);
    isYoY = true;
  }

  const latest = series[series.length - 1] ?? null;
  return {
    seriesId: def.id,
    label: def.label,
    latest: latest?.value ?? null,
    latestDate: latest?.date ?? null,
    spark: series.slice(-24),
    isStale: staleFlags.get(def.id) ?? series.length === 0,
    isYoY,
  };
}

/** 10Y-Rendite-Serie eines Währungsraums (US täglich, Rest monatlich). */
export async function getYield10(
  db: SupabaseClient,
  ccy: string,
  since?: string,
): Promise<SeriesPoint[]> {
  const def = seriesFor(ccy, "yield_10y");
  if (!def) return [];
  return getFredSeries(db, def.id, since);
}

/** Leitzins-Serie eines Währungsraums. */
export async function getPolicyRate(
  db: SupabaseClient,
  ccy: string,
  since?: string,
): Promise<SeriesPoint[]> {
  const def = seriesFor(ccy, "policy_rate");
  if (!def) return [];
  return getFredSeries(db, def.id, since);
}

export function labelFor(seriesId: string): string {
  return FRED_BY_ID.get(seriesId)?.label ?? seriesId;
}
