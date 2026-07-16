import type { SeriesPoint } from "./seriesMath";

/**
 * Real-Yield-Valuation — reines BIAS-/KONFLUENZ-Display, KEIN Faktor im
 * Q-Score. Real Yield = Leitzins (nominal) − CPI YoY (realized). Deterministisch,
 * kein ML. Achtung Interpretations-Grenze: realized CPI hinkt der Lage um
 * 1–4 Monate hinterher — an Wendepunkten läuft die Anzeige nach.
 */

export type Freshness = "fresh" | "old" | "dead";

/** ≤100 Tage = aktuell; ≤400 = älterer Stand (Quartals-/Publikationslag); sonst tot. */
export function freshnessOf(ageDays: number | null): Freshness {
  if (ageDays === null || ageDays > 400) return "dead";
  return ageDays <= 100 ? "fresh" : "old";
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

/** stark → schwach; Währungen ohne belastbare Daten ans Ende. */
export function rankRealYield(list: CcyRealYield[]): CcyRealYield[] {
  return [...list].sort((a, b) => {
    if (a.realYield === null && b.realYield === null) return a.ccy.localeCompare(b.ccy);
    if (a.realYield === null) return 1;
    if (b.realYield === null) return -1;
    return b.realYield - a.realYield;
  });
}
