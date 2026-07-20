import type { SeriesPoint } from "./seriesMath";

/**
 * Real-Yield-Valuation — reines BIAS-/KONFLUENZ-Display, KEIN Faktor im
 * Q-Score. Real Yield = Leitzins (nominal) − CPI YoY (realized). Deterministisch,
 * kein ML. Achtung Interpretations-Grenze: realized CPI hinkt der Lage um
 * 1–4 Monate hinterher — an Wendepunkten läuft die Anzeige nach.
 */

export type Freshness = "fresh" | "old" | "dead";

/**
 * Frische-Einstufung eines Datenstands.
 *
 * Default-Schwellen sind die Real-Yield-Schwellen: ≤100 Tage = aktuell,
 * ≤400 = älterer Stand (Quartals-/Publikationslag), sonst tot.
 *
 * Die Schwellen sind überschreibbar, damit andere Skalen dieselbe Logik nutzen
 * statt eine zweite zu bauen — z.B. das Cockpit mit Minuten
 * (`freshnessOf(alterInMinuten, 2, 5)`). `age === null` gilt immer als "dead":
 * kein bekannter Stand ist der schlechteste Fall, nicht der beste.
 */
export function freshnessOf(
  age: number | null,
  freshMax = 100,
  staleMax = 400,
): Freshness {
  if (age === null || age > staleMax) return "dead";
  return age <= freshMax ? "fresh" : "old";
}

export interface RealYieldPoint {
  date: string; // 'YYYY-MM-01'
  rate: number;
  cpi: number;
  realYield: number;
}

export interface CcyRealYield {
  ccy: string;
  rate: number | null;
  rateDate: string | null;
  cpi: number | null;
  cpiDate: string | null;
  cpiAgeDays: number | null;
  freshness: Freshness;
  /** null wenn freshness === 'dead' — nie mit toten Daten weiterrechnen */
  realYield: number | null;
  slope6M: number | null; // Δ Real Yield vs. vor 6 Monaten (pp)
  slope12M: number | null;
  series: RealYieldPoint[]; // monatlich aufsteigend (Chart/Paar-Ansicht)
}

const dayDiff = (iso: string, now: Date): number =>
  Math.round((now.getTime() - new Date(iso).getTime()) / 86_400_000);

/** Monats-Join Leitzins × CPI; CPI wird max. 3 Monate fortgeschrieben
 *  (Quartalsländer/Publikationslag), danach gilt der Monat als Lücke. */
export function buildRealYieldSeries(
  policy: SeriesPoint[],
  cpi: SeriesPoint[],
): RealYieldPoint[] {
  const cpiByDate = new Map(cpi.map((p) => [p.date, p.value]));
  const cpiDatesAsc = cpi.map((p) => p.date);
  const out: RealYieldPoint[] = [];

  for (const p of policy) {
    let c = cpiByDate.get(p.date);
    if (c === undefined) {
      // letzter CPI-Wert ≤3 Monate vor diesem Monat
      let last: string | null = null;
      for (const d of cpiDatesAsc) {
        if (d <= p.date) last = d;
        else break;
      }
      if (last) {
        const gapMonths =
          (Number(p.date.slice(0, 4)) - Number(last.slice(0, 4))) * 12 +
          (Number(p.date.slice(5, 7)) - Number(last.slice(5, 7)));
        if (gapMonths <= 3) c = cpiByDate.get(last);
      }
    }
    if (c === undefined) continue;
    out.push({ date: p.date, rate: p.value, cpi: c, realYield: p.value - c });
  }
  return out;
}

/** Wert der Serie ~n Monate vor dem letzten Punkt (nächstliegender Monat, ±2M Toleranz). */
function valueMonthsAgo(series: RealYieldPoint[], months: number): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const target = new Date(last.date);
  target.setMonth(target.getMonth() - months);
  const targetIso = target.toISOString().slice(0, 10);
  let best: RealYieldPoint | null = null;
  let bestGap = Infinity;
  for (const p of series) {
    const gap = Math.abs(new Date(p.date).getTime() - new Date(targetIso).getTime());
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  if (!best || best.date === last.date) return null;
  return bestGap / 86_400_000 <= 62 ? best.realYield : null;
}

