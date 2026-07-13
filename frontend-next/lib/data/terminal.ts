import type { SupabaseClient } from "@supabase/supabase-js";
import { getFredBatch } from "./dashboard";
import { getCotSeriesBatch, getTffSeriesBatch, getLatestReports, getLatestTffReports } from "./cot";
import { getSeasonalityStats } from "./seasonality";
import { loadIntermarketData } from "./intermarket";
import { computeCotFlow, latestFlow, type CotFlowSummary } from "@/lib/calc/cotDelta";
import { combineStance } from "@/lib/calc/cbStance";
import {
  computeCurrencyScore,
  cotDivergence,
  aggregateCcySeason,
  aggregateCcyRetail,
  stanceLabel,
  type CurrencyScore,
  type CbStanceLabel,
  type CotDivergence,
} from "@/lib/calc/currencyScore";
import { MONTH_LABELS, type MonthlyStat } from "@/lib/calc/seasonality";
import { yoyFromIndex } from "@/lib/calc/seriesMath";
import { G8_CURRENCIES, pairsForCurrency, fromOanda, type G8Currency } from "@/lib/constants/instruments";
import { CONTRACT_BY_CCY } from "@/lib/constants/cftcContracts";
import { seriesFor } from "@/lib/constants/fredSeries";
import { BANK_BY_CCY } from "@/lib/constants/banks";
import { CCY_FLAGS } from "@/lib/constants/flags";
import type { SeriesPoint } from "@/lib/calc/seriesMath";
import type { CotReportRow, CotTffRow, CbMeetingRow, CbStanceRow } from "@/lib/supabase/types";

/**
 * Server-Loader für das Macro Terminal — bündelt alle Daten der 8 Währungen
 * (kanonischer Bias + Detail-Sektionen) in einem JSON-serialisierbaren Payload.
 * Nutzt ausschließlich bestehende Loader/Queries; Charts im Modal laden
 * client-seitig über die bestehenden APIs (/api/data/cot, /api/data/series).
 */

export interface TerminalRates {
  policyRate: number | null;
  y10: number | null;
  lastChangeBps: number | null;
  lastChangeDate: string | null;
  /** Δ Leitzins über ~6 Monate in bps (Momentum hiking/cutting) */
  delta6mBps: number | null;
  diffs: Array<{ ccy: string; rateDiff: number | null; y10Diff: number | null }>;
  stance: { score: number; label: CbStanceLabel; rationale: string };
  nextMeeting: { date: string; expectedBps: number | null } | null;
  bank: string;
  bankName: string;
}

export interface TerminalCot {
  legacyLatest: CotReportRow | null;
  legacyPrev: CotReportRow | null;
  tffLatest: CotTffRow | null;
  tffPrev: CotTffRow | null;
  percentile: number | null;
  flow: CotFlowSummary | null;
  divergence: CotDivergence | null;
  contractCode: string | null;
  contractLabel: string | null;
}

export interface TerminalSeason {
  months: MonthlyStat[];
  longPairs: string[];
  shortPairs: string[];
  monthLabel: string;
}

export interface TerminalRetail {
  avgLongPct: number | null;
  pairs: Array<{ pair: string; longPct: number; shortPct: number }>;
}

export interface TerminalIntermarket {
  /** Commodity-Bezug der Währung (AUD→Gold, CAD→WTI, NZD→Kupfer) */
  commodity: { label: string; instrument: string; pairInstrument: string } | null;
  /** nur USD: 1M-Returns aller USD-Paare */
  usdImpact: Array<{ pair: string; ret1M: number | null }> | null;
}

export type Regime =
  | "GOLDILOCKS"
  | "REFLATION"
  | "STAGFLATION"
  | "OVERHEATING"
  | "DISINFLATION";

export interface TerminalCurrency {
  ccy: G8Currency;
  flag: string;
  /** Länderkürzel für die Karten (US, EU, GB …) */
  iso: string;
  score: CurrencyScore;
  /** CPI YoY % (reine Anzeige, aus FRED-Index selbst gerechnet) */
  cpiYoY: number | null;
  /**
   * Fundamentales Regime (reine ANZEIGE, kein Score-Beitrag):
   * Wachstum aus OECD-CLI-Niveau, Inflation aus CPI YoY vs. CB-Ziel —
   * gleiche Schwellen wie das frühere FRED-Terminal.
   */
  regime: Regime | null;
  cot: TerminalCot;
  rates: TerminalRates;
  season: TerminalSeason;
  retail: TerminalRetail;
  intermarket: TerminalIntermarket;
}

