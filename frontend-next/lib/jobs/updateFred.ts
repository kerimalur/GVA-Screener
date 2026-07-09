import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSeries } from "@/lib/sources/fred";
import { FRED_CATALOG } from "@/lib/constants/fredSeries";
import { chunkUpsert } from "./util";

/**
 * Alle Katalog-Serien parallel fetchen (Promise.allSettled).
 * FRED-CSV liefert immer Vollhistorie; geschrieben wird nur ab
 * (letztes Datum - 45 Tage) fuer Revisionen.
 * Tote Serien -> is_stale.
 */
export async function updateFred(
  db: SupabaseClient,
  opts: { only?: string[] } = {},
): Promise<Record<string, unknown>> {
  const catalog = FRED_CATALOG.filter((s) => !opts.only || opts.only.includes(s.id));

  // Letztes bekanntes Datum je Serie (parallel)
  const lastDates = await Promise.all(
    catalog.map(async (s) => {
      const { data } = await db
        .from("fred_series_meta")
        .select("last_date")
        .eq("series_id", s.id)
        .maybeSingle();
      return data?.last_date ?? null;
    }),
  );

  // Alle Serien parallel fetchen + schreiben
  const results = await Promise.allSettled(
    catalog.map(async (series, i) => {
      const now = new Date().toISOString();
      const observations = await fetchSeries(series.id);

      if (!observations) {
        await db.from("fred_series_meta").upsert(
          { series_id: series.id, last_fetched: now, is_stale: true },
          { onConflict: "series_id" },
        );
        return { stale: true };
      }

      const lastDate = lastDates[i];
      let toWrite = observations;
      if (lastDate) {
        const cutoff = new Date(lastDate);
        cutoff.setDate(cutoff.getDate() - 45);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        toWrite = observations.filter((o) => o.date >= cutoffStr);
      }

      const rows = toWrite.map((o) => ({
        series_id: series.id,
        date: o.date,
        value: o.value,
      }));
      const written = await chunkUpsert(db, "fred_series", rows, "series_id,date");

      await db.from("fred_series_meta").upsert(
        {
          series_id: series.id,
          last_date: observations[observations.length - 1].date,
          last_fetched: now,
          is_stale: false,
        },
        { onConflict: "series_id" },
      );
      return { written };
    }),
  );

  let totalRows = 0;
  let staleCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      if (r.value.stale) staleCount += 1;
      else totalRows += (r.value.written ?? 0);
    } else {
      errors.push(`${catalog[i].id}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    }
  }

  if (errors.length === catalog.length) {
    throw new Error(`alle Serien fehlgeschlagen: ${errors[0]}`);
  }
  return { series: catalog.length, rows: totalRows, stale: staleCount, errors };
}
