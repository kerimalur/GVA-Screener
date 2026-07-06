import type { SeriesPoint } from "./seriesMath";

export type ChangeWindow = "1W" | "1M" | "3M" | "1J";

export const CHANGE_WINDOW_DAYS: Record<ChangeWindow, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 91,
  "1J": 365,
};

export const CHANGE_WINDOWS = Object.keys(CHANGE_WINDOW_DAYS) as ChangeWindow[];

export interface ChangeStat {
  /** absolute Veränderung */
  delta: number;
  /** prozentual — null wenn Basiswert <= 0 (z. B. negatives COT-Netto) */
  pct: number | null;
}

export interface ChangeStats {
  last: number | null;
  lastDate: string | null;
  changes: Record<ChangeWindow, ChangeStat | null>;
}

/**
 * Δ-Statistik einer Serie mit datumsbasierten Lookbacks:
 * Vergleichswert = letzter Punkt <= Cutoff — funktioniert für
 * tägliche Preise und wöchentliche COT-Serien gleichermaßen.
 * Erwartet chronologisch sortierte Punkte.
 */
export function computeChangeStats(points: SeriesPoint[]): ChangeStats {
  const changes: ChangeStats["changes"] = { "1W": null, "1M": null, "3M": null, "1J": null };
  if (points.length === 0) return { last: null, lastDate: null, changes };

  const last = points[points.length - 1];

  for (const w of CHANGE_WINDOWS) {
    const cutoff = new Date(last.date);
    cutoff.setDate(cutoff.getDate() - CHANGE_WINDOW_DAYS[w]);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const past = [...points].reverse().find((p) => p.date <= cutoffStr);
    if (!past) continue;
    const delta = last.value - past.value;
    changes[w] = { delta, pct: past.value > 0 ? (delta / past.value) * 100 : null };
  }

  return { last: last.value, lastDate: last.date, changes };
}
