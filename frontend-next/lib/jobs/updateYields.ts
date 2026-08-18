import type { SupabaseClient } from "@supabase/supabase-js";
import { fetch2yYield, yield2yId, YIELD_2Y_CCYS } from "@/lib/sources/yields";
import { chunkUpsert } from "./util";

/**
 * 2-Jahres-Renditen holen — die Zinserwartung des Marktes.
 *
 * Speicherung wie bei BIS in `fred_series` unter synthetischen IDs (`Y2_USD`,
 * `Y2_EUR`, …), Frische-Tracking in `fred_series_meta`. Damit gilt für sie
 * dieselbe Stale-Logik und dieselbe Datenlage-Anzeige wie für alles andere —
 * eine eigene Tabelle hätte nur eine zweite Wahrheit erzeugt.
 *
 * Jede Währung wird einzeln behandelt: Eine tote Quelle markiert genau ihre
 * Serie als stale und lässt die anderen sieben in Ruhe. Erst wenn **keine**
 * einzige Quelle antwortet, wirft der Job — dann ist nicht eine Behörde
 * offline, sondern der Netzweg des Deployments kaputt, und das soll man sehen.
 */
export async function updateYields(
  db: SupabaseClient,
): Promise<Record<string, unknown>> {
  // Rollierendes 4-Jahres-Fenster: deckt Revisionen ab, heilt Lücken selbst
  // und reicht für das 3-Jahres-Perzentil der Confluence-Seite.
  const start = new Date();
  start.setFullYear(start.getFullYear() - 4);
  const abDatum = start.toISOString().slice(0, 10);
  const jetzt = new Date().toISOString();

  const ergebnisse = await Promise.all(
    YIELD_2Y_CCYS.map(async (ccy) => {
      const id = yield2yId(ccy);
      let obs: Awaited<ReturnType<typeof fetch2yYield>> = null;
      try {
        obs = await fetch2yYield(ccy, abDatum);
      } catch (e) {
        console.error(`[yields] ${ccy}: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (!obs || obs.length === 0) {
        await db.from("fred_series_meta").upsert(
          { series_id: id, last_fetched: jetzt, is_stale: true },
          { onConflict: "series_id" },
        );
        return { ccy, rows: 0, ok: false, last: null as string | null };
      }

      const zeilen = obs
        .filter((o) => o.date >= abDatum)
        .map((o) => ({ series_id: id, date: o.date, value: o.value }));
      const geschrieben = await chunkUpsert(db, "fred_series", zeilen, "series_id,date");

      const letztes = obs[obs.length - 1].date;
      // Tagesserie: älter als 14 Tage heisst tot, nicht „Feiertag".
      const alterTage = (Date.now() - Date.parse(`${letztes}T00:00:00Z`)) / 86_400_000;
      await db.from("fred_series_meta").upsert(
        { series_id: id, last_date: letztes, last_fetched: jetzt, is_stale: alterTage > 14 },
        { onConflict: "series_id" },
      );
      return { ccy, rows: geschrieben, ok: alterTage <= 14, last: letztes };
    }),
  );

  const lebendig = ergebnisse.filter((r) => r.ok);
  if (lebendig.length === 0) {
    throw new Error(
      "keine einzige 2Y-Quelle erreichbar — " +
        ergebnisse.map((r) => r.ccy).join(", "),
    );
  }

  return {
    quellen: ergebnisse.length,
    lebendig: lebendig.length,
    rows: ergebnisse.reduce((s, r) => s + r.rows, 0),
    stand: Object.fromEntries(ergebnisse.map((r) => [r.ccy, r.last ?? "—"])),
  };
}
