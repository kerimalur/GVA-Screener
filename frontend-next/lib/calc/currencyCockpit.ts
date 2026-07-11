import type { CurrencyBias } from "./currencyBias";
import type { SeasonalityResult } from "./seasonality";
import { MONTH_LABELS } from "./seasonality";
import { pairsForCurrency, fromOanda, type G8Currency } from "@/lib/constants/instruments";

/**
 * Währungs-Cockpit: reichert den 4-Faktoren-Bias (currencyBias.ts) je Währung
 * um drei ANZEIGE-Dimensionen an — Retail-Aggregat, Saisonalität der Pairs
 * dieser Woche/Monats, anstehende High-Impact-News. Diese drei fließen NICHT
 * in die Bias-Richtung ein (die bleibt das 4-Faktoren-Modell), sondern geben
 * pro Währung schnell lesbaren Kontext.
 */

export interface CockpitNews {
  title: string;
  date: string;
  drift: boolean;
}

export interface CurrencyCockpitRow extends CurrencyBias {
  /** Ø Retail-Long-% der Währung über ihre 7 Pairs (base long% / quote invertiert) */
  retailLongPct: number | null;
  /** konträre Richtung aus dem Retail-Aggregat: überfüllte Long-Seite → SHORT */
  retailDir: -1 | 0 | 1;
  /** Pairs, die diesen Monat historisch FÜR die Währung sprechen (ccy-relativ long) */
  seasonLong: string[];
  /** Pairs, die diesen Monat historisch GEGEN die Währung sprechen */
  seasonShort: string[];
  monthLabel: string;
  /** anstehende High-Impact-Events der Währung (nächste 7 Tage) */
  news: CockpitNews[];
}

export interface CockpitInputs {
  /** Retail Long-% je Pair in Myfxbook-Notation (EURUSD) */
  sentimentByPair: Map<string, number>;
  seasonalityByInstrument: Map<string, SeasonalityResult>;
  /** High-Impact-Events der nächsten 7 Tage, bereits gefiltert */
  newsByCcy: Map<string, CockpitNews[]>;
  currentMonth: number; // 1–12
}

function retailAggregate(
  ccy: G8Currency,
  sentimentByPair: Map<string, number>,
): { avg: number | null; dir: -1 | 0 | 1 } {
  const vals: number[] = [];
  for (const inst of pairsForCurrency(ccy)) {
    const longPct = sentimentByPair.get(fromOanda(inst.instrument));
    if (longPct === undefined) continue;
    // Retail-Long-% aus Sicht der Währung: als Quote invertieren
    vals.push(inst.baseCcy === ccy ? longPct : 100 - longPct);
  }
  if (vals.length === 0) return { avg: null, dir: 0 };
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  // Aggregat ist glatter als ein Einzelpair → engere Schwelle als 65/35
  const dir: -1 | 0 | 1 = avg >= 60 ? -1 : avg <= 40 ? 1 : 0;
  return { avg, dir };
}

function seasonalPairs(
  ccy: G8Currency,
  seasonalityByInstrument: Map<string, SeasonalityResult>,
  month: number,
): { long: string[]; short: string[] } {
  const long: string[] = [];
  const short: string[] = [];
  for (const inst of pairsForCurrency(ccy)) {
    const stat = seasonalityByInstrument.get(inst.instrument)?.months.find((m) => m.month === month);
    if (!stat || stat.years < 8) continue;
    let pairDir: -1 | 0 | 1 = 0;
    if (stat.avgReturn >= 0.3 && stat.hitRate >= 60) pairDir = 1;
    else if (stat.avgReturn <= -0.3 && stat.hitRate <= 40) pairDir = -1;
    if (pairDir === 0) continue;
    // Pair-Richtung auf die Währung umrechnen (als Quote invertieren)
    const ccyDir = inst.baseCcy === ccy ? pairDir : (-pairDir as -1 | 1);
    (ccyDir === 1 ? long : short).push(inst.displayName);
  }
  return { long, short };
}

export function buildCockpit(
  biases: CurrencyBias[],
  inputs: CockpitInputs,
): CurrencyCockpitRow[] {
  return biases.map((b) => {
    const ccy = b.ccy as G8Currency;
    const retail = retailAggregate(ccy, inputs.sentimentByPair);
    const season = seasonalPairs(ccy, inputs.seasonalityByInstrument, inputs.currentMonth);
    return {
      ...b,
      retailLongPct: retail.avg,
      retailDir: retail.dir,
      seasonLong: season.long,
      seasonShort: season.short,
      monthLabel: MONTH_LABELS[inputs.currentMonth - 1],
      news: inputs.newsByCcy.get(ccy) ?? [],
    };
  });
}
