import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBisFlow } from "@/lib/sources/bis";
import { chunkUpsert } from "./util";

/**
 * BIS-Serien aktualisieren (CPI YoY + Leitzins, alle 8 G8-Währungen).
 * Hintergrund (Audit 2026-07): FRED-CSV-Transport tot + OECD-CPI-Serien auf
 * FRED eingestellt → BIS ist die funktionierende, keyless Ersatzquelle.
 * Speicherung in fred_series unter synthetischen IDs (BIS_CPI_YOY_/BIS_CBPOL_),
 * Frische-Tracking in fred_series_meta wie bei FRED-Serien.
 */

export const BIS_AREA_BY_CCY: Record<string, string> = {
  USD: "US", EUR: "XM", GBP: "GB", JPY: "JP",
  CHF: "CH", AUD: "AU", NZD: "NZ", CAD: "CA",
};
const CCY_BY_AREA = new Map(Object.entries(BIS_AREA_BY_CCY).map(([c, a]) => [a, c]));
const AREAS_KEY = Object.values(BIS_AREA_BY_CCY).join("+");

export const bisCpiId = (ccy: string) => `BIS_CPI_YOY_${ccy}`;
export const bisPolicyId = (ccy: string) => `BIS_CBPOL_${ccy}`;
/**
 * Tagesgenaue Leitzinsreihe — die eigentliche Zahl, die eine Notenbank
 * beschlossen hat, am Tag ihrer Gültigkeit.
 *
 * Warum zusätzlich zur Monatsreihe und nicht statt ihr: Die Monatsreihe hat
 * Datumsstempel auf dem Monatsersten. Beide in eine Serie zu schreiben ergäbe
 * eine Reihe, in der derselbe Tag zweimal vorkommt, einmal als Monatsmittel
 * und einmal als Tagesstand. Getrennte IDs kosten ein paar Zeilen und ersparen
 * eine Klasse von Fehlern, die niemand mehr findet.
 *
 * Der Grund für die Tagesreihe überhaupt: Die bisher benutzten OECD-Serien
 * (`IRSTCI01*`, `IR3TIB01*`) sind monatlich, hinken zwei bis drei Monate
 * hinterher und messen beim CHF und NZD gar nicht den Leitzins, sondern den
 * 3-Monats-Interbankensatz.
 */
export const bisPolicyDailyId = (ccy: string) => `BIS_CBPOL_D_${ccy}`;

interface BisFlussDef {
  flow: string;
  key: string;
  idFor: (ccy: string) => string;
  /** Monatsserien brauchen 'YYYY-MM', Tagesserien 'YYYY-MM-DD'. */
  taeglich?: boolean;
}

const FLOWS: BisFlussDef[] = [
  // 771 = year-on-year changes, in per cent
  { flow: "WS_LONG_CPI", key: `M.${AREAS_KEY}.771`, idFor: bisCpiId },
  { flow: "WS_CBPOL", key: `M.${AREAS_KEY}`, idFor: bisPolicyId },
  { flow: "WS_CBPOL", key: `D.${AREAS_KEY}`, idFor: bisPolicyDailyId, taeglich: true },
];

export async function updateBis(db: SupabaseClient): Promise<Record<string, unknown>> {
  // Rollierendes 4-Jahres-Fenster: deckt Revisionen ab und heilt Lücken selbst.
  const start = new Date();
  start.setFullYear(start.getFullYear() - 4);
  const startPeriod = start.toISOString().slice(0, 7);
  const startTag = start.toISOString().slice(0, 10);
  const now = new Date().toISOString();

  let totalRows = 0;
  let staleFlows = 0;

  for (const f of FLOWS) {
    const byArea = await fetchBisFlow(f.flow, f.key, f.taeglich ? startTag : startPeriod);

    if (!byArea) {
      staleFlows += 1;
      await db.from("fred_series_meta").upsert(
        Object.keys(BIS_AREA_BY_CCY).map((ccy) => ({
          series_id: f.idFor(ccy),
          last_fetched: now,
          is_stale: true,
        })),
        { onConflict: "series_id" },
      );
      continue;
    }

    const rows: Array<{ series_id: string; date: string; value: number }> = [];
    const metas: Array<{ series_id: string; last_date: string; last_fetched: string; is_stale: boolean }> = [];
    for (const [area, obs] of byArea) {
      const ccy = CCY_BY_AREA.get(area);
      if (!ccy || obs.length === 0) continue;
      const id = f.idFor(ccy);
      for (const o of obs) rows.push({ series_id: id, date: o.date, value: o.value });
      // Eine Antwort ist noch keine frische Zahl: BIS liefert eine
      // eingestellte Reihe weiterhin aus, nur eben ohne neue Werte. Deshalb
      // wird hier das Alter des jüngsten Werts geprüft, nicht der HTTP-Status.
      const letztes = obs[obs.length - 1].date;
      const alterTage = (Date.now() - Date.parse(`${letztes}T00:00:00Z`)) / 86_400_000;
      metas.push({
        series_id: id,
        last_date: letztes,
        last_fetched: now,
        is_stale: alterTage > (f.taeglich ? 14 : 100),
      });
    }
    totalRows += await chunkUpsert(db, "fred_series", rows, "series_id,date");
    await db.from("fred_series_meta").upsert(metas, { onConflict: "series_id" });
  }

  if (staleFlows === FLOWS.length) throw new Error("BIS-API nicht erreichbar (beide Flows)");
  return { rows: totalRows, staleFlows };
}
