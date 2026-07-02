export interface SeriesPoint {
  date: string;
  value: number;
}

/**
 * Zwei Zeitreihen auf gemeinsamer Achse zusammenführen (Union der Daten,
 * Forward-Fill für fehlende Werte — nötig bei monatlich vs. täglich).
 */
export function mergeForwardFill(
  a: SeriesPoint[],
  b: SeriesPoint[],
): Array<{ date: string; a: number | null; b: number | null }> {
  const dates = [...new Set([...a.map((p) => p.date), ...b.map((p) => p.date)])].sort();
  const mapA = new Map(a.map((p) => [p.date, p.value]));
  const mapB = new Map(b.map((p) => [p.date, p.value]));

  let lastA: number | null = null;
  let lastB: number | null = null;
  return dates.map((date) => {
    lastA = mapA.get(date) ?? lastA;
    lastB = mapB.get(date) ?? lastB;
    return { date, a: lastA, b: lastB };
  });
}

/** Differenz-Serie a − b (Forward-Fill, nur Punkte mit beiden Werten). */
export function diffSeries(a: SeriesPoint[], b: SeriesPoint[]): SeriesPoint[] {
  return mergeForwardFill(a, b)
    .filter((p): p is { date: string; a: number; b: number } => p.a !== null && p.b !== null)
    .map((p) => ({ date: p.date, value: p.a - p.b }));
}

/** YoY-Prozent aus Indexreihe (monatlich: 12 Perioden, quartalsweise: 4). */
export function yoyFromIndex(series: SeriesPoint[], periodsPerYear = 12): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = periodsPerYear; i < series.length; i++) {
    const prev = series[i - periodsPerYear].value;
    if (prev !== 0) {
      out.push({ date: series[i].date, value: (series[i].value / prev - 1) * 100 });
    }
  }
  return out;
}

/** Einfacher gleitender Durchschnitt. */
export function sma(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

/** Log-Returns einer Schlusskursreihe. */
export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}
