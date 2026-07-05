import type { SupabaseClient } from "@supabase/supabase-js";
import type { CotReportRow, CotTffRow, PriceDailyRow } from "@/lib/supabase/types";
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

function toSeriesPoints(rows: CotReportRow[], windowWeeks: number): CotSeriesPoint[] {
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
  return toSeriesPoints(rows, windowWeeks);
}

/**
 * COT-Historien mehrerer Contracts in EINEM (paginierten) Query statt
 * einer Query-Schleife — spart pro Seite dutzende Roundtrips.
 */
export async function getCotSeriesBatch(
  db: SupabaseClient,
  contractCodes: string[],
  windowWeeks = 260,
): Promise<Map<string, CotSeriesPoint[]>> {
  const rows = await pagedSelect<CotReportRow>(
    db,
    "cot_reports",
    "*",
    (q) =>
      q
        .in("contract_code", contractCodes)
        .order("contract_code", { ascending: true })
        .order("report_date", { ascending: true }),
  );

  const byCode = new Map<string, CotReportRow[]>();
  for (const row of rows) {
    const arr = byCode.get(row.contract_code) ?? [];
    arr.push(row);
    byCode.set(row.contract_code, arr);
  }

  const out = new Map<string, CotSeriesPoint[]>();
  for (const [code, group] of byCode) out.set(code, toSeriesPoints(group, windowWeeks));
  return out;
}

export interface TffSeriesPoint {
  date: string;
  /** Leveraged Funds (Hedgefonds) netto — das Momentum-Kapital */
  levNet: number;
  levLong: number;
  levShort: number;
  /** Asset Manager netto (Real Money) */
  assetNet: number;
  dealerNet: number;
  openInterest: number | null;
  /** Niveau-Perzentil der Leveraged-Funds-Nettoposition (Kontext) */
  levPercentile: number | null;
}

function toTffSeriesPoints(rows: CotTffRow[], windowWeeks: number): TffSeriesPoint[] {
  const nets = rows.map((r) => (r.lev_money_long ?? 0) - (r.lev_money_short ?? 0));
  const percentiles = rollingPercentile(nets, windowWeeks);

  return rows.map((r, i) => ({
    date: r.report_date,
    levNet: nets[i],
    levLong: r.lev_money_long ?? 0,
    levShort: r.lev_money_short ?? 0,
    assetNet: (r.asset_mgr_long ?? 0) - (r.asset_mgr_short ?? 0),
    dealerNet: (r.dealer_long ?? 0) - (r.dealer_short ?? 0),
    openInterest: r.open_interest,
    levPercentile: percentiles[i],
  }));
}

/** TFF-Historien mehrerer Contracts in einem paginierten Query. */
export async function getTffSeriesBatch(
  db: SupabaseClient,
  contractCodes: string[],
  windowWeeks = 260,
): Promise<Map<string, TffSeriesPoint[]>> {
  const rows = await pagedSelect<CotTffRow>(
    db,
    "cot_tff_reports",
    "*",
    (q) =>
      q
        .in("contract_code", contractCodes)
        .order("contract_code", { ascending: true })
        .order("report_date", { ascending: true }),
  );

  const byCode = new Map<string, CotTffRow[]>();
  for (const row of rows) {
    const arr = byCode.get(row.contract_code) ?? [];
    arr.push(row);
    byCode.set(row.contract_code, arr);
  }

  const out = new Map<string, TffSeriesPoint[]>();
  for (const [code, group] of byCode) out.set(code, toTffSeriesPoints(group, windowWeeks));
  return out;
}

/** Letzte zwei TFF-Reports je Contract (aktuell + Vorwoche). */
export async function getLatestTffReports(
  db: SupabaseClient,
): Promise<Map<string, { latest: CotTffRow; prev: CotTffRow | null }>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 25);
  const { data, error } = await db
    .from("cot_tff_reports")
    .select("*")
    .gte("report_date", cutoff.toISOString().slice(0, 10))
    .order("report_date", { ascending: false });
  if (error) throw new Error(error.message);

  const map = new Map<string, { latest: CotTffRow; prev: CotTffRow | null }>();
  for (const row of (data ?? []) as CotTffRow[]) {
    const entry = map.get(row.contract_code);
    if (!entry) map.set(row.contract_code, { latest: row, prev: null });
    else if (!entry.prev) entry.prev = row;
  }
  return map;
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

/** Tagesschlusskurse mehrerer Instrumente in einem Query (gruppiert). */
export async function getPricesBatch(
  db: SupabaseClient,
  instruments: string[],
  since?: string,
): Promise<Map<string, Array<Pick<PriceDailyRow, "date" | "close">>>> {
  const rows = await pagedSelect<Pick<PriceDailyRow, "instrument" | "date" | "close">>(
    db,
    "price_daily",
    "instrument, date, close",
    (q) => {
      let query = q
        .in("instrument", instruments)
        .order("instrument", { ascending: true })
        .order("date", { ascending: true });
      if (since) query = query.gte("date", since);
      return query;
    },
  );
  const out = new Map<string, Array<Pick<PriceDailyRow, "date" | "close">>>();
  for (const r of rows) {
    const arr = out.get(r.instrument) ?? [];
    arr.push({ date: r.date, close: r.close });
    out.set(r.instrument, arr);
  }
  return out;
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
