import type { SupabaseClient } from "@supabase/supabase-js";
import type { CotReportRow, CotTffRow } from "@/lib/supabase/types";
import { pagedSelect } from "./util";
import { rollingPercentile } from "@/lib/calc/percentile";
import {
  buildSignal,
  type CurrencySignal,
  type GroupKey,
} from "@/lib/calc/cotIntel";
import { CFTC_CONTRACTS, TFF_CONTRACTS, CONTRACT_BY_CCY } from "@/lib/constants/cftcContracts";
import { G8_CURRENCIES } from "@/lib/constants/instruments";

const WINDOW = 260;

// ── Rohdaten je Contract ────────────────────────────────────────────────────
async function fetchTff(db: SupabaseClient, codes: string[]): Promise<Map<string, CotTffRow[]>> {
  const rows = await pagedSelect<CotTffRow>(db, "cot_tff_reports", "*", (q) =>
    q
      .in("contract_code", codes)
      .order("contract_code", { ascending: true })
      .order("report_date", { ascending: true }),
  );
  return groupBy(rows, (r) => r.contract_code);
}

async function fetchLegacy(db: SupabaseClient, codes: string[]): Promise<Map<string, CotReportRow[]>> {
  const rows = await pagedSelect<CotReportRow>(db, "cot_reports", "*", (q) =>
    q
      .in("contract_code", codes)
      .order("contract_code", { ascending: true })
      .order("report_date", { ascending: true }),
  );
  return groupBy(rows, (r) => r.contract_code);
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(key(r)) ?? [];
    arr.push(r);
    m.set(key(r), arr);
  }
  return m;
}

// ── Netto-Serien ────────────────────────────────────────────────────────────
export interface TffPoint {
  date: string;
  oi: number | null;
  dealerLong: number; dealerShort: number; dealerNet: number;
  assetLong: number; assetShort: number; assetNet: number;
  levLong: number; levShort: number; levNet: number;
  otherLong: number; otherShort: number; otherNet: number;
  retailLong: number; retailShort: number; retailNet: number;
}
export interface LegacyPoint {
  date: string;
  oi: number | null;
  ncLong: number; ncShort: number; ncNet: number; // Large Specs
  commLong: number; commShort: number; commNet: number;
  retailLong: number; retailShort: number; retailNet: number; // Small Traders / Non-Rept
}

function toTff(rows: CotTffRow[]): TffPoint[] {
  return rows.map((r) => ({
    date: r.report_date,
    oi: r.open_interest,
    dealerLong: r.dealer_long ?? 0, dealerShort: r.dealer_short ?? 0, dealerNet: (r.dealer_long ?? 0) - (r.dealer_short ?? 0),
    assetLong: r.asset_mgr_long ?? 0, assetShort: r.asset_mgr_short ?? 0, assetNet: (r.asset_mgr_long ?? 0) - (r.asset_mgr_short ?? 0),
    levLong: r.lev_money_long ?? 0, levShort: r.lev_money_short ?? 0, levNet: (r.lev_money_long ?? 0) - (r.lev_money_short ?? 0),
    otherLong: r.other_long ?? 0, otherShort: r.other_short ?? 0, otherNet: (r.other_long ?? 0) - (r.other_short ?? 0),
    retailLong: r.nonrept_long ?? 0, retailShort: r.nonrept_short ?? 0, retailNet: (r.nonrept_long ?? 0) - (r.nonrept_short ?? 0),
  }));
}

function toLegacy(rows: CotReportRow[]): LegacyPoint[] {
  return rows.map((r) => ({
    date: r.report_date,
    oi: r.open_interest,
    ncLong: r.noncomm_long ?? 0, ncShort: r.noncomm_short ?? 0, ncNet: (r.noncomm_long ?? 0) - (r.noncomm_short ?? 0),
    commLong: r.comm_long ?? 0, commShort: r.comm_short ?? 0, commNet: (r.comm_long ?? 0) - (r.comm_short ?? 0),
    retailLong: r.nonrept_long ?? 0, retailShort: r.nonrept_short ?? 0, retailNet: (r.nonrept_long ?? 0) - (r.nonrept_short ?? 0),
  }));
}

function latestPercentile(nets: number[]): number | null {
  const p = rollingPercentile(nets, WINDOW);
  return p[p.length - 1] ?? null;
}

