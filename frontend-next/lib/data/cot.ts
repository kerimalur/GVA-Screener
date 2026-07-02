import type { SupabaseClient } from "@supabase/supabase-js";
import type { CotReportRow, PriceDailyRow } from "@/lib/supabase/types";
import { pagedSelect } from "./util";
import { rollingPercentile } from "@/lib/calc/percentile";

export interface CotSeriesPoint {
  date: string;
  net: number;
  noncommLong: number;
  noncommShort: number;
  commNet: number;
  nonreptNet: number;
  openInterest: number | null;
  percentile: number | null;
}

/** Volle COT-Historie eines Contracts mit Netto-Positionen + Rolling-Perzentil. */
export async function getCotSeries(
  db: SupabaseClient,
  contractCode: string,
  windowWeeks = 260,
): Promise<CotSeriesPoint[]> {
  const rows = await pagedSelect<CotReportRow>(
    db,
    "cot_reports",
    "*",
    (q) => q.eq("contract_code", contractCode).order("report_date", { ascending: true }),
  );

  const nets = rows.map((r) => (r.noncomm_long ?? 0) - (r.noncomm_short ?? 0));
  const percentiles = rollingPercentile(nets, windowWeeks);

  return rows.map((r, i) => ({
    date: r.report_date,
    net: nets[i],
    noncommLong: r.noncomm_long ?? 0,
    noncommShort: r.noncomm_short ?? 0,
    commNet: (r.comm_long ?? 0) - (r.comm_short ?? 0),
    nonreptNet: (r.nonrept_long ?? 0) - (r.nonrept_short ?? 0),
    openInterest: r.open_interest,
    percentile: percentiles[i],
  }));
}

/** Letzte zwei Reports je Contract (aktuell + Vorwoche) für Snapshot-Tabelle. */
export async function getLatestReports(
  db: SupabaseClient,
): Promise<Map<string, { latest: CotReportRow; prev: CotReportRow | null }>> {
  // letzte ~3 Wochen reichen für latest+prev aller 12 Contracts
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 25);
  const { data, error } = await db
    .from("cot_reports")
    .select("*")
    .gte("report_date", cutoff.toISOString().slice(0, 10))
    .order("report_date", { ascending: false });
  if (error) throw new Error(error.message);

  const map = new Map<string, { latest: CotReportRow; prev: CotReportRow | null }>();
  for (const row of (data ?? []) as CotReportRow[]) {
    const entry = map.get(row.contract_code);
    if (!entry) map.set(row.contract_code, { latest: row, prev: null });
    else if (!entry.prev) entry.prev = row;
  }
  return map;
}

/** Tagesschlusskurse eines Instruments (chronologisch). */
export async function getPrices(
  db: SupabaseClient,
  instrument: string,
  since?: string,
): Promise<Array<Pick<PriceDailyRow, "date" | "close">>> {
  return pagedSelect<Pick<PriceDailyRow, "date" | "close">>(
    db,
    "price_daily",
    "date, close",
    (q) => {
      let query = q.eq("instrument", instrument).order("date", { ascending: true });
      if (since) query = query.gte("date", since);
      return query;
    },
  );
}
