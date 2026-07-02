import { logReturns } from "./seriesMath";

/** Pearson-Korrelation zweier gleichlanger Arrays. */
export function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 5) return null;
  const xs = x.slice(-n);
  const ys = y.slice(-n);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

export interface AlignedCloses {
  dates: string[];
  closesByKey: Map<string, number[]>;
}

/**
 * Schlusskurse mehrerer Instrumente auf gemeinsame Handelstage alignen
 * (nur Tage, an denen alle Instrumente einen Kurs haben).
 */
export function alignCloses(
  seriesByKey: Map<string, Array<{ date: string; close: number }>>,
): AlignedCloses {
  const keys = [...seriesByKey.keys()];
  if (keys.length === 0) return { dates: [], closesByKey: new Map() };

  const maps = keys.map((k) => new Map(seriesByKey.get(k)!.map((p) => [p.date, p.close])));
  const commonDates = [...maps[0].keys()]
    .filter((d) => maps.every((m) => m.has(d)))
    .sort();

  const closesByKey = new Map<string, number[]>();
  keys.forEach((k, i) => {
    closesByKey.set(k, commonDates.map((d) => maps[i].get(d)!));
  });
  return { dates: commonDates, closesByKey };
}

/**
 * Korrelationsmatrix auf Log-Returns über die letzten `windowDays` Handelstage.
 * Rückgabe: matrix[i][j] für keys[i] × keys[j].
 */
export function correlationMatrix(
  aligned: AlignedCloses,
  windowDays: number,
): { keys: string[]; matrix: (number | null)[][] } {
  const keys = [...aligned.closesByKey.keys()];
  const returns = keys.map((k) => {
    const closes = aligned.closesByKey.get(k)!;
    return logReturns(closes).slice(-windowDays);
  });

  const matrix = keys.map((_, i) =>
    keys.map((_, j) => (i === j ? 1 : pearson(returns[i], returns[j]))),
  );
  return { keys, matrix };
}

/** Rollierende Korrelation zweier Schlusskursreihen (für Overlay-Untertitel). */
export function rollingCorrelation(
  a: number[],
  b: number[],
  window: number,
): number | null {
  const ra = logReturns(a).slice(-window);
  const rb = logReturns(b).slice(-window);
  return pearson(ra, rb);
}