// ── Signal je Währung ───────────────────────────────────────────────────────
function signalForCcy(ccy: string, tff: TffPoint[], legacy: LegacyPoint[]): CurrencySignal {
  const lastT = tff[tff.length - 1];
  const lastL = legacy[legacy.length - 1];

  const indices: Record<GroupKey, number | null> = {
    dealer: tff.length ? latestPercentile(tff.map((p) => p.dealerNet)) : null,
    assetMgr: tff.length ? latestPercentile(tff.map((p) => p.assetNet)) : null,
    levFunds: tff.length ? latestPercentile(tff.map((p) => p.levNet)) : null,
    commercials: legacy.length ? latestPercentile(legacy.map((p) => p.commNet)) : null,
    retail: legacy.length ? latestPercentile(legacy.map((p) => p.retailNet)) : null,
  };
  const nets: Record<GroupKey, number | null> = {
    dealer: lastT?.dealerNet ?? null,
    assetMgr: lastT?.assetNet ?? null,
    levFunds: lastT?.levNet ?? null,
    commercials: lastL?.commNet ?? null,
    retail: lastL?.retailNet ?? null,
  };
  const latestDate = [lastT?.date, lastL?.date].filter(Boolean).sort().slice(-1)[0] ?? null;
  return buildSignal(ccy, indices, nets, latestDate);
}

// ── Heatmap / Flips / Extremes ──────────────────────────────────────────────
export interface HeatmapRow {
  code: string;
  label: string;
  ccy: string | null;
  cells: Record<string, number | null>; // group → Δnet (letzte Woche)
}

export interface ScanItem {
  code: string;
  label: string;
  ccy: string | null;
  group: string;
  kind: "flip" | "extreme";
  detail: string;
  net: number;
  index: number | null;
  oi: number | null;
}

const HEATMAP_GROUPS = [
  "Dealer", "AM", "Lev Funds", "Commercials", "Large Specs", "Small Traders", "Retail",
] as const;

function deltaNet(arr: number[]): number | null {
  if (arr.length < 2) return null;
  return arr[arr.length - 1] - arr[arr.length - 2];
}

// ── Öffentliche Ladefunktion ────────────────────────────────────────────────
export interface CotIntelData {
  signals: CurrencySignal[];
  heatmapGroups: string[];
  heatmap: HeatmapRow[];
  flips: ScanItem[];
  extremes: ScanItem[];
  generatedAt: string;
}

