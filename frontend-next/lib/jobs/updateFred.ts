import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSeries } from "@/lib/sources/fred";
import { FRED_CATALOG } from "@/lib/constants/fredSeries";
import { chunkUpsert } from "./util";

/**
 * Alle Katalog-Serien aktualisieren. FRED-CSV liefert immer Vollhistorie —
 * geschrieben wird nur ab (letztes Datum − 45 Tage) für Revisionen;
 * beim ersten Lauf die volle Historie. Tote Serien -> is_stale.
 */
export async function updateFred(
  db: SupabaseClient,
  opts: { only?: string[] } = {},
): Promise<Record<string, unknown>> {
  const catalog = FRED_CATALOG.filter((s) => !opts.only || opts.only.includes(s.id));

  let totalRows = 0;
  let staleCount = 0;
  const errors: string[] = [];

  for (const series of catalog) {
    try {
      const observations = await fetchSeries(series.id);
      const now = new Date().toISOString();

      if (!observations) {
        staleCount += 1;
        await db.from("fred_series_meta").upsert(
          { series_id: series.id, last_fetched: now, is_stale: true },
          { onConflict: "series_id" },
        );
        continue;
      }

      const { data: meta } = await db
        .from("fred_series_meta")
        .select("last_date")
        .eq("series_id", series.id)
        .maybeSingle();

      let toWrite = observations;
      if (meta?.last_date) {
        const cutoff = new Date(meta.last_date);
        cutoff.setDate(cutoff.getDate() - 45); // Revisionsfenster
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        toWrite = observations.filter((o) => o.date >= cutoffStr);
      }

      const rows = toWrite.map((o) => ({
        series_id: series.id,
        date: o.date,
        value: o.value,
      }));
      totalRows += await chunkUpsert(db, "fred_series", rows, "series_id,date");

      await db.from("fred_series_meta").upsert(
        {
          series_id: series.id,
          last_date: observations[observations.length - 1].date,
          last_fetched: now,
          is_stale: false,
        },
        { onConflict: "series_id" },
      );
    } catch (e) {
      errors.push(`${series.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (errors.length === catalog.length) {
    throw new Error(`alle Serien fehlgeschlagen: ${errors[0]}`);
  }
  return { series: catalog.length, rows: totalRows, stale: staleCount, errors };
}
