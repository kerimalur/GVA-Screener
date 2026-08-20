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
 *
 * ── Warum dieser Job laut ist (17.08.2026) ───────────────────────────────
 * Vom 1. Juli bis zum 17. August 2026 stand die ganze FRED-Kette still —
 * 47 Tage, in denen jede Nacht `status: "ok"` protokolliert wurde. Der Grund
 * war nicht der Ausfall, sondern die Bewertung des Ausfalls: geworfen wurde
 * nur, wenn **alle** Serien fehlschlugen. Fehlte der Schlüssel, gab
 * `fetchSeries` für jede Serie brav `null` zurück, `is_stale` wanderte in
 * eine Tabelle, die niemand ansieht, und der Job galt als erfolgreich.
 *
 * Seither gilt: fehlender Schlüssel = sofortiger Abbruch mit Klartext, und
 * ein Viertel tote Serien = Fehler, kein „ok". Ein Job, der einen Ausfall
 * überlebt, ohne ihn zu melden, ist schlimmer als einer, der abstürzt.
 */

/** Ab welchem Anteil toter Serien der Lauf als Fehler gilt. */
export const FRED_FEHLER_ANTEIL = 0.25;

export async function updateFred(
  db: SupabaseClient,
  opts: { only?: string[] } = {},
): Promise<Record<string, unknown>> {
  if (!process.env.FRED_API_KEY) {
    throw new Error(
      "FRED_API_KEY fehlt in der Env — ohne Schlüssel liefert die FRED-API " +
        "nichts, und der Lauf würde stillschweigend nichts schreiben. " +
        "Key kostenlos unter fred.stlouisfed.org/docs/api/api_key.html, " +
        "danach in Vercel als FRED_API_KEY setzen und neu deployen.",
    );
  }

  // Eingestellte Serien fliegen hier raus, nicht erst beim Fehlschlag: FRED
  // antwortet auf sie mit "The series does not exist", und 21 solcher Zeilen
  // je Lauf machen aus dem Log eine Tapete, in der ein echter Ausfall
  // untergeht. Ihre Definition bleibt im Katalog stehen — die alten Werte
  // liegen weiter in der Datenbank und werden im Rückblick gebraucht.
  const catalog = FRED_CATALOG.filter(
    (s) => s.source !== "bis" && !s.eingestellt
      && (!opts.only || opts.only.includes(s.id)),
  );
  const eingestellt = FRED_CATALOG.filter((s) => s.eingestellt).length;

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
        // `stumm` = die Anfrage selbst kam ohne Daten zurück (Schlüssel,
        // Netz, tote Serien-ID). Das ist etwas anderes als eine Serie, die
        // antwortet und nur alt ist — und nur das Erste ist ein Kettenfehler.
        return { written: 0, stale: true, stumm: true };
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
      return { written, stale, stumm: false };
    }),
  );

  let totalRows = 0;
  let staleCount = 0;
  let stummCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      if (r.value.stale) staleCount += 1;
      if (r.value.stumm) stummCount += 1;
      totalRows += r.value.written ?? 0;
    } else {
      errors.push(`${catalog[i].id}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    }
  }

  // Gezählt wird, was auf einen **Kettenfehler** hindeutet: geworfene
  // Ausnahmen und stumme Antworten. Serien, die antworten und nur alt sind
  // (eingestellte OECD-Feeds), stehen bewusst NICHT darin — die sind seit
  // Jahren tot und dürfen den Lauf nicht dauerhaft rot färben. Sie tauchen
  // als `stale` in der Datenlage auf, wo sie hingehören.
  const kaputt = errors.length + stummCount;
  const grenze = Math.max(1, Math.ceil(catalog.length * FRED_FEHLER_ANTEIL));

  if (kaputt >= grenze) {
    const beispiel = errors[0]
      ?? `${stummCount} Serien antworteten ohne Daten (kein Fehler geworfen)`;
    throw new Error(
      `${kaputt} von ${catalog.length} FRED-Serien liefern nichts (Grenze ${grenze}): ${beispiel}. ` +
        "Häufigste Ursache: FRED_API_KEY fehlt, ist abgelaufen oder wurde nach " +
        "dem letzten Deploy nicht übernommen.",
    );
  }

  return {
    series: catalog.length,
    eingestellt,
    rows: totalRows,
    stale: staleCount,
    stumm: stummCount,
    errors,
  };
}
