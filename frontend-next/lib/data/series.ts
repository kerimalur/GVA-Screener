import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeriesPoint } from "@/lib/calc/seriesMath";
import { diffSeries } from "@/lib/calc/seriesMath";
import { getFredSeries, getYield10, getPolicyRate, labelFor } from "./fred";
import { getPrices, getCotSeries } from "./cot";
import { pagedSelect } from "./util";
import { CONTRACT_BY_CODE } from "@/lib/constants/cftcContracts";
import { INSTRUMENTS } from "@/lib/constants/instruments";

export type SeriesType =
  | "price"      // key = Instrument (EUR_USD)
  | "fred"       // key = FRED-Serie (DGS10)
  | "cot_net"    // key = Contract-Code (099741)
  | "sentiment"  // key = Pair (EURUSD) -> Long-%
  | "spread_10y" // key = FX-Instrument -> 10Y base − quote
  | "rate_diff"; // key = FX-Instrument -> Leitzins base − quote

export interface ResolvedSeries {
  label: string;
  points: SeriesPoint[];
}

function instrumentCcys(key: string): { base: string; quote: string } | null {
  const inst = INSTRUMENTS.find((i) => i.instrument === key && i.kind === "fx");
  if (!inst || !inst.baseCcy || !inst.quoteCcy) return null;
  return { base: inst.baseCcy, quote: inst.quoteCcy };
}

/** Generische Serien-Auflösung — genutzt von /vergleich, Overlays, Makro-Charts. */
export async function resolveSeries(
  db: SupabaseClient,
  type: SeriesType,
  key: string,
  since?: string,
): Promise<ResolvedSeries> {
  switch (type) {
    case "price": {
      const prices = await getPrices(db, key, since);
      return { label: key, points: prices.map((p) => ({ date: p.date, value: p.close })) };
    }
    case "fred": {
      return { label: labelFor(key), points: await getFredSeries(db, key, since) };
    }
    case "cot_net": {
      const contract = CONTRACT_BY_CODE.get(key);
      if (!contract) throw new Error(`unbekannter Contract-Code '${key}'`);
      const series = await getCotSeries(db, key);
      const points = series
        .map((s) => ({ date: s.date, value: s.net }))
        .filter((p) => !since || p.date >= since);
      return { label: `COT Netto ${contract.label}`, points };
    }
    case "sentiment": {
      const rows = await pagedSelect<{ captured_at: string; long_pct: number | null }>(
        db,
        "sentiment_snapshots",
        "captured_at, long_pct",
        (q) => {
          let query = q.eq("pair", key).order("captured_at", { ascending: true });
          if (since) query = query.gte("captured_at", since);
          return query;
        },
      );
      return {
        label: `Retail Long-% ${key}`,
        points: rows
          .filter((r): r is { captured_at: string; long_pct: number } => r.long_pct !== null)
          .map((r) => ({ date: r.captured_at.slice(0, 10), value: r.long_pct })),
      };
    }
    case "spread_10y": {
      const ccys = instrumentCcys(key);
      if (!ccys) throw new Error(`'${key}' ist kein FX-Instrument`);
      const [base, quote] = await Promise.all([
        getYield10(db, ccys.base, since),
        getYield10(db, ccys.quote, since),
      ]);
      return {
        label: `10Y-Spread ${ccys.base}−${ccys.quote}`,
        points: diffSeries(base, quote),
      };
    }
    case "rate_diff": {
      const ccys = instrumentCcys(key);
      if (!ccys) throw new Error(`'${key}' ist kein FX-Instrument`);
      const [base, quote] = await Promise.all([
        getPolicyRate(db, ccys.base, since),
        getPolicyRate(db, ccys.quote, since),
      ]);
      return {
        label: `Zinsdifferenz ${ccys.base}−${ccys.quote}`,
        points: diffSeries(base, quote),
      };
    }
    default:
      throw new Error(`unbekannter Serientyp '${type}'`);
  }
}
