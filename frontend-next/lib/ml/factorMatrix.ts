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
   * Eine Zeile je (Woche, Pair) mit gültigem Entry-Kurs. Layout (16 Spalten):
   * [weekIdx, pairIdx,
   *  d0..d4  (binäre Richtung je Faktor ∈ {-1,0,1}, alte Schwellen-Logik),
   *  z0..z4  (kontinuierlicher rollierender z-Score je Faktor, as-of, ±4 geklemmt),
   *  r0..r3] (Pair-Rendite % LONG-Sicht je Horizont, null wenn Kurs fehlt)
   * Reihenfolge der Faktoren = MATRIX_FACTORS. z-Score normiert jeden Faktor auf
   * seine eigene rollierende Pair-Historie → regime-robust (löst starre Schwellen).
   */
  rows: Array<Array<number | null>>;
}

export const ROW_D_OFF = 2; // Dirs beginnen hier
export const ROW_Z_OFF = 7; // z-Scores beginnen hier
export const ROW_R_OFF = 12; // Returns beginnen hier

/**
 * Rollierender z-Score (Fenster `window`, min. `minN` gültige Werte, as-of:
 * nur aktueller + vergangene Punkte). Null-Rohwerte bleiben null; zu dünne
 * Historie → 0 (neutral). Ergebnis auf ±`clamp` begrenzt.
 */
function rollingZ(vals: Array<number | null>, window = 156, minN = 52, clamp = 4): Array<number | null> {
  const out: Array<number | null> = vals.map(() => null);
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === null) continue;
    let sum = 0,
      sum2 = 0,
      cnt = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = vals[j];
      if (v === null) continue;
      sum += v;
      sum2 += v * v;
      cnt++;
    }
    if (cnt < minN) {
      out[i] = 0;
      continue;
    }
    const mean = sum / cnt;
    const varr = Math.max(sum2 / cnt - mean * mean, 1e-9);
    const z = (vals[i]! - mean) / Math.sqrt(varr);
    out[i] = Number(Math.max(-clamp, Math.min(clamp, z)).toFixed(2));
  }
  return out;
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

  // — Pass 1: je (Woche, Pair) Rohwerte + binäre Dirs + Returns sammeln —
  interface Cell {
    wi: number;
    dirs: number[]; // 5 binäre Richtungen (alte Schwellen)
    raws: Array<number | null>; // 5 kontinuierliche Rohwerte (für z-Score)
    rets: Array<number | null>;
  }
  const byPair = new Map<number, Cell[]>();

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const weekMs = new Date(week + "T00:00:00Z").getTime();
    const month = Number(week.slice(5, 7));

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

      // 1) Zins — Rohwert = Leitzins-Differenz (Level), Dir = alte Schwelle
      const rb = latest(polSlice.get(base)!);
      const rq = latest(polSlice.get(quote)!);
      const rb6 = valueMonthsAgo(polSlice.get(base)!, 6);
      const rq6 = valueMonthsAgo(polSlice.get(quote)!, 6);
      let rawZins: number | null = null;
      let dZins = 0;
      if (rb !== null && rq !== null) {
        const diff = rb - rq;
        rawZins = diff;
        const diffChange = rb6 !== null && rq6 !== null ? diff - (rb6 - rq6) : 0;
        if (diff > 0.25 || diffChange > 0.2) dZins = 1;
        else if (diff < -0.25 || diffChange < -0.2) dZins = -1;
      }

      // 2+3) COT-Flow-Differenz Base−Quote (Rohwert = gap, Dir = Schwelle ±4)
      const flowRaw = (m: Map<string, CotFlowPoint | null>): number | null => {
        const fb = m.get(base);
        const fq = m.get(quote);
        if (fb?.delta4wPctOi == null || fq?.delta4wPctOi == null) return null;
        return fb.delta4wPctOi - fq.delta4wPctOi;
      };
      const rawCotNC = flowRaw(ncAt);
      const rawCotC = flowRaw(cAt);
      const dCotNC = rawCotNC === null ? 0 : rawCotNC >= 4 ? 1 : rawCotNC <= -4 ? -1 : 0;
      const dCotC = rawCotC === null ? 0 : rawCotC >= 4 ? 1 : rawCotC <= -4 ? -1 : 0;

      // 4) Saison — Rohwert = Monats-Ø-Return, Dir = alte Schwelle
      let rawSaison: number | null = null;
      let dSaison = 0;
      {
        const stat = seasonality.get(inst.instrument)?.months.find((m) => m.month === month);
        if (stat && stat.years >= 8) {
          rawSaison = stat.avgReturn;
          if (stat.avgReturn >= 0.3 && stat.hitRate >= 60) dSaison = 1;
          else if (stat.avgReturn <= -0.3 && stat.hitRate <= 40) dSaison = -1;
        }
      }

      // 5) Yield-Spread-Trend 3M — Rohwert = 3M-Änderung des Spreads, Dir = Schwelle
      let rawYield: number | null = null;
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
          rawYield = change;
          if (change >= 0.15) dYield = 1;
          else if (change <= -0.15) dYield = -1;
        }
      }

      const rets: Array<number | null> = MATRIX_HORIZONS.map((h) => {
        const cN = closeAtOrAfter(series, weekMs + h * 7 * 86_400_000, 7);
        return cN === null ? null : Number((((cN - c0) / c0) * 100).toFixed(4));
      });
      if (rets.every((r) => r === null)) continue;

      const arr = byPair.get(pi) ?? [];
      arr.push({
        wi,
        dirs: [dZins, dCotNC, dCotC, dSaison, dYield],
        raws: [rawZins, rawCotNC, rawCotC, rawSaison, rawYield],
        rets,
      });
      byPair.set(pi, arr);
    }
  }

  // — Pass 2: je Pair rollierende z-Scores der Rohwerte, dann emittieren —
  const rows: Array<Array<number | null>> = [];
  const nFac = MATRIX_FACTORS.length;
  for (const [pi, cells] of byPair) {
    const zByFactor: Array<Array<number | null>> = [];
    for (let f = 0; f < nFac; f++) {
      zByFactor.push(rollingZ(cells.map((c) => c.raws[f])));
    }
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const zs = zByFactor.map((zf) => zf[i]);
      rows.push([c.wi, pi, ...c.dirs, ...zs, ...c.rets]);
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
