import { rollingPercentile } from "./percentile";

/**
 * Δ-zentrierte COT-Kennzahlen: Wochen-Flow statt Niveau.
 * Kern-These: konstanter Zufluss über Wochen = institutionelle Akkumulation;
 * ein Niveau-Extrem kann monatelang extrem bleiben, das Signal entsteht,
 * wenn das Δ kippt.
 */

export interface CotFlowInput {
  date: string;
  net: number;
  openInterest: number | null;
}

export interface CotFlowPoint {
  date: string;
  net: number;
  /** Netto-Änderung zur Vorwoche (Kontrakte) */
  delta1w: number | null;
  /** Netto-Änderung über 4 Wochen (Kontrakte) */
  delta4w: number | null;
  /** 1W-Δ in % des Open Interest — vergleichbar über Contracts hinweg */
  delta1wPctOi: number | null;
  /** 4W-Δ in % des Open Interest */
  delta4wPctOi: number | null;
  /** Perzentil des 1W-Δ im Rolling-Fenster: wie ungewöhnlich ist diese Woche? */
  deltaPercentile: number | null;
  /** Wochen in Folge mit gleichem Δ-Vorzeichen (inkl. aktueller; 0 = Δ null/unbekannt) */
  streakWeeks: number;
}

export function computeCotFlow(
  series: CotFlowInput[],
  windowWeeks = 260,
): CotFlowPoint[] {
  const deltas1w = series.map((p, i) => (i >= 1 ? p.net - series[i - 1].net : null));
  const deltaPercentiles = rollingPercentile(
    deltas1w.map((d) => d ?? 0),
    windowWeeks,
  );

  const out: CotFlowPoint[] = [];
  let streak = 0;
  for (let i = 0; i < series.length; i++) {
    const p = series[i];
    const d1 = deltas1w[i];
    const d4 = i >= 4 ? p.net - series[i - 4].net : null;
    const oi = p.openInterest && p.openInterest > 0 ? p.openInterest : null;

    if (d1 === null || d1 === 0) streak = 0;
    else {
      const prev = deltas1w[i - 1];
      streak = prev !== null && Math.sign(prev) === Math.sign(d1) ? streak + 1 : 1;
    }

    out.push({
      date: p.date,
      net: p.net,
      delta1w: d1,
      delta4w: d4,
      delta1wPctOi: d1 !== null && oi ? (d1 / oi) * 100 : null,
      delta4wPctOi: d4 !== null && oi ? (d4 / oi) * 100 : null,
      // erst ab Woche 2 sinnvoll (davor ist das Δ ein 0-Platzhalter)
      deltaPercentile: d1 === null ? null : deltaPercentiles[i],
      streakWeeks: streak,
    });
  }
  return out;
}

/** Kompakter Flow-Zustand einer Währung/eines Contracts für Screener & Cockpit. */
export interface CotFlowSummary {
  date: string;
  delta1wPctOi: number | null;
  delta4wPctOi: number | null;
  deltaPercentile: number | null;
  streakWeeks: number;
  /** Vorzeichen des aktuellen 1W-Δ: -1 | 0 | 1 */
  direction: -1 | 0 | 1;
}

export function latestFlow(points: CotFlowPoint[]): CotFlowSummary | null {
  const last = points[points.length - 1];
  if (!last) return null;
  return {
    date: last.date,
    delta1wPctOi: last.delta1wPctOi,
    delta4wPctOi: last.delta4wPctOi,
    deltaPercentile: last.deltaPercentile,
    streakWeeks: last.streakWeeks,
    direction: last.delta1w === null || last.delta1w === 0 ? 0 : last.delta1w > 0 ? 1 : -1,
  };
}

/** Klartext-Einordnung eines Δ-Perzentils (0–100). */
export function flowLabel(deltaPercentile: number | null): string {
  if (deltaPercentile === null) return "keine Einordnung";
  if (deltaPercentile >= 90) return "ungewöhnlich starker Zufluss";
  if (deltaPercentile >= 70) return "deutlicher Zufluss";
  if (deltaPercentile > 30) return "normaler Wochen-Flow";
  if (deltaPercentile > 10) return "deutlicher Abfluss";
  return "ungewöhnlich starker Abfluss";
}
