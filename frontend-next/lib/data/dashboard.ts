import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "./util";
import { getCotSeriesBatch } from "./cot";
import { getSeasonalityStats } from "./seasonality";
import type { SeriesPoint } from "@/lib/calc/seriesMath";
import { currencyStrength, type StrengthResult } from "@/lib/calc/strength";
import { riskGauge, type RiskGaugeResult } from "@/lib/calc/riskGauge";
import { combineStance, type StanceResult } from "@/lib/calc/cbStance";
import {
  evaluatePair,
  type ScreenerVerdict,
  type ScreenerInputs,
} from "@/lib/calc/screenerReasoning";
import { G8_CURRENCIES, FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { CONTRACT_BY_CCY } from "@/lib/constants/cftcContracts";
import { seriesFor } from "@/lib/constants/fredSeries";
import { BANKS } from "@/lib/constants/banks";
import type { CbStanceRow } from "@/lib/supabase/types";

export interface DashboardData {
  strength: StrengthResult;
  risk: RiskGaugeResult;
  stances: StanceResult[];
  verdicts: ScreenerVerdict[];
  cotPercentiles: Array<{ ccy: string; percentile: number }>;
  sentimentAge: string | null;
}

/** Mehrere FRED-Serien in einem Query (gruppiert). */
async function getFredBatch(
  db: SupabaseClient,
  ids: string[],
  since?: string,
): Promise<Map<string, SeriesPoint[]>> {
  const rows = await pagedSelect<{ series_id: string; date: string; value: number | null }>(
    db,
    "fred_series",
    "series_id, date, value",
    (q) => {
      let query = q.in("series_id", ids).order("series_id").order("date");
      if (since) query = query.gte("date", since);
      return query;
    },
  );
  const out = new Map<string, SeriesPoint[]>();
  for (const r of rows) {
    if (r.value === null) continue;
    const arr = out.get(r.series_id) ?? [];
    arr.push({ date: r.date, value: r.value });
    out.set(r.series_id, arr);
  }
  return out;
}

export async function loadDashboardData(db: SupabaseClient): Promise<DashboardData> {
  const priceCutoff = new Date();
  priceCutoff.setMonth(priceCutoff.getMonth() - 10);
  const fredCutoff = new Date();
  fredCutoff.setFullYear(fredCutoff.getFullYear() - 10);
  const vixCutoff = new Date();
  vixCutoff.setFullYear(vixCutoff.getFullYear() - 5);

  const policyIds = G8_CURRENCIES.map((c) => seriesFor(c, "policy_rate")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const yieldIds = G8_CURRENCIES.map((c) => seriesFor(c, "yield_10y")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const cotCodes = G8_CURRENCIES.map((c) => CONTRACT_BY_CCY.get(c)?.code).filter(
    (x): x is string => Boolean(x),
  );

  // Alle unabhängigen Blöcke parallel — statt sequenzieller Roundtrips
  const [priceRows, rateSeries, vixSeries, cotByCode, seasonalityByInstrument, sentRes, stanceRes] =
    await Promise.all([
      pagedSelect<{ instrument: string; date: string; close: number }>(
        db,
        "price_daily",
        "instrument, date, close",
        (q) =>
          q.gte("date", priceCutoff.toISOString().slice(0, 10)).order("instrument").order("date"),
      ),
      getFredBatch(db, [...policyIds, ...yieldIds], fredCutoff.toISOString().slice(0, 10)),
      getFredBatch(db, ["VIXCLS"], vixCutoff.toISOString().slice(0, 10)),
      getCotSeriesBatch(db, cotCodes),
      getSeasonalityStats(db),
      db
        .from("sentiment_snapshots")
        .select("pair, captured_at, long_pct")
        .order("captured_at", { ascending: false })
        .limit(60),
      db.from("cb_stance").select("*"),
    ]);

  const closesByInstrument = new Map<string, number[]>();
  for (const r of priceRows) {
    const arr = closesByInstrument.get(r.instrument) ?? [];
    arr.push(r.close);
    closesByInstrument.set(r.instrument, arr);
  }

  const policyByCcy = new Map<string, SeriesPoint[]>();
  const yield10ByCcy = new Map<string, SeriesPoint[]>();
  for (const ccy of G8_CURRENCIES) {
    const pid = seriesFor(ccy, "policy_rate")?.id;
    const yid = seriesFor(ccy, "yield_10y")?.id;
    if (pid) policyByCcy.set(ccy, rateSeries.get(pid) ?? []);
    if (yid) yield10ByCcy.set(ccy, rateSeries.get(yid) ?? []);
  }

  // — COT-Perzentile je Währung —
  const cotPercentileByCcy = new Map<string, number>();
  for (const ccy of G8_CURRENCIES) {
    const contract = CONTRACT_BY_CCY.get(ccy);
    if (!contract) continue;
    const series = cotByCode.get(contract.code) ?? [];
    const last = series[series.length - 1];
    if (last?.percentile !== null && last?.percentile !== undefined) {
      cotPercentileByCcy.set(ccy, last.percentile);
    }
  }

  // — Sentiment: letzter Snapshot je Pair —
  const sentimentByPair = new Map<string, number>();
  let sentimentAge: string | null = null;
  for (const r of sentRes.data ?? []) {
    if (!sentimentByPair.has(r.pair) && r.long_pct !== null) {
      sentimentByPair.set(r.pair, r.long_pct);
      sentimentAge = sentimentAge ?? r.captured_at;
    }
  }

  const stanceByBank = new Map(
    ((stanceRes.data ?? []) as CbStanceRow[]).map((r) => [r.bank, r]),
  );

  // ===== Berechnungen =====
  const strength = currencyStrength(closesByInstrument);

  const risk = riskGauge({
    vix: (vixSeries.get("VIXCLS") ?? []).map((p) => p.value),
    goldCloses: closesByInstrument.get("XAU_USD") ?? [],
    jpyStrength1M: strength.scores["1M"]["JPY"] ?? 0,
    chfStrength1M: strength.scores["1M"]["CHF"] ?? 0,
    spxCloses: closesByInstrument.get("SPX500_USD") ?? [],
  });

  const stances = BANKS.map((b) => {
    const row = stanceByBank.get(b.bank);
    return combineStance({
      bank: b.bank,
      ccy: b.ccy,
      manualScore: row?.stance_score ?? 0,
      manualRationale: row?.rationale ?? null,
      policyRate: policyByCcy.get(b.ccy) ?? [],
    });
  });

  const inputs: ScreenerInputs = {
    cotPercentileByCcy,
    policyByCcy,
    yield10ByCcy,
    seasonalityByInstrument,
    sentimentByPair,
    currentMonth: new Date().getMonth() + 1,
  };
  const verdicts = FX_INSTRUMENTS.map((inst) => evaluatePair(inst, inputs)).sort(
    (a, b) => b.alignedCount - a.alignedCount,
  );

  return {
    strength,
    risk,
    stances,
    verdicts,
    cotPercentiles: [...cotPercentileByCcy.entries()].map(([ccy, percentile]) => ({
      ccy,
      percentile,
    })),
    sentimentAge,
  };
}
