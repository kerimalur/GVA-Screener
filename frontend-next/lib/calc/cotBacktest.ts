import { rollingPercentile } from "./percentile";

export interface CotPoint {
  date: string; // Report-Datum (Dienstag)
  net: number; // Non-Commercials netto
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface BacktestSignal {
  date: string;
  net: number;
  percentile: number;
  /** Forward-Returns in % je Horizont (null = zu wenig Zukunftsdaten) */
  fwd: Record<number, number | null>;
}

export interface BacktestResult {
  signals: BacktestSignal[];
  horizons: number[];
  /** Aggregat je Horizont */
  stats: Record<
    number,
    { n: number; avg: number; median: number; hitRate: number } | null
  >;
}

export interface BacktestOptions {
  /** Schwelle in % (10 = Top/Bottom 10%) */
  thresholdPct: number;
  /** 'top' = Extrem-Long der Non-Commercials, 'bottom' = Extrem-Short */
  direction: "top" | "bottom";
  /** Handelstage vorwärts */
  horizons?: number[];
  /** Perzentil-Fenster in Wochen */
  windowWeeks?: number;
  /**
   * true bei USD_XXX-Preisinstrument (JPY/CHF/CAD-Futures): Long-Future =
   * Währungsstärke = Pair fällt -> Returns invertieren, damit "+" immer
   * "Bewegung in Richtung des Futures-Extrems" bedeutet.
   */
  invertPrice?: boolean;
}

/**
 * Historischer COT-Extrem-Backtest: Was passierte mit dem Preis, nachdem die
 * Non-Commercials ein Positionierungs-Extrem erreicht hatten?
 */
export function cotBacktest(
  cot: CotPoint[],
  prices: PricePoint[],
  opts: BacktestOptions,
): BacktestResult {
  const horizons = opts.horizons ?? [20, 40, 60];
  const windowWeeks = opts.windowWeeks ?? 260;

  const percentiles = rollingPercentile(
    cot.map((c) => c.net),
    windowWeeks,
  );

  // Preis-Index: Datum -> Position (für Forward-Lookup per Handelstag)
  const priceDates = prices.map((p) => p.date);
  const sign = opts.invertPrice ? -1 : 1;

  /** erster Preis-Index mit Datum >= d (binäre Suche) */
  function priceIdxAtOrAfter(d: string): number {
    let lo = 0;
    let hi = priceDates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (priceDates[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const signals: BacktestSignal[] = [];

  for (let i = 0; i < cot.length; i++) {
    const pct = percentiles[i];
    if (pct === null) continue;
    const isSignal =
      opts.direction === "top" ? pct >= 100 - opts.thresholdPct : pct <= opts.thresholdPct;
    if (!isSignal) continue;

    const baseIdx = priceIdxAtOrAfter(cot[i].date);
    if (baseIdx >= prices.length) continue;
    const base = prices[baseIdx].close;

    const fwd: Record<number, number | null> = {};
    for (const h of horizons) {
      const target = baseIdx + h;
      fwd[h] =
        target < prices.length ? sign * ((prices[target].close / base - 1) * 100) : null;
    }

    signals.push({ date: cot[i].date, net: cot[i].net, percentile: pct, fwd });
  }

  const stats: BacktestResult["stats"] = {};
  for (const h of horizons) {
    const returns = signals
      .map((s) => s.fwd[h])
      .filter((r): r is number => r !== null);
    if (returns.length === 0) {
      stats[h] = null;
      continue;
    }
    const sorted = [...returns].sort((a, b) => a - b);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const median =
      sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    // Konträr-These: nach Extrem-Long fällt der Kurs -> "Treffer" = negativer Return
    // Wir reporten neutral: hitRate = Anteil positiver Returns.
    const hitRate = returns.filter((r) => r > 0).length / returns.length;
    stats[h] = { n: returns.length, avg, median, hitRate: hitRate * 100 };
  }

  return { signals, horizons, stats };
}
