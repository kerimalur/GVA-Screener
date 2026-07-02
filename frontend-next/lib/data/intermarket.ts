import type { SupabaseClient } from "@supabase/supabase-js";
import { getPrices } from "./cot";
import { getFredSeries } from "./fred";
import { computeDxy } from "@/lib/calc/dxy";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";
import type { SeriesPoint } from "@/lib/calc/seriesMath";

export interface IntermarketData {
  dxy: SeriesPoint[];
  broad: SeriesPoint[];
  impact: Array<{ pair: string; ret1M: number | null; usdSide: "base" | "quote" }>;
}

/** DXY (offizielle Formel) + Broad-Dollar + 1M-Returns aller USD-Paare. */
export async function loadIntermarketData(db: SupabaseClient): Promise<IntermarketData> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 10);
  const sinceStr = since.toISOString().slice(0, 10);

  const [eur, jpy, gbp, cad, chf, sek, broad] = await Promise.all([
    getPrices(db, "EUR_USD", sinceStr),
    getPrices(db, "USD_JPY", sinceStr),
    getPrices(db, "GBP_USD", sinceStr),
    getPrices(db, "USD_CAD", sinceStr),
    getPrices(db, "USD_CHF", sinceStr),
    getFredSeries(db, "DEXSDUS", sinceStr),
    getFredSeries(db, "DTWEXBGS", sinceStr),
  ]);

  const toSeries = (rows: Array<{ date: string; close: number }>) =>
    rows.map((r) => ({ date: r.date, value: r.close }));

  const dxy = computeDxy({
    EUR_USD: toSeries(eur),
    USD_JPY: toSeries(jpy),
    GBP_USD: toSeries(gbp),
    USD_CAD: toSeries(cad),
    USD_SEK: sek,
    USD_CHF: toSeries(chf),
  });

  const usdPairs = FX_INSTRUMENTS.filter(
    (i) => i.baseCcy === "USD" || i.quoteCcy === "USD",
  );
  const impactSince = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const impact: IntermarketData["impact"] = [];
  for (const inst of usdPairs) {
    const prices = await getPrices(db, inst.instrument, impactSince);
    const ret =
      prices.length > 21
        ? (prices[prices.length - 1].close / prices[prices.length - 22].close - 1) * 100
        : null;
    impact.push({
      pair: inst.displayName,
      ret1M: ret,
      usdSide: inst.baseCcy === "USD" ? "base" : "quote",
    });
  }

  return { dxy, broad, impact };
}
