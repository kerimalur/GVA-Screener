import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "@/lib/data/util";
import { getCotSeriesBatch, type CotSeriesPoint } from "@/lib/data/cot";
import { getFredBatch } from "@/lib/data/dashboard";
import { getSeasonalityStats } from "@/lib/data/seasonality";
import { computeCotFlow, type CotFlowPoint } from "@/lib/calc/cotDelta";
import type { SeriesPoint } from "@/lib/calc/seriesMath";
import { G8_CURRENCIES, FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { CONTRACT_BY_CCY } from "@/lib/constants/cftcContracts";
import { seriesFor } from "@/lib/constants/fredSeries";
import { pastMondays } from "./outlookSnapshots";

/**
 * Labor-Historie ist von weekly_outlook_snapshots UNABHÄNGIG (Rohdaten direkt
 * gelesen) — kann daher deutlich weiter zurück als BACKTEST_WEEKS (8J).
 * Alle 28 Pairs haben price_daily spätestens ab Okt 2008 (verifiziert) →
 * 900 Wochen ≈ 17,3 Jahre bleibt sicher innerhalb der Datenabdeckung.
 */
export const LABOR_WEEKS = 900;

/**
 * Faktor-Matrix fürs ML-Labor: pro Woche × FX-Pair die Richtungssignale ALLER
 * Faktor-Varianten + die tatsächlichen Forward-Returns (1–4 Wochen).
 *
 * Bewusst NICHT auf weekly_outlook_snapshots aufgebaut: hier rechnen wir
 * Varianten, die im Tool-Verdict nicht vorkommen (v.a. COT-Commercials),
 * direkt aus den Rohdaten — as-of-sicher (Serien am Stichtag beschnitten,
 * Rolling-Fenster enden am jeweiligen Index).
 *
 * Faktor-Varianten (Pair-Sicht, Schwellen identisch zu screenerReasoning wo
 * es das Pendant gibt):
 *  - Zins:    Leitzins-Differenz Base−Quote (Niveau > ±0.25 pp ODER 6M-Drehung > ±0.2 pp)
 *  - COT-NC:  4W-Flow-Differenz der Non-Commercials in % OI, Schwelle ±4
 *  - COT-C:   dieselbe Logik mit den COMMERCIALS (Hedger) — Vergleichsvariante
 *  - Saison:  Monats-Statistik (Ø ≥ ±0.3 % und Hitrate ≥60/≤40, ≥8 Jahre)
 *  - Yield:   10Y-Spread-Trend 3M, Schwelle ±0.15 pp
 *
 * Kompaktformat für den Client: Zahlen-Arrays statt Objekte (Payload klein).
 */

export const MATRIX_FACTORS = ["Zins", "COT-NC", "COT-C", "Saison", "Yield"] as const;
export const MATRIX_HORIZONS = [1, 2, 3, 4] as const;

export interface FactorMatrix {
  weeks: string[]; // ISO-Montage, aufsteigend
  pairs: string[]; // OANDA-Notation, Reihenfolge = FX_INSTRUMENTS
  factors: string[]; // MATRIX_FACTORS
  horizons: number[]; // MATRIX_HORIZONS
  /**
   * Eine Zeile je (Woche, Pair) mit gültigem Entry-Kurs:
   * [weekIdx, pairIdx, dZins, dCotNC, dCotC, dSaison, dYield, r1, r2, r3, r4]
   * d* ∈ {-1,0,1}; r* = Pair-Rendite in % (LONG-Sicht), null wenn Kurs fehlt.
   */
  rows: Array<Array<number | null>>;
}

function lastAtOrBefore<T extends { date: string }>(points: T[], asOf: string): T | null {
  let last: T | null = null;
  for (const p of points) {
    if (p.date <= asOf) last = p;
    else break;
  }
  return last;
}

function latest(series: SeriesPoint[]): number | null {
  return series.length ? series[series.length - 1].value : null;
}

function valueMonthsAgo(series: SeriesPoint[], months: number): number | null {
  if (series.length === 0) return null;
  const cutoff = new Date(series[series.length - 1].date);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return [...series].reverse().find((p) => p.date <= cutoffStr)?.value ?? null;
}

/** Erster Close am/nach target (≤ toleranz Tage danach), binäre Suche. */
function closeAtOrAfter(
  series: Array<{ date: string; close: number }>,
  targetMs: number,
  toleranceDays: number,
): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(series[mid].date).getTime() >= targetMs) {
      idx = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (idx === -1) return null;
  const gapDays = (new Date(series[idx].date).getTime() - targetMs) / 86_400_000;
  return gapDays <= toleranceDays ? series[idx].close : null;
}

