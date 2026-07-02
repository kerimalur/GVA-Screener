import { percentileRank } from "./percentile";
import { sma } from "./seriesMath";

export interface RiskSubIndicator {
  name: string;
  score: number; // 0 (Risk-Off) … 100 (Risk-On)
  detail: string;
  spark: number[];
}

export interface RiskGaugeResult {
  composite: number; // 0–100
  regime: "Risk-On" | "Neutral" | "Risk-Off";
  indicators: RiskSubIndicator[];
}

/** Trend-Score aus 1M-Return: ±3% -> 0/100, linear dazwischen. */
function trendScore(ret1M: number, invert = false): number {
  const t = Math.max(-3, Math.min(3, ret1M));
  const score = ((t + 3) / 6) * 100;
  return invert ? 100 - score : score;
}

/**
 * Risk-On/Risk-Off-Composite:
 *  30% VIX (5J-Perzentil, invertiert), 20% Gold-1M-Trend (invertiert),
 *  25% JPY/CHF-Stärke (invertiert), 25% SPX vs. 50d-MA.
 */
export function riskGauge(inputs: {
  vix: number[];               // Tageswerte, chronologisch (bis ~5J)
  goldCloses: number[];        // Tagesschluss XAU_USD
  jpyStrength1M: number;       // Ø-Return % (aus currencyStrength)
  chfStrength1M: number;
  spxCloses: number[];         // Tagesschluss SPX500_USD
}): RiskGaugeResult {
  const indicators: RiskSubIndicator[] = [];

  // VIX: hohes Perzentil = Angst = Risk-Off
  const vixNow = inputs.vix[inputs.vix.length - 1] ?? 20;
  const vixPct = percentileRank(vixNow, inputs.vix);
  indicators.push({
    name: "VIX",
    score: 100 - vixPct,
    detail: `VIX ${vixNow.toFixed(1)} · ${vixPct.toFixed(0)}. Perzentil (5J)`,
    spark: inputs.vix.slice(-30),
  });

  // Gold: steigend = defensiv = Risk-Off
  const g = inputs.goldCloses;
  const goldRet = g.length > 21 ? (g[g.length - 1] / g[g.length - 22] - 1) * 100 : 0;
  indicators.push({
    name: "Gold-Trend",
    score: trendScore(goldRet, true),
    detail: `Gold 1M: ${goldRet > 0 ? "+" : ""}${goldRet.toFixed(1)} %`,
    spark: g.slice(-30),
  });

  // Safe-Haven-Flows: starke JPY/CHF = Risk-Off
  const haven = (inputs.jpyStrength1M + inputs.chfStrength1M) / 2;
  indicators.push({
    name: "JPY/CHF-Flows",
    score: trendScore(haven, true),
    detail: `Safe-Haven-Stärke 1M: ${haven > 0 ? "+" : ""}${haven.toFixed(2)} %`,
    spark: [],
  });

  // SPX über 50d-MA = Risk-On
  const s = inputs.spxCloses;
  const ma50 = sma(s, 50);
  const spxNow = s[s.length - 1];
  const maNow = ma50[ma50.length - 1];
  const spxDev = maNow ? ((spxNow / maNow - 1) * 100) : 0;
  indicators.push({
    name: "S&P 500-Trend",
    score: trendScore(spxDev * 1.5),
    detail: `SPX ${spxDev >= 0 ? "über" : "unter"} 50d-MA (${spxDev > 0 ? "+" : ""}${spxDev.toFixed(1)} %)`,
    spark: s.slice(-30),
  });

  const weights = [0.3, 0.2, 0.25, 0.25];
  const composite = indicators.reduce((sum, ind, i) => sum + ind.score * weights[i], 0);

  return {
    composite,
    regime: composite >= 60 ? "Risk-On" : composite <= 40 ? "Risk-Off" : "Neutral",
    indicators,
  };
}
