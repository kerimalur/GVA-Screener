import type { SeriesPoint } from "./seriesMath";
import type { CotFlowSummary } from "./cotDelta";
import type { StanceResult } from "./cbStance";
import type { Lookback, StrengthResult } from "./strength";

export interface CurrencyFactor {
  name: string;
  dir: -1 | 0 | 1; // -1 Short, +1 Long (bezogen auf die Währung)
  text: string;
}

export interface CurrencyBias {
  ccy: string;
  direction: "LONG" | "SHORT" | null; // null = NEUTRAL
  alignedCount: number;
  factorCount: number;
  factors: CurrencyFactor[];
  /** COT-Niveau-Perzentil — nur Kontext/Extremwarnung, kein Richtungsfaktor */
  percentile: number | null;
  strength: Record<Lookback, number>;
}

export interface CurrencyBiasInputs {
  cotFlowByCcy: Map<string, CotFlowSummary>;
  cotPercentileByCcy: Map<string, number>;
  policyByCcy: Map<string, SeriesPoint[]>;
  stanceByCcy: Map<string, StanceResult>;
  strength: StrengthResult;
}

function latestValue(series: SeriesPoint[] | undefined): number | null {
  return series && series.length > 0 ? series[series.length - 1].value : null;
}

function valueMonthsAgo(series: SeriesPoint[] | undefined, months: number): number | null {
  if (!series || series.length === 0) return null;
  const cutoff = new Date(series[series.length - 1].date);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return [...series].reverse().find((p) => p.date <= cutoffStr)?.value ?? null;
}

/**
 * Long/Short-Bias einer einzelnen Währung aus 4 Faktoren:
 * COT-Flow 4W (% OI), Leitzins-Trend 6M, CB-Stance (nur manueller Score —
 * die Raten-Trajektorie steckt bereits im Leitzins-Faktor, sonst Doppelzählung),
 * Stärke 1M. Wie beim Pair-Screener: ≥2 gleichgerichtete Faktoren + Mehrheit → Richtung.
 * Fehlende Datenquellen lassen den jeweiligen Faktor weg.
 */
export function evaluateCurrency(ccy: string, inputs: CurrencyBiasInputs): CurrencyBias {
  const factors: CurrencyFactor[] = [];

  // 1) COT-Flow 4W (% OI)
  const flow = inputs.cotFlowByCcy.get(ccy);
  if (flow?.delta4wPctOi != null) {
    const v = flow.delta4wPctOi;
    const dir: -1 | 0 | 1 = v >= 2 ? 1 : v <= -2 ? -1 : 0;
    const streak =
      flow.streakWeeks >= 3 && flow.direction !== 0
        ? ` Flow seit ${flow.streakWeeks} Wochen ${flow.direction > 0 ? "positiv (Akkumulation)" : "negativ (Distribution)"}.`
        : "";
    factors.push({
      name: "COT-Flow 4W",
      dir,
      text: `Smart-Money-Flow ${v > 0 ? "+" : ""}${v.toFixed(1)} % OI in 4 Wochen — ${
        dir === 1 ? "Kapital fließt zu" : dir === -1 ? "Kapital fließt ab" : "kein klarer Trend"
      }.${streak}`,
    });
  }

  // 2) Leitzins-Trend 6M
  const rateNow = latestValue(inputs.policyByCcy.get(ccy));
  const ratePast = valueMonthsAgo(inputs.policyByCcy.get(ccy), 6);
  if (rateNow !== null && ratePast !== null) {
    const delta = rateNow - ratePast;
    const dir: -1 | 0 | 1 = delta >= 0.25 ? 1 : delta <= -0.25 ? -1 : 0;
    const deltaText =
      delta === 0
        ? "unverändert"
        : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)} bps ${delta > 0 ? "gestiegen" : "gefallen"}`;
    factors.push({
      name: "Leitzins-Trend",
      dir,
      text: `Leitzins ${rateNow.toFixed(2)} %, in 6M ${deltaText}.`,
    });
  }

  // 3) CB-Stance — bewusst nur der manuelle Score (−10…+10)
  const stance = inputs.stanceByCcy.get(ccy);
  if (stance) {
    const m = stance.manualScore;
    const dir: -1 | 0 | 1 = m >= 2 ? 1 : m <= -2 ? -1 : 0;
    factors.push({
      name: "CB-Stance",
      dir,
      text: `${stance.bank}: manueller Score ${m > 0 ? "+" : ""}${m.toFixed(0)} von ±10 — ${
        dir === 1 ? "hawkish" : dir === -1 ? "dovish" : "neutral"
      }.`,
    });
  }

  // 4) Stärke 1M
  const s1m = inputs.strength.scores["1M"][ccy] ?? 0;
  {
    const dir: -1 | 0 | 1 = s1m >= 0.4 ? 1 : s1m <= -0.4 ? -1 : 0;
    factors.push({
      name: "Stärke 1M",
      dir,
      text: `Ø signierter Pair-Return 1M: ${s1m > 0 ? "+" : ""}${s1m.toFixed(2)} % — ${
        dir === 1 ? `Momentum pro ${ccy}` : dir === -1 ? `Momentum contra ${ccy}` : "kein klares Momentum"
      }.`,
    });
  }

  const longCount = factors.filter((f) => f.dir === 1).length;
  const shortCount = factors.filter((f) => f.dir === -1).length;
  let direction: "LONG" | "SHORT" | null = null;
  let alignedCount = 0;
  if (longCount >= 2 && longCount > shortCount) {
    direction = "LONG";
    alignedCount = longCount;
  } else if (shortCount >= 2 && shortCount > longCount) {
    direction = "SHORT";
    alignedCount = shortCount;
  }

  return {
    ccy,
    direction,
    alignedCount,
    factorCount: factors.length,
    factors,
    percentile: inputs.cotPercentileByCcy.get(ccy) ?? null,
    strength: {
      "1W": inputs.strength.scores["1W"][ccy] ?? 0,
      "1M": s1m,
      "3M": inputs.strength.scores["3M"][ccy] ?? 0,
    },
  };
}

/** Bias für alle übergebenen Währungen (Reihenfolge bleibt erhalten). */
export function evaluateAllCurrencies(
  ccys: readonly string[],
  inputs: CurrencyBiasInputs,
): CurrencyBias[] {
  return ccys.map((c) => evaluateCurrency(c, inputs));
}
