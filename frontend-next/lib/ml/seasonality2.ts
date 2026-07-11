import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "@/lib/data/util";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { pastMondays } from "./outlookSnapshots";

/**
 * Saisonalität 2.0 — erweiterte saisonale Features + Walk-Forward-Backtest.
 *
 * Statt nur "Monats-Ø ≥ ±0.3% und Hitrate ≥60%" wie im einfachen Screener
 * werden hier Sub-Patterns extrahiert:
 *   - Monats-Return (as-of Rolling, kein Lookahead)
 *   - Woche-des-Monats (1–5)
 *   - Quartalsende-Effekt (letzte Woche Q1–Q4)
 *   - Monatsanfangs-Flows (erste Woche)
 *   - Halbjahr (H1/H2)
 *   - Jahresend-/Jahresanfangs-Fenster
 *   - Regime-konditioniert (Risk-On vs Risk-Off Jahre)
 *
 * Alle Features sind as-of-sicher: für eine Woche mit Start X werden nur
 * Daten mit Datum < X verwendet (Rolling über abgeschlossene Jahre).
 */

export const SEASON2_WEEKS = 900; // 17+ Jahre wie im Labor

// ── Typen ──

export interface Season2Row {
  weekIdx: number;
  pairIdx: number;
  month: number;             // 1–12
  weekOfMonth: number;       // 1–5
  isQuarterEnd: number;      // 0/1
  isMonthFirstWeek: number;  // 0/1
  isYearEnd: number;         // 0/1 (letzte 2 Wochen Dez)
  isYearStart: number;       // 0/1 (erste 2 Wochen Jan)
  halfYear: number;          // 1 oder 2
  // As-of Rolling-Saisonalität (nur abgeschlossene Jahre bis Stichtag)
  monthAvgReturn: number | null;  // Ø-Return dieses Monats, Rolling
  monthHitRate: number | null;    // Hitrate dieses Monats, Rolling
  monthYears: number;             // Basis-Jahre
  // Woche-des-Monats Statistik (Rolling)
  womAvgReturn: number | null;
  womHitRate: number | null;
  womYears: number;
  // Quartalsende-Statistik (Rolling, nur für QE-Wochen)
  qeAvgReturn: number | null;
  qeHitRate: number | null;
  qeYears: number;
  // Regime-konditioniert
  monthAvgRiskOn: number | null;  // Monats-Ø nur in Risk-On-Jahren
  monthAvgRiskOff: number | null; // Monats-Ø nur in Risk-Off-Jahren
  // Forward-Returns
  ret1w: number | null;
  ret2w: number | null;
  ret3w: number | null;
  ret4w: number | null;
}

export interface Season2Matrix {
  weeks: string[];
  pairs: string[];
  fields: string[];
  rows: Season2Row[];
}

// ── Hilfsfunktionen ──

/** Erster Close am/nach target (≤ toleranz Tage), binäre Suche. */
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

/** Woche des Monats (1–5) für ein Datum. */
function weekOfMonth(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDate();
  return Math.ceil(day / 7);
}

/** Ist das die letzte Woche eines Quartals? */
function isQuarterEndWeek(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  const month = d.getUTCMonth() + 1; // 1-based
  if (![3, 6, 9, 12].includes(month)) return false;
  // Letzte Woche = Tag ≥ 24
  return d.getUTCDate() >= 24;
}

/** Ist die erste Woche des Monats? (Tag ≤ 7) */
function isFirstWeekOfMonth(dateStr: string): boolean {
  return new Date(dateStr + "T00:00:00Z").getUTCDate() <= 7;
}

/** Jahresend-Fenster (letzte 2 Wochen Dezember). */
function isYearEndWindow(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.getUTCMonth() === 11 && d.getUTCDate() >= 17;
}

/** Jahresstart-Fenster (erste 2 Wochen Januar). */
function isYearStartWindow(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.getUTCMonth() === 0 && d.getUTCDate() <= 14;
}

// ── Rolling-Saisonalitäts-Berechnung (as-of) ──

interface MonthlyReturn {
  year: number;
  month: number;
  ret: number; // %
  weekOfMonth: number;
  isQuarterEnd: boolean;
}

/**
 * Berechnet Monatsreturns aus Tagespreisen: letzter Close des Monats vs. vorheriger.
 * Erweitert um Woche-des-Monats und QE-Flag für die granularen Statistiken.
 */
