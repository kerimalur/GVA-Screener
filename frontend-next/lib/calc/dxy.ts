import type { SeriesPoint } from "./seriesMath";

export const DXY_WEIGHTS = [
  { key: "EUR_USD", weight: -0.576 },
  { key: "USD_JPY", weight: 0.136 },
  { key: "GBP_USD", weight: -0.119 },
  { key: "USD_CAD", weight: 0.091 },
  { key: "USD_SEK", weight: 0.042 },
  { key: "USD_CHF", weight: 0.036 },
] as const;

const DXY_CONST = 50.14348112;

/**
 * Echter Dollar-Index (offizielle geometrische Formel).
 * USD/SEK aus FRED (DEXSDUS), Rest aus OANDA — Union der Tage mit
 * Forward-Fill je Komponente; Punkte erst, sobald alle 6 vorhanden.
 */
export function computeDxy(series: Record<string, SeriesPoint[]>): SeriesPoint[] {
  const keys = DXY_WEIGHTS.map((w) => w.key);
  const maps = keys.map((k) => new Map((series[k] ?? []).map((p) => [p.date, p.value])));
  if (maps.some((m) => m.size === 0)) return [];

  const dates = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort();
  const last: (number | null)[] = keys.map(() => null);
  const out: SeriesPoint[] = [];

  for (const date of dates) {
    maps.forEach((m, i) => {
      const v = m.get(date);
      if (v !== undefined) last[i] = v;
    });
    if (last.every((v) => v !== null && v > 0)) {
      let dxy = DXY_CONST;
      DXY_WEIGHTS.forEach((w, i) => {
        dxy *= Math.pow(last[i] as number, w.weight);
      });
      out.push({ date, value: dxy });
    }
  }
  return out;
}