export interface TerminalData {
  currencies: TerminalCurrency[];
  latestCotDate: string | null;
  sentimentAge: string | null;
  generatedAt: string;
}

const COMMODITY_BY_CCY: Partial<Record<G8Currency, { label: string; instrument: string; pairInstrument: string }>> = {
  AUD: { label: "Gold ↔ AUD/USD", instrument: "XAU_USD", pairInstrument: "AUD_USD" },
  CAD: { label: "WTI Öl ↔ USD/CAD", instrument: "WTICO_USD", pairInstrument: "USD_CAD" },
  NZD: { label: "Kupfer ↔ NZD/USD", instrument: "XCU_USD", pairInstrument: "NZD_USD" },
};

const ISO_BY_CCY: Record<string, string> = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", CHF: "CH", AUD: "AU", CAD: "CA", NZD: "NZ",
};

/** Inflationsziel der Zentralbank (Midpoint) — nur für das Anzeige-Regime. */
const CPI_TARGET: Record<string, number> = {
  USD: 2, EUR: 2, GBP: 2, JPY: 0, CHF: 2, AUD: 2.5, CAD: 2, NZD: 2,
};

/** Regime-Klassifikation (Anzeige): Schwellen wie das frühere FRED-Terminal. */
function classifyRegime(cliLevel: number | null, cpiYoY: number | null, target: number): Regime | null {
  if (cliLevel === null || cpiYoY === null) return null;
  const growth = cliLevel > 100.2 ? 1 : cliLevel < 99.8 ? -1 : 0;
  const inflation = cpiYoY > target ? 1 : -1;
  if (growth === 1 && inflation <= 0) return "GOLDILOCKS";
  if (growth === 1 && inflation === 1) return "OVERHEATING";
  if (growth === -1 && inflation === 1) return "STAGFLATION";
  if (growth === -1 && inflation <= 0) return "DISINFLATION";
  return "REFLATION";
}

function latest(series: SeriesPoint[] | undefined): number | null {
  return series && series.length > 0 ? series[series.length - 1].value : null;
}

function valueMonthsAgo(series: SeriesPoint[] | undefined, months: number): number | null {
  if (!series || series.length === 0) return null;
  const cutoff = new Date(series[series.length - 1].date);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return [...series].reverse().find((p) => p.date <= cutoffStr)?.value ?? null;
}

/** jüngste Leitzins-Änderung (bps + Datum) aus der Serie. */
function lastRateChange(series: SeriesPoint[] | undefined): { bps: number; date: string } | null {
  if (!series || series.length < 2) return null;
  for (let i = series.length - 1; i > 0; i--) {
    if (series[i].value !== series[i - 1].value) {
      return { bps: Math.round((series[i].value - series[i - 1].value) * 100), date: series[i].date };
    }
  }
  return null;
}