export function buildCcyRealYield(
  ccy: string,
  policy: SeriesPoint[],
  cpi: SeriesPoint[],
  now: Date = new Date(),
): CcyRealYield {
  const lastRate = policy[policy.length - 1] ?? null;
  const lastCpi = cpi[cpi.length - 1] ?? null;
  const cpiAgeDays = lastCpi ? dayDiff(lastCpi.date, now) : null;
  const freshness = lastRate ? freshnessOf(cpiAgeDays) : "dead";
  const series = buildRealYieldSeries(policy, cpi);
  const last = series[series.length - 1] ?? null;
  const ago6 = valueMonthsAgo(series, 6);
  const ago12 = valueMonthsAgo(series, 12);
  const usable = freshness !== "dead";

  return {
    ccy,
    rate: lastRate?.value ?? null,
    rateDate: lastRate?.date ?? null,
    cpi: lastCpi?.value ?? null,
    cpiDate: lastCpi?.date ?? null,
    cpiAgeDays,
    freshness,
    realYield: usable ? (last?.realYield ?? null) : null,
    slope6M: usable && last && ago6 !== null ? Number((last.realYield - ago6).toFixed(3)) : null,
    slope12M: usable && last && ago12 !== null ? Number((last.realYield - ago12).toFixed(3)) : null,
    series,
  };
}

/* ── Verdikt für die Verlaufs-Ansicht (reines Display, kein Q-Score-Faktor) ── */

/** Neutralband fürs Level: |Real Yield| ≤ Band zählt nicht als Richtung. */
export const VERDICT_LEVEL_BAND = 0.25;
/** Neutralband für den Kurz-Trend (pp) — identisch zur Slope-Anzeige (flat < 0.1). */
export const VERDICT_TREND_BAND = 0.1;

export type RealYieldVerdictLabel =
  | "bullish"
  | "leicht-bullish"
  | "neutral"
  | "leicht-bearish"
  | "bearish";

export interface RealYieldVerdict {
  verdict: RealYieldVerdictLabel;
  /** letzter Real Yield bzw. letzte Paar-Differenz (%/pp) */
  level: number;
  /** Δ Real Yield über die letzten ~1–2 Monate (pp); null wenn Serie zu kurz */
  trend: number | null;
  trendMonths: 1 | 2 | null;
}

/** Δ Real Yield vs. dem Punkt ~n Monate vor dem letzten (Datums-basiert,
 *  tolerant gegen CPI-Lücken bei Quartalsländern). */
export function shortTrend(series: RealYieldPoint[], months: number): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const target = new Date(last.date);
  target.setMonth(target.getMonth() - months);
  const targetMs = target.getTime();
  let best: RealYieldPoint | null = null;
  let bestGap = Infinity;
  for (const p of series) {
    if (p.date === last.date) continue;
    const gap = Math.abs(new Date(p.date).getTime() - targetMs);
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  if (!best || bestGap / 86_400_000 > months * 31 + 20) return null;
  return Number((last.realYield - best.realYield).toFixed(3));
}

/**
 * Verdikt aus Level + Kurz-Trend (2M, Fallback 1M). Level und Trend zählen je
 * −1/0/+1; Summe +2 → bullish, +1 → leicht-bullish, 0 → neutral, usw.
 * Für Paare: Serie = Differenz A−B, bullish = spricht für Währung A.
 */
export function realYieldVerdict(series: RealYieldPoint[]): RealYieldVerdict | null {
  const last = series[series.length - 1];
  if (!last) return null;
  let trendMonths: 1 | 2 | null = 2;
  let trend = shortTrend(series, 2);
  if (trend === null) {
    trend = shortTrend(series, 1);
    trendMonths = trend !== null ? 1 : null;
  }
  const levelScore =
    last.realYield > VERDICT_LEVEL_BAND ? 1 : last.realYield < -VERDICT_LEVEL_BAND ? -1 : 0;
  const trendScore =
    trend === null ? 0 : trend > VERDICT_TREND_BAND ? 1 : trend < -VERDICT_TREND_BAND ? -1 : 0;
  const sum = levelScore + trendScore;
  const verdict: RealYieldVerdictLabel =
    sum >= 2
      ? "bullish"
      : sum === 1
        ? "leicht-bullish"
        : sum === 0
          ? "neutral"
          : sum === -1
            ? "leicht-bearish"
            : "bearish";
  return { verdict, level: last.realYield, trend, trendMonths };
}

/** stark → schwach; Währungen ohne belastbare Daten ans Ende. */
export function rankRealYield(list: CcyRealYield[]): CcyRealYield[] {
  return [...list].sort((a, b) => {
    if (a.realYield === null && b.realYield === null) return a.ccy.localeCompare(b.ccy);
    if (a.realYield === null) return 1;
    if (b.realYield === null) return -1;
    return b.realYield - a.realYield;
  });
}
