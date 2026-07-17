import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSeries } from "@/lib/sources/fred";
import { FRED_CATALOG, staleAllowanceDays } from "@/lib/constants/fredSeries";
import { chunkUpsert } from "./util";

/**
 * Alle FRED-Katalog-Serien parallel fetchen (Promise.allSettled) über die
 * offizielle FRED-API (immer Vollhistorie); geschrieben wird nur ab
 * (letztes Datum - 45 Tage) fuer Revisionen. BIS-gepflegte Serien
 * (source:"bis") werden übersprungen — die füllt updateBis.
 * is_stale = Fetch fehlgeschlagen ODER letzter Wert älter als die
 * Kadenz-Schwelle (staleAllowanceDays) — Quartalsserien gelten damit
 * innerhalb ihres Release-Zyklus als aktuell.
 */
export async function updateFred(
  db: SupabaseClient,
  opts: { only?: string[] } = {},
): Promise<Record<string, unknown>> {
  const catalog = FRED_CATALOG.filter(
    (s) => s.source !== "bis" && (!opts.only || opts.only.includes(s.id)),
  );

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

      // Alters-Check gegen den Publikations-Rhythmus: eine Serie kann
      // erfolgreich antworten und trotzdem tot sein (eingestellte OECD-Feeds).
      const lastObsDate = observations[observations.length - 1].date;
      const ageDays = (Date.now() - new Date(lastObsDate).getTime()) / 86_400_000;
      const stale = ageDays > staleAllowanceDays(series);

      await db.from("fred_series_meta").upsert(
        {
          series_id: series.id,
          last_date: lastObsDate,
          last_fetched: now,
          is_stale: stale,
        },
        { onConflict: "series_id" },
      );
      return { written, stale };
    }),
  );

  let totalRows = 0;
  let staleCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      if (r.value.stale) staleCount += 1;
      totalRows += r.value.written ?? 0;
    } else {
      errors.push(`${catalog[i].id}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    }
  }

  if (errors.length === catalog.length) {
    throw new Error(`alle Serien fehlgeschlagen: ${errors[0]}`);
  }
  return { series: catalog.length, rows: totalRows, stale: staleCount, errors };
}