export async function getCotIntelData(db: SupabaseClient): Promise<CotIntelData> {
  const legacyCodes = CFTC_CONTRACTS.map((c) => c.code);
  const tffCodes = TFF_CONTRACTS.map((c) => c.code);
  const [tffMap, legacyMap] = await Promise.all([fetchTff(db, tffCodes), fetchLegacy(db, legacyCodes)]);

  const tffByCode = new Map<string, TffPoint[]>();
  for (const [code, rows] of tffMap) tffByCode.set(code, toTff(rows));
  const legByCode = new Map<string, LegacyPoint[]>();
  for (const [code, rows] of legacyMap) legByCode.set(code, toLegacy(rows));

  // Signale (8 Währungen)
  const signals: CurrencySignal[] = [];
  for (const ccy of G8_CURRENCIES) {
    const contract = CONTRACT_BY_CCY.get(ccy);
    if (!contract) continue;
    const tff = tffByCode.get(contract.code) ?? [];
    const legacy = legByCode.get(contract.code) ?? [];
    signals.push(signalForCcy(ccy, tff, legacy));
  }

  // Heatmap + Scanner über alle Märkte
  const heatmap: HeatmapRow[] = [];
  const flips: ScanItem[] = [];
  const extremes: ScanItem[] = [];

  for (const c of CFTC_CONTRACTS) {
    const tff = tffByCode.get(c.code) ?? [];
    const legacy = legByCode.get(c.code) ?? [];
    if (tff.length === 0 && legacy.length === 0) continue;
    const oi = legacy[legacy.length - 1]?.oi ?? tff[tff.length - 1]?.oi ?? null;

    const cells: Record<string, number | null> = {
      Dealer: tff.length ? deltaNet(tff.map((p) => p.dealerNet)) : null,
      AM: tff.length ? deltaNet(tff.map((p) => p.assetNet)) : null,
      "Lev Funds": tff.length ? deltaNet(tff.map((p) => p.levNet)) : null,
      Commercials: legacy.length ? deltaNet(legacy.map((p) => p.commNet)) : null,
      "Large Specs": legacy.length ? deltaNet(legacy.map((p) => p.ncNet)) : null,
      "Small Traders": legacy.length ? deltaNet(legacy.map((p) => p.retailNet)) : null,
      Retail: tff.length ? deltaNet(tff.map((p) => p.retailNet)) : null,
    };
    heatmap.push({ code: c.code, label: c.label, ccy: c.ccy, cells });

    // Gruppen für Scanner: (name, netArray)
    const groups: Array<{ name: string; nets: number[] }> = [];
    if (tff.length) {
      groups.push({ name: "Dealer", nets: tff.map((p) => p.dealerNet) });
      groups.push({ name: "Asset Mgr", nets: tff.map((p) => p.assetNet) });
      groups.push({ name: "Lev Funds", nets: tff.map((p) => p.levNet) });
    }
    if (legacy.length) {
      groups.push({ name: "Large Specs", nets: legacy.map((p) => p.ncNet) });
      groups.push({ name: "Commercials", nets: legacy.map((p) => p.commNet) });
    }

    for (const g of groups) {
      const cur = g.nets[g.nets.length - 1];
      const prev = g.nets[g.nets.length - 2];
      // Flip: Vorzeichenwechsel der Nettoposition
      if (prev !== undefined && Math.sign(prev) !== Math.sign(cur) && prev !== 0 && cur !== 0) {
        flips.push({
          code: c.code, label: c.label, ccy: c.ccy, group: g.name, kind: "flip",
          detail: `${prev > 0 ? "Long→Short" : "Short→Long"} (${prev.toLocaleString("de-DE")} → ${cur.toLocaleString("de-DE")})`,
          net: cur, index: null, oi,
        });
      }
      // Extreme: 90./10.-Perzentil (260W)
      const idx = latestPercentile(g.nets);
      if (idx !== null && (idx >= 90 || idx <= 10)) {
        extremes.push({
          code: c.code, label: c.label, ccy: c.ccy, group: g.name, kind: "extreme",
          detail: idx >= 90 ? `COT-Index ${idx.toFixed(0)} — extrem Long` : `COT-Index ${idx.toFixed(0)} — extrem Short`,
          net: cur, index: idx, oi,
        });
      }
    }
  }

  // Relevanz: Extreme mit großem OI zuerst
  extremes.sort((a, b) => (b.oi ?? 0) - (a.oi ?? 0));
  flips.sort((a, b) => (b.oi ?? 0) - (a.oi ?? 0));

  return {
    signals,
    heatmapGroups: [...HEATMAP_GROUPS],
    heatmap,
    flips,
    extremes,
    generatedAt: new Date().toISOString(),
  };
}

// ── Detailseite je Währung ──────────────────────────────────────────────────
export interface DetailPositionRow {
  group: string;
  long: number;
  short: number;
  net: number;
  pctOi: number | null;
  dLong: number | null;
  dShort: number | null;
  dNet: number | null;
}

export interface CotCurrencyDetail {
  ccy: string;
  label: string;
  latestDate: string | null;
  signal: CurrencySignal;
  tff: TffPoint[];
  legacy: LegacyPoint[];
  cotIndex: Array<{ date: string; index: number | null }>;
  positions: DetailPositionRow[];
  narrative: string[];
}

function pctOi(net: number, oi: number | null): number | null {
  return oi && oi > 0 ? (Math.abs(net) / oi) * 100 : null;
}

