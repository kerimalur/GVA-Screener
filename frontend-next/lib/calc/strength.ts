import { FX_INSTRUMENTS, G8_CURRENCIES, type G8Currency } from "@/lib/constants/instruments";

export type Lookback = "1W" | "1M" | "3M";
export const LOOKBACK_DAYS: Record<Lookback, number> = { "1W": 5, "1M": 21, "3M": 63 };

export interface StrengthResult {
  /** Score je Währung und Lookback: Ø signierter Pair-Return in % */
  scores: Record<Lookback, Record<string, number>>;
  /** Ranking je Lookback (stärkste zuerst) */
  ranking: Record<Lookback, G8Currency[]>;
}

/**
 * Währungsstärke aus Tagesschlusskursen der 28 Paare:
 * je Währung Ø der signierten Pair-Returns (+ als Basis, − als Quote).
 */
export function currencyStrength(
  closesByInstrument: Map<string, number[]>,
): StrengthResult {
  const scores = { "1W": {}, "1M": {}, "3M": {} } as StrengthResult["scores"];
  const ranking = { "1W": [], "1M": [], "3M": [] } as StrengthResult["ranking"];

  for (const lb of Object.keys(LOOKBACK_DAYS) as Lookback[]) {
    const days = LOOKBACK_DAYS[lb];
    const sums = new Map<string, { sum: number; n: number }>();

    for (const inst of FX_INSTRUMENTS) {
      const closes = closesByInstrument.get(inst.instrument);
      if (!closes || closes.length < days + 1) continue;
      const ret = (closes[closes.length - 1] / closes[closes.length - 1 - days] - 1) * 100;

      for (const [ccy, sign] of [
        [inst.baseCcy!, 1],
        [inst.quoteCcy!, -1],
      ] as const) {
        const cur = sums.get(ccy) ?? { sum: 0, n: 0 };
        cur.sum += sign * ret;
        cur.n += 1;
        sums.set(ccy, cur);
      }
    }

    for (const ccy of G8_CURRENCIES) {
      const s = sums.get(ccy);
      scores[lb][ccy] = s && s.n > 0 ? s.sum / s.n : 0;
    }
    ranking[lb] = [...G8_CURRENCIES].sort((a, b) => scores[lb][b] - scores[lb][a]);
  }

  return { scores, ranking };
}