function computeMonthlyReturns(
  prices: Array<{ date: string; close: number }>,
): MonthlyReturn[] {
  // Letzter Close je YYYY-MM
  const lastByMonth = new Map<string, { close: number; date: string }>();
  for (const p of prices) {
    const ym = p.date.slice(0, 7);
    lastByMonth.set(ym, { close: p.close, date: p.date });
  }

  const keys = [...lastByMonth.keys()].sort();
  const returns: MonthlyReturn[] = [];

  for (let i = 1; i < keys.length; i++) {
    const prev = lastByMonth.get(keys[i - 1])!;
    const cur = lastByMonth.get(keys[i])!;
    if (prev.close === 0) continue;

    const year = parseInt(keys[i].slice(0, 4), 10);
    const month = parseInt(keys[i].slice(5, 7), 10);
    const ret = ((cur.close / prev.close) - 1) * 100;

    returns.push({
      year,
      month,
      ret,
      weekOfMonth: weekOfMonth(cur.date),
      isQuarterEnd: [3, 6, 9, 12].includes(month),
    });
  }

  return returns;
}

/**
 * Rolling-Statistik: Ø-Return und Hitrate für einen Filter,
 * nur über Jahre die STRIKT VOR dem Stichtag-Jahr abgeschlossen sind.
 */
function rollingStats(
  returns: MonthlyReturn[],
  asOfYear: number,
  filter: (r: MonthlyReturn) => boolean,
): { avg: number | null; hitRate: number | null; n: number } {
  const matching = returns.filter(
    (r) => r.year < asOfYear && filter(r),
  );
  if (matching.length < 5) return { avg: null, hitRate: null, n: matching.length };
  const avg = matching.reduce((s, r) => s + r.ret, 0) / matching.length;
  const hitRate = (matching.filter((r) => r.ret > 0).length / matching.length) * 100;
  return { avg, hitRate, n: matching.length };
}

// ── Risk-On/Off-Jahre bestimmen (SPX Jahresrendite > 0 = Risk-On) ──

function computeRiskOnYears(
  spxPrices: Array<{ date: string; close: number }>,
): Set<number> {
  const lastByYear = new Map<number, number>();
  for (const p of spxPrices) {
    const year = parseInt(p.date.slice(0, 4), 10);
    lastByYear.set(year, p.close);
  }

  const years = [...lastByYear.keys()].sort();
  const riskOnYears = new Set<number>();

  for (let i = 1; i < years.length; i++) {
    const prevClose = lastByYear.get(years[i - 1])!;
    const curClose = lastByYear.get(years[i])!;
    if (prevClose > 0 && curClose > prevClose) {
      riskOnYears.add(years[i]);
    }
  }

  return riskOnYears;
}

// ── Haupt-Builder ──