export async function getCotCurrencyDetail(
  db: SupabaseClient,
  ccy: string,
): Promise<CotCurrencyDetail | null> {
  const contract = CONTRACT_BY_CCY.get(ccy);
  if (!contract) return null;

  const [tffMap, legMap] = await Promise.all([
    fetchTff(db, [contract.code]),
    fetchLegacy(db, [contract.code]),
  ]);
  const tff = toTff(tffMap.get(contract.code) ?? []);
  const legacy = toLegacy(legMap.get(contract.code) ?? []);
  if (tff.length === 0 && legacy.length === 0) return null;

  const signal = signalForCcy(ccy, tff, legacy);
  const lastT = tff[tff.length - 1];
  const prevT = tff[tff.length - 2];
  const lastL = legacy[legacy.length - 1];
  const prevL = legacy[legacy.length - 2];
  const latestDate = signal.latestDate;

  // COT-Index-Verlauf (Rolling-Perzentil der NC-Nettoposition)
  const ncNets = legacy.map((p) => p.ncNet);
  const ncPct = rollingPercentile(ncNets, WINDOW);
  const cotIndex = legacy.map((p, i) => ({ date: p.date, index: ncPct[i] }));

  // Positionsübersicht
  const positions: DetailPositionRow[] = [];
  const pushT = (group: string, key: "dealer" | "asset" | "lev" | "other" | "retail") => {
    if (!lastT) return;
    const L = lastT[`${key}Long` as keyof TffPoint] as number;
    const S = lastT[`${key}Short` as keyof TffPoint] as number;
    const N = lastT[`${key}Net` as keyof TffPoint] as number;
    const pL = prevT ? (prevT[`${key}Long` as keyof TffPoint] as number) : null;
    const pS = prevT ? (prevT[`${key}Short` as keyof TffPoint] as number) : null;
    const pN = prevT ? (prevT[`${key}Net` as keyof TffPoint] as number) : null;
    positions.push({
      group, long: L, short: S, net: N, pctOi: pctOi(N, lastT.oi),
      dLong: pL === null ? null : L - pL, dShort: pS === null ? null : S - pS, dNet: pN === null ? null : N - pN,
    });
  };
  pushT("Dealer", "dealer");
  pushT("Asset Mgr", "asset");
  pushT("Lev Funds", "lev");
  pushT("Other Rept.", "other");
  pushT("Non-Rept. (TFF)", "retail");
  if (lastL) {
    const pushL = (group: string, key: "nc" | "comm" | "retail") => {
      const L = lastL[`${key}Long` as keyof LegacyPoint] as number;
      const S = lastL[`${key}Short` as keyof LegacyPoint] as number;
      const N = lastL[`${key}Net` as keyof LegacyPoint] as number;
      const pL = prevL ? (prevL[`${key}Long` as keyof LegacyPoint] as number) : null;
      const pS = prevL ? (prevL[`${key}Short` as keyof LegacyPoint] as number) : null;
      const pN = prevL ? (prevL[`${key}Net` as keyof LegacyPoint] as number) : null;
      positions.push({
        group, long: L, short: S, net: N, pctOi: pctOi(N, lastL.oi),
        dLong: pL === null ? null : L - pL, dShort: pS === null ? null : S - pS, dNet: pN === null ? null : N - pN,
      });
    };
    pushL("Large Specs", "nc");
    pushL("Commercials", "comm");
    pushL("Small Traders", "retail");
  }

  // Auto-Narrativ
  const narrative: string[] = [];
  for (const g of signal.groups) {
    if (g.index === null) continue;
    if (g.index >= 90) narrative.push(`${g.label} auf einem der höchsten Long-Level der jüngsten Historie (COT-Index ${g.index.toFixed(0)}).`);
    else if (g.index <= 10) narrative.push(`${g.label} auf einem der niedrigsten Level der jüngsten Historie (COT-Index ${g.index.toFixed(0)}).`);
  }
  // Open-Interest-Trend
  if (lastL && prevL && prevL.oi && lastL.oi) {
    const dOi = ((lastL.oi - prevL.oi) / prevL.oi) * 100;
    if (dOi < -5) narrative.push("Open Interest fällt — Positionsauflösung, Bewegung eher technischer Natur.");
    else if (dOi > 5) narrative.push("Open Interest steigt — neues Kapital fließt in den Markt.");
  }
  // Flip Dealer (Smart Money)
  if (lastT && prevT && Math.sign(prevT.dealerNet) !== Math.sign(lastT.dealerNet) && prevT.dealerNet !== 0) {
    narrative.push(`Dealer-Flip von ${prevT.dealerNet > 0 ? "Long auf Short" : "Short auf Long"}.`);
  }
  if (narrative.length === 0) narrative.push("Keine Extrempositionen oder auffälligen Positionswechsel in dieser Woche.");

  return {
    ccy,
    label: contract.label,
    latestDate,
    signal,
    tff,
    legacy,
    cotIndex,
    positions,
    narrative,
  };
}