export async function buildFactorMatrix(
  db: SupabaseClient,
  weeksCount = LABOR_WEEKS,
): Promise<FactorMatrix> {
  const weeks = pastMondays(weeksCount);
  const since = new Date(new Date(weeks[0] + "T00:00:00Z").getTime() - 400 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const cotCodes = G8_CURRENCIES.map((c) => CONTRACT_BY_CCY.get(c)?.code).filter(
    (x): x is string => Boolean(x),
  );
  const policyIds = G8_CURRENCIES.map((c) => seriesFor(c, "policy_rate")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const yieldIds = G8_CURRENCIES.map((c) => seriesFor(c, "yield_10y")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const pairList = FX_INSTRUMENTS.map((i) => i.instrument);

  const [cotByCode, fredSeries, seasonality, priceRows] = await Promise.all([
    getCotSeriesBatch(db, cotCodes), // volle Historie: enthält net (NonComm) UND commNet
    getFredBatch(db, [...policyIds, ...yieldIds], since),
    getSeasonalityStats(db),
    pagedSelect<{ instrument: string; date: string; close: number }>(
      db,
      "price_daily",
      "instrument, date, close",
      (q) => q.in("instrument", pairList).gte("date", weeks[0]).order("instrument").order("date"),
    ),
  ]);

  // — Serien je Währung aufbereiten —
  const ncFlowByCcy = new Map<string, CotFlowPoint[]>();
  const cFlowByCcy = new Map<string, CotFlowPoint[]>();
  const policyByCcy = new Map<string, SeriesPoint[]>();
  const yield10ByCcy = new Map<string, SeriesPoint[]>();

  for (const ccy of G8_CURRENCIES) {
    const contract = CONTRACT_BY_CCY.get(ccy);
    const series: CotSeriesPoint[] = contract ? (cotByCode.get(contract.code) ?? []) : [];
    ncFlowByCcy.set(
      ccy,
      computeCotFlow(series.map((p) => ({ date: p.date, net: p.net, openInterest: p.openInterest }))),
    );
    cFlowByCcy.set(
      ccy,
      computeCotFlow(series.map((p) => ({ date: p.date, net: p.commNet, openInterest: p.openInterest }))),
    );
    const pid = seriesFor(ccy, "policy_rate")?.id;
    const yid = seriesFor(ccy, "yield_10y")?.id;
    policyByCcy.set(ccy, pid ? (fredSeries.get(pid) ?? []) : []);
    yield10ByCcy.set(ccy, yid ? (fredSeries.get(yid) ?? []) : []);
  }

  const pricesByPair = new Map<string, Array<{ date: string; close: number }>>();
  for (const r of priceRows) {
    const arr = pricesByPair.get(r.instrument) ?? [];
    arr.push({ date: r.date, close: r.close });
    pricesByPair.set(r.instrument, arr);
  }

  // — Matrix füllen —
  const rows: Array<Array<number | null>> = [];

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const weekMs = new Date(week + "T00:00:00Z").getTime();
    const month = Number(week.slice(5, 7));

    // Zins-/Yield-Slices je Währung einmal pro Woche (nicht je Pair)
    const polSlice = new Map<string, SeriesPoint[]>();
    const yldSlice = new Map<string, SeriesPoint[]>();
    const ncAt = new Map<string, CotFlowPoint | null>();
    const cAt = new Map<string, CotFlowPoint | null>();
    for (const ccy of G8_CURRENCIES) {
      polSlice.set(ccy, (policyByCcy.get(ccy) ?? []).filter((p) => p.date <= week));
      yldSlice.set(ccy, (yield10ByCcy.get(ccy) ?? []).filter((p) => p.date <= week));
      ncAt.set(ccy, lastAtOrBefore(ncFlowByCcy.get(ccy) ?? [], week));
      cAt.set(ccy, lastAtOrBefore(cFlowByCcy.get(ccy) ?? [], week));
    }

    for (let pi = 0; pi < FX_INSTRUMENTS.length; pi++) {
      const inst = FX_INSTRUMENTS[pi];
      const base = inst.baseCcy!;
      const quote = inst.quoteCcy!;
      const series = pricesByPair.get(inst.instrument);
      if (!series || series.length === 0) continue;
      const c0 = closeAtOrAfter(series, weekMs, 5);
      if (c0 === null || c0 === 0) continue;

      // 1) Zins (identisch zu evaluatePair Faktor 1)
      let dZins = 0;
      {
        const rb = latest(polSlice.get(base)!);
        const rq = latest(polSlice.get(quote)!);
        const rb6 = valueMonthsAgo(polSlice.get(base)!, 6);
        const rq6 = valueMonthsAgo(polSlice.get(quote)!, 6);
        if (rb !== null && rq !== null) {
          const diff = rb - rq;
          const diffChange = rb6 !== null && rq6 !== null ? diff - (rb6 - rq6) : 0;
          if (diff > 0.25 || diffChange > 0.2) dZins = 1;
          else if (diff < -0.25 || diffChange < -0.2) dZins = -1;
        }
      }

      // 2+3) COT-Flow-Differenz Base−Quote (NC und Commercials, gleiche Schwelle ±4)
      const flowDir = (m: Map<string, CotFlowPoint | null>): number => {
        const fb = m.get(base);
        const fq = m.get(quote);
        if (fb?.delta4wPctOi == null || fq?.delta4wPctOi == null) return 0;
        const gap = fb.delta4wPctOi - fq.delta4wPctOi;
        return gap >= 4 ? 1 : gap <= -4 ? -1 : 0;
      };
      const dCotNC = flowDir(ncAt);
      const dCotC = flowDir(cAt);

      // 4) Saison (identisch zu evaluatePair Faktor 3)
      let dSaison = 0;
      {
        const stat = seasonality.get(inst.instrument)?.months.find((m) => m.month === month);
        if (stat && stat.years >= 8) {
          if (stat.avgReturn >= 0.3 && stat.hitRate >= 60) dSaison = 1;
          else if (stat.avgReturn <= -0.3 && stat.hitRate <= 40) dSaison = -1;
        }
      }

      // 5) Yield-Spread-Trend 3M (identisch zu evaluatePair Faktor 4)
      let dYield = 0;
      {
        const yb = yldSlice.get(base)!;
        const yq = yldSlice.get(quote)!;
        const nowB = latest(yb);
        const nowQ = latest(yq);
        const pastB = valueMonthsAgo(yb, 3);
        const pastQ = valueMonthsAgo(yq, 3);
        if (nowB !== null && nowQ !== null && pastB !== null && pastQ !== null) {
          const change = nowB - nowQ - (pastB - pastQ);
          if (change >= 0.15) dYield = 1;
          else if (change <= -0.15) dYield = -1;
        }
      }

      // Forward-Returns (LONG-Sicht, %)
      const rets: Array<number | null> = MATRIX_HORIZONS.map((h) => {
        const cN = closeAtOrAfter(series, weekMs + h * 7 * 86_400_000, 7);
        return cN === null ? null : Number((((cN - c0) / c0) * 100).toFixed(4));
      });

      // Zeilen ohne jedes Signal UND ohne Return bringen nichts
      if (dZins === 0 && dCotNC === 0 && dCotC === 0 && dSaison === 0 && dYield === 0) continue;
      if (rets.every((r) => r === null)) continue;

      rows.push([wi, pi, dZins, dCotNC, dCotC, dSaison, dYield, ...rets]);
    }
  }

  return {
    weeks,
    pairs: pairList,
    factors: [...MATRIX_FACTORS],
    horizons: [...MATRIX_HORIZONS],
    rows,
  };
}
