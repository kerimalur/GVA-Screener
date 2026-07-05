/**
 * Conditional-Outcome: "Wenn COT-Flow X und Zins-Drehung Y, was machte der
 * Preis historisch?" — bewusst nur 2 Faktoren (~260 Wochenpunkte im 5J-Fenster,
 * mehr Dimensionen wären statistisch zu dünn), n wird immer ausgewiesen.
 */

export interface ConditionalWeek {
  date: string;
  /** 4W-COT-Flow (Vorzeichen zählt; %OI oder Kontrakte) */
  flow4w: number | null;
  /** 12W-Drehung des 10Y-Spreads ccy−USD in pp */
  spreadChange: number | null;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface BucketStats {
  n: number;
  avg: number;
  median: number;
  hitRate: number;
}

/** pp = Flow+ & Spread+, pn = Flow+ & Spread−, np = Flow− & Spread+, nn = Flow− & Spread− */
export type BucketKey = "pp" | "pn" | "np" | "nn";

export const BUCKET_LABELS: Record<BucketKey, string> = {
  pp: "Flow + · Spread-Drehung +",
  pn: "Flow + · Spread-Drehung −",
  np: "Flow − · Spread-Drehung +",
  nn: "Flow − · Spread-Drehung −",
};

export interface ConditionalResult {
  horizons: number[];
  buckets: Record<BucketKey, Record<number, BucketStats | null>>;
  baseline: Record<number, BucketStats | null>;
  /** Konstellation der aktuellsten Woche */
  current: { bucket: BucketKey | null; flow4w: number | null; spreadChange: number | null };
  verdictText: string;
}

function aggregate(returns: number[]): BucketStats | null {
  if (returns.length === 0) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    n: returns.length,
    avg,
    median,
    hitRate: (returns.filter((r) => r > 0).length / returns.length) * 100,
  };
}

function bucketOf(w: ConditionalWeek): BucketKey | null {
  if (w.flow4w === null || w.spreadChange === null) return null;
  if (w.flow4w === 0 || w.spreadChange === 0) return null;
  return `${w.flow4w > 0 ? "p" : "n"}${w.spreadChange > 0 ? "p" : "n"}` as BucketKey;
}

export function conditionalOutcome(
  weeks: ConditionalWeek[],
  prices: PricePoint[],
  opts: { horizons?: number[]; invertPrice?: boolean; ccy?: string } = {},
): ConditionalResult {
  const horizons = opts.horizons ?? [20, 40, 60];
  const sign = opts.invertPrice ? -1 : 1;
  const priceDates = prices.map((p) => p.date);

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

  const emptyRec = () => Object.fromEntries(horizons.map((h) => [h, [] as number[]]));
  const bucketReturns: Record<BucketKey, Record<number, number[]>> = {
    pp: emptyRec(),
    pn: emptyRec(),
    np: emptyRec(),
    nn: emptyRec(),
  };
  const baselineReturns: Record<number, number[]> = emptyRec();

  for (const w of weeks) {
    const key = bucketOf(w);
    const baseIdx = priceIdxAtOrAfter(w.date);
    if (baseIdx >= prices.length) continue;
    const base = prices[baseIdx].close;
    for (const h of horizons) {
      const target = baseIdx + h;
      if (target >= prices.length) continue;
      const r = sign * ((prices[target].close / base - 1) * 100);
      baselineReturns[h].push(r);
      if (key) bucketReturns[key][h].push(r);
    }
  }

  const buckets = Object.fromEntries(
    (Object.keys(bucketReturns) as BucketKey[]).map((k) => [
      k,
      Object.fromEntries(horizons.map((h) => [h, aggregate(bucketReturns[k][h])])),
    ]),
  ) as ConditionalResult["buckets"];
  const baseline = Object.fromEntries(
    horizons.map((h) => [h, aggregate(baselineReturns[h])]),
  ) as ConditionalResult["baseline"];

  const last = weeks[weeks.length - 1];
  const currentBucket = last ? bucketOf(last) : null;

  let verdictText = "Keine aktuelle Konstellation bestimmbar (Flow oder Spread-Daten fehlen).";
  if (last && currentBucket) {
    const mainH = horizons[0];
    const s = buckets[currentBucket][mainH];
    const b = baseline[mainH];
    const ccy = opts.ccy ?? "Basis";
    const desc = `${ccy}-Flow 4W ${last.flow4w! > 0 ? "positiv" : "negativ"} + 10Y-Spread-Drehung ${
      last.spreadChange! > 0 ? "positiv" : "negativ"
    }`;
    if (s && b) {
      const edge = s.avg - b.avg;
      verdictText =
        s.n < 8
          ? `Aktuelle Konstellation (${desc}): nur ${s.n} historische Fälle — keine belastbare Aussage.`
          : `Aktuelle Konstellation (${desc}): historisch Ø ${s.avg > 0 ? "+" : ""}${s.avg.toFixed(2)} % in ${mainH} Handelstagen (n=${s.n}, ${s.hitRate.toFixed(0)}% positiv) — Edge ${edge > 0 ? "+" : ""}${edge.toFixed(2)} pp vs. Basisrate.`;
    } else {
      verdictText = `Aktuelle Konstellation (${desc}): keine historischen Vergleichsfälle.`;
    }
  }

  return {
    horizons,
    buckets,
    baseline,
    current: {
      bucket: currentBucket,
      flow4w: last?.flow4w ?? null,
      spreadChange: last?.spreadChange ?? null,
    },
    verdictText,
  };
}
