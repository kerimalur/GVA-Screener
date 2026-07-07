import type { CotReportRow, CotTffRow } from "@/lib/supabase/types";

const BASE = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
const TFF_BASE = "https://publicreporting.cftc.gov/resource/gpe5-46if.json";

interface SocrataRow {
  cftc_contract_market_code: string;
  report_date_as_yyyy_mm_dd: string;
  open_interest_all?: string;
  noncomm_positions_long_all?: string;
  noncomm_positions_short_all?: string;
  comm_positions_long_all?: string;
  comm_positions_short_all?: string;
  nonrept_positions_long_all?: string;
  nonrept_positions_short_all?: string;
  change_in_noncomm_long_all?: string;
  change_in_noncomm_short_all?: string;
}

function toInt(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Legacy-COT (Futures only) je Contract-Code. `since` (YYYY-MM-DD) für
 * inkrementelle Updates; ohne `since` volle Historie ab 2006.
 */
export async function fetchCot(
  contractCode: string,
  opts: { since?: string } = {},
): Promise<CotReportRow[]> {
  const since = opts.since ?? "2006-01-01";
  const params = new URLSearchParams({
    cftc_contract_market_code: contractCode,
    $where: `report_date_as_yyyy_mm_dd>'${since}'`,
    $order: "report_date_as_yyyy_mm_dd",
    $limit: "50000",
  });

  const res = await fetch(`${BASE}?${params}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`CFTC ${contractCode}: HTTP ${res.status}`);
  }
  const rows = (await res.json()) as SocrataRow[];

  return rows.map((r) => ({
    contract_code: contractCode,
    report_date: r.report_date_as_yyyy_mm_dd.slice(0, 10),
    open_interest: toInt(r.open_interest_all),
    noncomm_long: toInt(r.noncomm_positions_long_all),
    noncomm_short: toInt(r.noncomm_positions_short_all),
    comm_long: toInt(r.comm_positions_long_all),
    comm_short: toInt(r.comm_positions_short_all),
    nonrept_long: toInt(r.nonrept_positions_long_all),
    nonrept_short: toInt(r.nonrept_positions_short_all),
    chg_noncomm_long: toInt(r.change_in_noncomm_long_all),
    chg_noncomm_short: toInt(r.change_in_noncomm_short_all),
  }));
}

interface TffSocrataRow {
  cftc_contract_market_code: string;
  report_date_as_yyyy_mm_dd: string;
  open_interest_all?: string;
  dealer_positions_long_all?: string;
  dealer_positions_short_all?: string;
  // Achtung: Asset-Manager/Lev-Money/Other-Felder heißen im Dataset OHNE _all
  asset_mgr_positions_long?: string;
  asset_mgr_positions_short?: string;
  lev_money_positions_long?: string;
  lev_money_positions_short?: string;
  other_rept_positions_long?: string;
  other_rept_positions_short?: string;
  nonrept_positions_long_all?: string;
  nonrept_positions_short_all?: string;
}

/**
 * TFF-Report ("Traders in Financial Futures", futures-only) je Contract-Code.
 * Isoliert Leveraged Funds (Hedgefonds) von Asset Managern — für FX/BTC der
 * präzisere Report. Historie ab 2006-06 (BTC ab 2018-04).
 */
export async function fetchCotTff(
  contractCode: string,
  opts: { since?: string } = {},
): Promise<CotTffRow[]> {
  const since = opts.since ?? "2006-01-01";
  const params = new URLSearchParams({
    cftc_contract_market_code: contractCode,
    $where: `report_date_as_yyyy_mm_dd>'${since}'`,
    $order: "report_date_as_yyyy_mm_dd",
    $limit: "50000",
  });

  const res = await fetch(`${TFF_BASE}?${params}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`CFTC TFF ${contractCode}: HTTP ${res.status}`);
  }
  const rows = (await res.json()) as TffSocrataRow[];

  return rows.map((r) => ({
    contract_code: contractCode,
    report_date: r.report_date_as_yyyy_mm_dd.slice(0, 10),
    open_interest: toInt(r.open_interest_all),
    dealer_long: toInt(r.dealer_positions_long_all),
    dealer_short: toInt(r.dealer_positions_short_all),
    asset_mgr_long: toInt(r.asset_mgr_positions_long),
    asset_mgr_short: toInt(r.asset_mgr_positions_short),
    lev_money_long: toInt(r.lev_money_positions_long),
    lev_money_short: toInt(r.lev_money_positions_short),
    other_long: toInt(r.other_rept_positions_long),
    other_short: toInt(r.other_rept_positions_short),
    nonrept_long: toInt(r.nonrept_positions_long_all),
    nonrept_short: toInt(r.nonrept_positions_short_all),
  }));
}