export async function loadTerminalData(db: SupabaseClient): Promise<TerminalData> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const fredCutoff = new Date();
  fredCutoff.setFullYear(fredCutoff.getFullYear() - 10);

  const policyIds = G8_CURRENCIES.map((c) => seriesFor(c, "policy_rate")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const yieldIds = G8_CURRENCIES.map((c) => seriesFor(c, "yield_10y")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const cpiIds = G8_CURRENCIES.map((c) => seriesFor(c, "cpi")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const cliIds = G8_CURRENCIES.map((c) => seriesFor(c, "cli")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const cotCodes = G8_CURRENCIES.map((c) => CONTRACT_BY_CCY.get(c)?.code).filter(
    (x): x is string => Boolean(x),
  );

  const [
    rateSeries,
    cotByCode,
    tffByCode,
    latestLegacy,
    latestTff,
    seasonalityByInstrument,
    sentRes,
    stanceRes,
    meetingsRes,
    intermarket,
  ] = await Promise.all([
    getFredBatch(db, [...policyIds, ...yieldIds, ...cpiIds, ...cliIds], fredCutoff.toISOString().slice(0, 10)),
    getCotSeriesBatch(db, cotCodes),
    getTffSeriesBatch(db, cotCodes),
    getLatestReports(db),
    getLatestTffReports(db),
    getSeasonalityStats(db),
    db
      .from("sentiment_snapshots")
      .select("pair, captured_at, long_pct, short_pct")
      .order("captured_at", { ascending: false })
      .limit(120),
    db.from("cb_stance").select("*"),
    db
      .from("cb_meetings")
      .select("*")
      .gte("meeting_date", now.toISOString().slice(0, 10))
      .order("meeting_date", { ascending: true }),
    loadIntermarketData(db).catch(() => null),
  ]);

  const policyByCcy = new Map<string, SeriesPoint[]>();
  const yield10ByCcy = new Map<string, SeriesPoint[]>();
  const cpiYoYByCcy = new Map<string, number | null>();
  const cliByCcy = new Map<string, number | null>();
  for (const ccy of G8_CURRENCIES) {
    const pid = seriesFor(ccy, "policy_rate")?.id;
    const yid = seriesFor(ccy, "yield_10y")?.id;
    if (pid) policyByCcy.set(ccy, rateSeries.get(pid) ?? []);
    if (yid) yield10ByCcy.set(ccy, rateSeries.get(yid) ?? []);

    // CPI-Index → YoY % (Quartalsserien: 4 Lags, sonst 12) — reine Anzeige
    const cpiDef = seriesFor(ccy, "cpi");
    const cpiIndex = cpiDef ? (rateSeries.get(cpiDef.id) ?? []) : [];
    const cpiYoY = cpiIndex.length > 0 ? yoyFromIndex(cpiIndex, cpiDef?.id.includes("Q") ? 4 : 12) : [];
    cpiYoYByCcy.set(ccy, latest(cpiYoY));

    const cliDef = seriesFor(ccy, "cli");
    cliByCcy.set(ccy, cliDef ? latest(rateSeries.get(cliDef.id)) : null);
  }

  // Sentiment: letzter Snapshot je Pair
  const sentimentByPair = new Map<string, { longPct: number; shortPct: number }>();
  let sentimentAge: string | null = null;
  for (const r of sentRes.data ?? []) {
    if (!sentimentByPair.has(r.pair) && r.long_pct !== null) {
      sentimentByPair.set(r.pair, {
        longPct: r.long_pct,
        shortPct: r.short_pct ?? 100 - r.long_pct,
      });
      sentimentAge = sentimentAge ?? r.captured_at;
    }
  }

  const stanceByBank = new Map(((stanceRes.data ?? []) as CbStanceRow[]).map((r) => [r.bank, r]));
  const meetings = (meetingsRes.data ?? []) as CbMeetingRow[];

  let latestCotDate: string | null = null;

  const currencies: TerminalCurrency[] = G8_CURRENCIES.map((ccy) => {
    const contract = CONTRACT_BY_CCY.get(ccy) ?? null;
    const bankDef = BANK_BY_CCY.get(ccy)!;

    // ── COT: Flow (TFF, Fallback Legacy) + Niveau-Perzentil ────────────────
    const legacySeries = contract ? (cotByCode.get(contract.code) ?? []) : [];
    const tffSeries = contract ? (tffByCode.get(contract.code) ?? []) : [];
    const flowInput = tffSeries.length
      ? tffSeries.map((p) => ({ date: p.date, net: p.levNet, openInterest: p.openInterest }))
      : legacySeries.map((p) => ({ date: p.date, net: p.net, openInterest: p.openInterest }));
    const flow = latestFlow(computeCotFlow(flowInput));
    const percentile = legacySeries[legacySeries.length - 1]?.percentile ?? null;
    if (flow && (!latestCotDate || flow.date > latestCotDate)) latestCotDate = flow.date;

    const legacySnapshot = contract ? (latestLegacy.get(contract.code) ?? null) : null;
    const tffSnapshot = contract ? (latestTff.get(contract.code) ?? null) : null;

    // ── Zinsen: Stance + Differenzen + Momentum + nächster Entscheid ───────
    const policy = policyByCcy.get(ccy);
    const policyRate = latest(policy);
    const rate6m = valueMonthsAgo(policy, 6);
    const stanceRow = stanceByBank.get(bankDef.bank);
    const stance = combineStance({
      bank: bankDef.bank,
      ccy,
      manualScore: stanceRow?.stance_score ?? 0,
      manualRationale: stanceRow?.rationale ?? null,
      policyRate: policy ?? [],
    });
    // ohne cb_stance-Zeile UND ohne Zins-Serie ist der Stance-Score kein Signal
    const hasStanceData = Boolean(stanceRow) || (policy?.length ?? 0) > 0;
    const otherRates = G8_CURRENCIES.filter((c) => c !== ccy)
      .map((c) => latest(policyByCcy.get(c)))
      .filter((v): v is number => v !== null);
    const avgOtherRates =
      otherRates.length > 0 ? otherRates.reduce((a, b) => a + b, 0) / otherRates.length : null;
    const y10 = latest(yield10ByCcy.get(ccy));
    const change = lastRateChange(policy);
    const nextMeeting = meetings.find((m) => m.bank === bankDef.bank) ?? null;

    const diffs = G8_CURRENCIES.filter((c) => c !== ccy).map((other) => {
      const or = latest(policyByCcy.get(other));
      const oy = latest(yield10ByCcy.get(other));
      return {
        ccy: other,
        rateDiff: policyRate !== null && or !== null ? policyRate - or : null,
        y10Diff: y10 !== null && oy !== null ? y10 - oy : null,
      };
    });

    // ── Saisonalität: 7 Pairs auf die Währung aggregieren ──────────────────
    const pairDefs = pairsForCurrency(ccy);
    const seasonInputs = pairDefs
      .map((inst) => {
        const stats = seasonalityByInstrument.get(inst.instrument);
        if (!stats) return null;
        return {
          baseIsCcy: inst.baseCcy === ccy,
          displayName: inst.displayName,
          months: stats.months,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const season = aggregateCcySeason(seasonInputs, currentMonth);

    // ── Retail: Pair-Sentiment aggregieren ─────────────────────────────────
    const retailPairs = pairDefs
      .map((inst) => {
        const s = sentimentByPair.get(fromOanda(inst.instrument));
        if (!s) return null;
        return { inst, ...s };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const avgLongPct = aggregateCcyRetail(
      retailPairs.map((p) => ({ baseIsCcy: p.inst.baseCcy === ccy, longPct: p.longPct })),
    );

    // ── Kanonischer Score ───────────────────────────────────────────────────
    const score = computeCurrencyScore(
      ccy,
      {
        flow,
        stanceScore: hasStanceData ? stance.score : null,
        policyRate,
        avgOtherRates,
        seasonAvgReturn: season.currentAvgReturn,
        retailAvgLongPct: avgLongPct,
      },
      MONTH_LABELS[currentMonth - 1],
    );

    const cpiYoY = cpiYoYByCcy.get(ccy) ?? null;

    return {
      ccy,
      flag: CCY_FLAGS[ccy] ?? "🏳️",
      iso: ISO_BY_CCY[ccy] ?? ccy.slice(0, 2),
      score,
      cpiYoY,
      regime: classifyRegime(cliByCcy.get(ccy) ?? null, cpiYoY, CPI_TARGET[ccy] ?? 2),
      cot: {
        legacyLatest: legacySnapshot?.latest ?? null,
        legacyPrev: legacySnapshot?.prev ?? null,
        tffLatest: tffSnapshot?.latest ?? null,
        tffPrev: tffSnapshot?.prev ?? null,
        percentile,
        flow,
        divergence: cotDivergence(percentile, flow),
        contractCode: contract?.code ?? null,
        contractLabel: contract?.label ?? null,
      },
      rates: {
        policyRate,
        y10,
        lastChangeBps: change?.bps ?? null,
        lastChangeDate: change?.date ?? null,
        delta6mBps:
          policyRate !== null && rate6m !== null ? Math.round((policyRate - rate6m) * 100) : null,
        diffs,
        stance: {
          score: stance.score,
          label: stanceLabel(stance.score),
          rationale: stance.rationale,
        },
        nextMeeting: nextMeeting
          ? { date: nextMeeting.meeting_date, expectedBps: nextMeeting.expected_change_bps }
          : null,
        bank: bankDef.bank,
        bankName: bankDef.name,
      },
      season: {
        months: season.months,
        longPairs: season.longPairs,
        shortPairs: season.shortPairs,
        monthLabel: MONTH_LABELS[currentMonth - 1],
      },
      retail: {
        avgLongPct,
        pairs: retailPairs.map((p) => ({
          pair: fromOanda(p.inst.instrument),
          longPct: p.longPct,
          shortPct: p.shortPct,
        })),
      },
      intermarket: {
        commodity: COMMODITY_BY_CCY[ccy] ?? null,
        usdImpact:
          ccy === "USD" && intermarket
            ? intermarket.impact.map((i) => ({ pair: i.pair, ret1M: i.ret1M }))
            : null,
      },
    };
  });

  return {
    currencies,
    latestCotDate,
    sentimentAge,
    generatedAt: new Date().toISOString(),
  };
}
