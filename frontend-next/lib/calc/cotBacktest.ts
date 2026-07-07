import { rollingPercentile } from "./percentile";

export interface CotPoint {
  date: string; // Report-Datum (Dienstag)
  net: number; // Netto-Position (NonComm bei Legacy, Leveraged Funds bei TFF)
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface BacktestSignal {
  date: string;
  net: number;
  /** 1W-Δ der Nettoposition (nur im delta-Modus relevant) */
  delta: number | null;
  /** Perzentil der Signal-Metrik (Niveau bzw. Δ) */
  percentile: number;
  /** Forward-Returns in % je Horizont (null = zu wenig Zukunftsdaten) */
  fwd: Record<number, number | null>;
}

export interface HorizonStats {
  n: number;
  avg: number;
  median: number;
  hitRate: number;
}

export interface BacktestVerdict {
  grade: "belastbar" | "schwach" | "unzureichend";
  text: string;
}

export interface BacktestResult {
  signals: BacktestSignal[];
  horizons: number[];
  /** Aggregat je Horizont (nur Signal-Wochen) */
  stats: Record<number, HorizonStats | null>;
  /** Basisrate: unconditional Forward-Returns ALLER Wochen desselben Zeitraums */
  baseline: Record<number, HorizonStats | null>;
  /** Edge = Signal-Ø minus Basisrate-Ø (pp) je Horizont */
  edge: Record<number, number | null>;
  verdict: BacktestVerdict;
}

export interface BacktestOptions {
  /** Schwelle in % (10 = Top/Bottom 10%) */
  thresholdPct: number;
  /** 'top' = Extrem-Long bzw. Extrem-Zufluss, 'bottom' = Extrem-Short bzw. -Abfluss */
  direction: "top" | "bottom";
  /**
   * 'level' = Niveau-Extrem der Nettoposition (klassisch).
   * 'delta' = Flow-Extrem: ungewöhnlich große Wochenveränderung — testet die
   * These "nicht das Niveau, die Veränderung zählt" empirisch.
   */
  mode?: "level" | "delta";
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

function aggregate(returns: number[]): HorizonStats | null {
  if (returns.length === 0) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const hitRate = (returns.filter((r) => r > 0).length / returns.length) * 100;
  return { n: returns.length, avg, median, hitRate };
}

function buildVerdict(
  stats: BacktestResult["stats"],
  edge: BacktestResult["edge"],
  horizons: number[],
  opts: { direction: "top" | "bottom"; mode: "level" | "delta" },
): BacktestVerdict {
  const main = horizons.find((h) => stats[h]) ?? horizons[0];
  const s = stats[main];
  if (!s || s.n < 8) {
    return {
      grade: "unzureichend",
      text: `Nur ${s?.n ?? 0} Signale bei dieser Schwelle — statistisch keine belastbare Aussage. Schwelle lockern oder Fenster vergrößern.`,
    };
  }

  const edges = horizons.map((h) => edge[h]).filter((e): e is number => e !== null);
  const meaningful = edges.filter((e) => Math.abs(e) >= 0.3);
  const consistent =
    meaningful.length >= 2 && meaningful.every((e) => Math.sign(e) === Math.sign(meaningful[0]));
  const mainEdge = edge[main] ?? 0;

  const signalDesc =
    opts.mode === "delta"
      ? opts.direction === "top"
        ? "einem ungewöhnlich starken Wochen-Zufluss"
        : "einem ungewöhnlich starken Wochen-Abfluss"
      : opts.direction === "top"
        ? "einem Niveau-Extrem-Long"
        : "einem Niveau-Extrem-Short";

  const followThrough = opts.direction === "top" ? mainEdge > 0 : mainEdge < 0;
  const interpretation =
    Math.abs(mainEdge) < 0.3
      ? "Kein nennenswerter Unterschied zur Basisrate — dieses Signal hatte hier historisch keinen Edge."
      : followThrough
        ? opts.mode === "delta"
          ? "Der Flow wirkte trendbestätigend: dem Extrem folgte im Schnitt weitere Bewegung in dieselbe Richtung."
          : "Das Extrem wirkte trendbestätigend (Momentum), nicht konträr."
        : opts.mode === "delta"
          ? "Dem Flow-Extrem folgte im Schnitt eine Gegenbewegung (Erschöpfung/Konträr-Signal)."
          : "Das Niveau-Extrem wirkte konträr: Crowded Trade mit anschließender Gegenbewegung.";

  const grade: BacktestVerdict["grade"] = s.n >= 15 && consistent ? "belastbar" : "schwach";
  return {
    grade,
    text: `Nach ${signalDesc} (n=${s.n}) lag der Forward-Return über ${main} Handelstage im Ø bei ${
      s.avg > 0 ? "+" : ""
    }${s.avg.toFixed(2)} % — Edge ${mainEdge > 0 ? "+" : ""}${mainEdge.toFixed(2)} pp gegenüber der Basisrate. ${interpretation}${
      grade === "schwach" ? " (Edge über die Horizonte nicht konsistent bzw. n klein — mit Vorsicht.)" : ""
    }`,
  };
}

/**
 * COT-Backtest: Was passierte mit dem Preis nach einem Positionierungs-Extrem
 * (mode 'level') bzw. nach einer extremen Wochenveränderung (mode 'delta')?
 * Jede Statistik wird gegen die unconditional Basisrate desselben Zeitraums
 * gestellt — ohne Basisrate ist ein Ø-Return bedeutungslos.
 */
export function cotBacktest(
  cot: CotPoint[],
  prices: PricePoint[],
  opts: BacktestOptions,
): BacktestResult {
  const horizons = opts.horizons ?? [20, 40, 60];
  const windowWeeks = opts.windowWeeks ?? 260;
  const mode = opts.mode ?? "level";

  const deltas = cot.map((c, i) => (i >= 1 ? c.net - cot[i - 1].net : null));
  const metric = mode === "delta" ? deltas.map((d) => d ?? 0) : cot.map((c) => c.net);
  const percentiles = rollingPercentile(metric, windowWeeks);

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

  function forwardReturns(date: string): Record<number, number | null> | null {
    const baseIdx = priceIdxAtOrAfter(date);
    if (baseIdx >= prices.length) return null;
    const base = prices[baseIdx].close;
    const fwd: Record<number, number | null> = {};
    for (const h of horizons) {
      const target = baseIdx + h;
      fwd[h] = target < prices.length ? sign * ((prices[target].close / base - 1) * 100) : null;
    }
    return fwd;
  }

  const signals: BacktestSignal[] = [];
  const baselineReturns: Record<number, number[]> = Object.fromEntries(
    horizons.map((h) => [h, [] as number[]]),
  );

  for (let i = 0; i < cot.length; i++) {
    const pct = percentiles[i];
    if (pct === null) continue;
    if (mode === "delta" && deltas[i] === null) continue;

    const fwd = forwardReturns(cot[i].date);
    if (!fwd) continue;

    // Basisrate: JEDE Woche mit gültigem Fenster zählt
    for (const h of horizons) {
      const r = fwd[h];
      if (r !== null) baselineReturns[h].push(r);
    }

    const isSignal =
      opts.direction === "top" ? pct >= 100 - opts.thresholdPct : pct <= opts.thresholdPct;
    if (!isSignal) continue;

    signals.push({ date: cot[i].date, net: cot[i].net, delta: deltas[i], percentile: pct, fwd });
  }

  const stats: BacktestResult["stats"] = {};
  const baseline: BacktestResult["baseline"] = {};
  const edge: BacktestResult["edge"] = {};
  for (const h of horizons) {
    stats[h] = aggregate(signals.map((s) => s.fwd[h]).filter((r): r is number => r !== null));
    baseline[h] = aggregate(baselineReturns[h]);
    edge[h] = stats[h] && baseline[h] ? stats[h]!.avg - baseline[h]!.avg : null;
  }

  return {
    signals,
    horizons,
    stats,
    baseline,
    edge,
    verdict: buildVerdict(stats, edge, horizons, { direction: opts.direction, mode }),
  };
}
