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

const FLOWS = [
  // 771 = year-on-year changes, in per cent
  { flow: "WS_LONG_CPI", key: `M.${AREAS_KEY}.771`, idFor: bisCpiId },
  { flow: "WS_CBPOL", key: `M.${AREAS_KEY}`, idFor: bisPolicyId },
] as const;

export async function updateBis(db: SupabaseClient): Promise<Record<string, unknown>> {
  // Rollierendes 4-Jahres-Fenster: deckt Revisionen ab und heilt Lücken selbst.
  const start = new Date();
  start.setFullYear(start.getFullYear() - 4);
  const startPeriod = start.toISOString().slice(0, 7);
  const now = new Date().toISOString();

  let totalRows = 0;
  let staleFlows = 0;

  for (const f of FLOWS) {
    const byArea = await fetchBisFlow(f.flow, f.key, startPeriod);

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
      metas.push({
        series_id: id,
        last_date: obs[obs.length - 1].date,
        last_fetched: now,
        is_stale: false,
      });
    }
    totalRows += await chunkUpsert(db, "fred_series", rows, "series_id,date");
    await db.from("fred_series_meta").upsert(metas, { onConflict: "series_id" });
  }

  if (staleFlows === FLOWS.length) throw new Error("BIS-API nicht erreichbar (beide Flows)");
  return { rows: totalRows, staleFlows };
}