export async function buildSeason2Matrix(
  db: SupabaseClient,
  weeksCount = SEASON2_WEEKS,
): Promise<Season2Matrix> {
  const weeks = pastMondays(weeksCount);
  const pairList = FX_INSTRUMENTS.map((i) => i.instrument);

  // Preisdaten laden (für Monatsreturns + Forward-Returns)
  const [priceRows, spxRows] = await Promise.all([
    pagedSelect<{ instrument: string; date: string; close: number }>(
      db,
      "price_daily",
      "instrument, date, close",
      (q) =>
        q
          .in("instrument", [...pairList, "SPX500_USD"])
          .order("instrument")
          .order("date"),
    ),
    // SPX separat falls nicht in pairList
    pairList.includes("SPX500_USD")
      ? Promise.resolve([])
      : pagedSelect<{ date: string; close: number }>(
          db,
          "price_daily",
          "date, close",
          (q) => q.eq("instrument", "SPX500_USD").order("date"),
        ),
  ]);

  // Preise je Pair aufteilen
  const pricesByPair = new Map<string, Array<{ date: string; close: number }>>();
  const spxPricesRaw: Array<{ date: string; close: number }> = [];

  for (const r of priceRows) {
    if (r.instrument === "SPX500_USD") {
      spxPricesRaw.push({ date: r.date, close: r.close });
      continue;
    }
    const arr = pricesByPair.get(r.instrument) ?? [];
    arr.push({ date: r.date, close: r.close });
    pricesByPair.set(r.instrument, arr);
  }

  const spxPrices = spxPricesRaw.length > 0 ? spxPricesRaw : spxRows;
  const riskOnYears = computeRiskOnYears(
    spxPrices as Array<{ date: string; close: number }>,
  );

  // Monatsreturns je Pair vorberechnen
  const monthlyReturnsByPair = new Map<string, MonthlyReturn[]>();
  for (const [pair, prices] of pricesByPair) {
    monthlyReturnsByPair.set(pair, computeMonthlyReturns(prices));
  }

  // Matrix füllen
  const rows: Season2Row[] = [];
  const fields = [
    "month", "weekOfMonth", "isQuarterEnd", "isMonthFirstWeek",
    "isYearEnd", "isYearStart", "halfYear",
    "monthAvgReturn", "monthHitRate", "monthYears",
    "womAvgReturn", "womHitRate", "womYears",
    "qeAvgReturn", "qeHitRate", "qeYears",
    "monthAvgRiskOn", "monthAvgRiskOff",
    "ret1w", "ret2w", "ret3w", "ret4w",
  ];

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const weekMs = new Date(week + "T00:00:00Z").getTime();
    const month = Number(week.slice(5, 7));
    const year = Number(week.slice(0, 4));
    const wom = weekOfMonth(week);
    const qe = isQuarterEndWeek(week) ? 1 : 0;
    const mfw = isFirstWeekOfMonth(week) ? 1 : 0;
    const ye = isYearEndWindow(week) ? 1 : 0;
    const ys = isYearStartWindow(week) ? 1 : 0;
    const hf = month <= 6 ? 1 : 2;

    for (let pi = 0; pi < pairList.length; pi++) {
      const pair = pairList[pi];
      const series = pricesByPair.get(pair);
      if (!series || series.length === 0) continue;

      const c0 = closeAtOrAfter(series, weekMs, 5);
      if (c0 === null || c0 === 0) continue;

      const monthlyReturns = monthlyReturnsByPair.get(pair) ?? [];

      // Rolling-Stats (as-of: nur abgeschlossene Jahre VOR diesem Jahr)
      const mStats = rollingStats(monthlyReturns, year, (r) => r.month === month);
      const womStats = rollingStats(
        monthlyReturns,
        year,
        (r) => r.month === month && r.weekOfMonth === wom,
      );
      const qeStats = qe
        ? rollingStats(monthlyReturns, year, (r) => r.isQuarterEnd && r.month === month)
        : { avg: null, hitRate: null, n: 0 };

      // Regime-konditioniert
      const riskOnStats = rollingStats(
        monthlyReturns,
        year,
        (r) => r.month === month && riskOnYears.has(r.year),
      );
      const riskOffStats = rollingStats(
        monthlyReturns,
        year,
        (r) => r.month === month && !riskOnYears.has(r.year),
      );

      // Forward-Returns
      const rets = [1, 2, 3, 4].map((h) => {
        const cN = closeAtOrAfter(series, weekMs + h * 7 * 86_400_000, 7);
        return cN === null ? null : Number((((cN - c0) / c0) * 100).toFixed(4));
      });

      rows.push({
        weekIdx: wi,
        pairIdx: pi,
        month,
        weekOfMonth: wom,
        isQuarterEnd: qe,
        isMonthFirstWeek: mfw,
        isYearEnd: ye,
        isYearStart: ys,
        halfYear: hf,
        monthAvgReturn: mStats.avg !== null ? Number(mStats.avg.toFixed(3)) : null,
        monthHitRate: mStats.hitRate !== null ? Number(mStats.hitRate.toFixed(1)) : null,
        monthYears: mStats.n,
        womAvgReturn: womStats.avg !== null ? Number(womStats.avg.toFixed(3)) : null,
        womHitRate: womStats.hitRate !== null ? Number(womStats.hitRate.toFixed(1)) : null,
        womYears: womStats.n,
        qeAvgReturn: qeStats.avg !== null ? Number(qeStats.avg.toFixed(3)) : null,
        qeHitRate: qeStats.hitRate !== null ? Number(qeStats.hitRate.toFixed(1)) : null,
        qeYears: qeStats.n,
        monthAvgRiskOn: riskOnStats.avg !== null ? Number(riskOnStats.avg.toFixed(3)) : null,
        monthAvgRiskOff: riskOffStats.avg !== null ? Number(riskOffStats.avg.toFixed(3)) : null,
        ret1w: rets[0],
        ret2w: rets[1],
        ret3w: rets[2],
        ret4w: rets[3],
      });
    }
  }

  return { weeks, pairs: pairList, fields, rows };
}
