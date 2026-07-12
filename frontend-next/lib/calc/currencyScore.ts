import type { CotFlowSummary } from "./cotDelta";
import type { MonthlyStat } from "./seasonality";

/**
 * Kanonischer Währungs-Bias — die EINE Bias-Wahrheit der App.
 * 4 Sub-Scores (COT · Zinsen · Saisonalität · Retail), je −1…+1.
 * Total = Mittelwert der verfügbaren Sub-Scores; fehlende Datenquellen
 * werden ausgelassen statt mit 0 verwässert.
 * Richtung: LONG ≥ +0.15 · SHORT ≤ −0.15 · sonst NEUTRAL.
 *
 * Die Schwellen entsprechen den bisherigen Richtungs-Schwellen
 * (COT ±2 % OI, Retail 60/40, Saison ±0.3 % bei ≥8 Jahren, CB-Stance ±2),
 * nur auf eine gemeinsame −1…+1-Skala normiert — keine neue Datenlogik.
 */

export type SubScoreKey = "cot" | "zinsen" | "saison" | "retail";

export type BiasDirection = "LONG" | "SHORT" | "NEUTRAL";

export type CbStanceLabel = "HAWKISH" | "DOVISH" | "NEUTRAL";

export interface SubScore {
  key: SubScoreKey;
  label: string;
  /** −1…+1, null = Datenquelle fehlt (fließt nicht in Total ein) */
  score: number | null;
  /** Richtungs-Indikator für die kompakte Anzeige */
  dir: -1 | 0 | 1;
  /** Ein-Satz-Begründung */
  text: string;
}

export interface CurrencyScore {
  ccy: string;
  /** Mittelwert der verfügbaren Sub-Scores, null wenn gar keine Daten */
  total: number | null;
  direction: BiasDirection;
  subs: SubScore[];
}

export interface CurrencyScoreInputs {
  /** COT-Flow (TFF Leveraged Funds, Fallback Legacy Non-Commercials) */
  flow: CotFlowSummary | null;
  /** kombinierter CB-Stance-Score −10…+10 (cbStance.combineStance) */
  stanceScore: number | null;
  policyRate: number | null;
  /** Ø-Leitzins der anderen 7 G8-Währungen */
  avgOtherRates: number | null;
  /** Ø ccy-relativer Monats-Return des aktuellen Monats (nur Pairs mit ≥8 Jahren) */
  seasonAvgReturn: number | null;
  /** Ø Retail-Long-% aus Sicht der Währung über ihre 7 Pairs */
  retailAvgLongPct: number | null;
}

function clamp(v: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

function dirOf(score: number | null): -1 | 0 | 1 {
  if (score === null) return 0;
  return score >= 0.15 ? 1 : score <= -0.15 ? -1 : 0;
}

function fmtSigned(v: number, digits = 2): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

/** CB-Haltung aus dem Stance-Score (gleiche ±2-Schwelle wie bisher). */
export function stanceLabel(score: number): CbStanceLabel {
  return score >= 2 ? "HAWKISH" : score <= -2 ? "DOVISH" : "NEUTRAL";
}

function cotSub(flow: CotFlowSummary | null): SubScore {
  if (flow?.delta4wPctOi == null) {
    return { key: "cot", label: "COT", score: null, dir: 0, text: "Keine COT-Flow-Daten." };
  }
  const score = clamp(flow.delta4wPctOi / 5);
  const streak =
    flow.streakWeeks >= 3 && flow.direction !== 0
      ? ` Flow seit ${flow.streakWeeks} Wochen ${flow.direction > 0 ? "positiv (Akkumulation)" : "negativ (Distribution)"}.`
      : "";
  return {
    key: "cot",
    label: "COT",
    score,
    dir: dirOf(score),
    text: `Smart-Money-Flow 4W: ${fmtSigned(flow.delta4wPctOi, 1)} % OI.${streak}`,
  };
}

function zinsenSub(
  stanceScore: number | null,
  policyRate: number | null,
  avgOtherRates: number | null,
): SubScore {
  const parts: number[] = [];
  const texts: string[] = [];
  if (stanceScore !== null) {
    parts.push(stanceScore / 10);
    texts.push(`CB-Haltung ${stanceLabel(stanceScore)} (${fmtSigned(stanceScore, 1)}/±10)`);
  }
  if (policyRate !== null && avgOtherRates !== null) {
    const diff = policyRate - avgOtherRates;
    parts.push(clamp(diff / 2));
    texts.push(`Leitzins ${policyRate.toFixed(2)} % vs. G8-Ø ${avgOtherRates.toFixed(2)} % (${fmtSigned(diff)} pp)`);
  }
  if (parts.length === 0) {
    return { key: "zinsen", label: "Zinsen", score: null, dir: 0, text: "Keine Zins-Daten." };
  }
  const score = clamp(parts.reduce((a, b) => a + b, 0) / parts.length);
  return { key: "zinsen", label: "Zinsen", score, dir: dirOf(score), text: `${texts.join(" · ")}.` };
}

function saisonSub(seasonAvgReturn: number | null, monthLabel: string): SubScore {
  if (seasonAvgReturn === null) {
    return {
      key: "saison",
      label: "Saisonalität",
      score: null,
      dir: 0,
      text: "Keine konsistenten Saisonmuster (≥8 Jahre) verfügbar.",
    };
  }
  const score = clamp(seasonAvgReturn / 0.5);
  return {
    key: "saison",
    label: "Saisonalität",
    score,
    dir: dirOf(score),
    text: `${monthLabel} historisch Ø ${fmtSigned(seasonAvgReturn)} % für die Währung (Pairs mit ≥8 Jahren Basis).`,
  };
}

function retailSub(avgLongPct: number | null): SubScore {
  if (avgLongPct === null) {
    return { key: "retail", label: "Retail", score: null, dir: 0, text: "Keine Sentiment-Daten." };
  }
  const score = clamp((50 - avgLongPct) / 20);
  return {
    key: "retail",
    label: "Retail",
    score,
    dir: dirOf(score),
    text: `Retail ist Ø ${avgLongPct.toFixed(0)} % long in der Währung — konträr ${
      score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral"
    }.`,
  };
}

export function computeCurrencyScore(
  ccy: string,
  inputs: CurrencyScoreInputs,
  monthLabel: string,
): CurrencyScore {
  const subs: SubScore[] = [
    cotSub(inputs.flow),
    zinsenSub(inputs.stanceScore, inputs.policyRate, inputs.avgOtherRates),
    saisonSub(inputs.seasonAvgReturn, monthLabel),
    retailSub(inputs.retailAvgLongPct),
  ];

  const available = subs.filter((s) => s.score !== null) as Array<SubScore & { score: number }>;
  const total =
    available.length > 0
      ? available.reduce((sum, s) => sum + s.score, 0) / available.length
      : null;
  const direction: BiasDirection =
    total === null ? "NEUTRAL" : total >= 0.15 ? "LONG" : total <= -0.15 ? "SHORT" : "NEUTRAL";

  return { ccy, total, direction, subs };
}

// ── COT-Divergenz: Niveau-Extrem gegen Flow-Richtung ────────────────────────
export interface CotDivergence {
  dir: -1 | 1;
  text: string;
}

export function cotDivergence(
  percentile: number | null,
  flow: CotFlowSummary | null,
): CotDivergence | null {
  if (percentile === null || flow?.delta4wPctOi == null) return null;
  if (percentile >= 80 && flow.delta4wPctOi < 0) {
    return {
      dir: -1,
      text: `Divergenz: Positionierung im ${percentile.toFixed(0)}. Perzentil (Extrem-Long), aber 4W-Flow negativ — Distribution im Extrem (bearish).`,
    };
  }
  if (percentile <= 20 && flow.delta4wPctOi > 0) {
    return {
      dir: 1,
      text: `Divergenz: Positionierung im ${percentile.toFixed(0)}. Perzentil (Extrem-Short), aber 4W-Flow positiv — Akkumulation im Extrem (bullish).`,
    };
  }
  return null;
}

// ── Saisonalität: Pair-Statistiken auf die Währung aggregieren ──────────────
export interface CcySeasonPairInput {
  /** true = Währung ist Base des Pairs; false = Quote (Vorzeichen invertieren) */
  baseIsCcy: boolean;
  displayName: string;
  months: MonthlyStat[];
}

export interface CcySeasonResult {
  /** 12 ccy-relative Monate (Ø über qualifizierte Pairs) */
  months: MonthlyStat[];
  /** Ø ccy-relativer Return des aktuellen Monats (null = kein qualifiziertes Pair) */
  currentAvgReturn: number | null;
  /** Pairs, die im aktuellen Monat historisch FÜR die Währung sprechen */
  longPairs: string[];
  /** Pairs, die historisch GEGEN die Währung sprechen */
  shortPairs: string[];
}

/**
 * Aggregiert die Monats-Statistiken der 7 Pairs einer Währung auf die
 * Währung selbst (Quote-Pairs invertiert). Nur Pairs mit ≥8 Jahren Basis
 * zählen (konsistente Muster). Long/Short-Listen nutzen die bisherigen
 * Schwellen (|Ø-Return| ≥ 0.3 % und Trefferquote ≥60 % bzw. ≤40 %).
 */
export function aggregateCcySeason(
  pairs: CcySeasonPairInput[],
  currentMonth: number,
): CcySeasonResult {
  const months: MonthlyStat[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    avgReturn: 0,
    hitRate: 0,
    years: 0,
  }));
  const counts = new Array<number>(12).fill(0);

  const longPairs: string[] = [];
  const shortPairs: string[] = [];

  for (const p of pairs) {
    for (const m of p.months) {
      if (m.years < 8) continue;
      const avg = p.baseIsCcy ? m.avgReturn : -m.avgReturn;
      const hit = p.baseIsCcy ? m.hitRate : 100 - m.hitRate;
      const idx = m.month - 1;
      months[idx].avgReturn += avg;
      months[idx].hitRate += hit;
      months[idx].years = counts[idx] === 0 ? m.years : Math.min(months[idx].years, m.years);
      counts[idx] += 1;

      if (m.month === currentMonth) {
        if (avg >= 0.3 && hit >= 60) longPairs.push(p.displayName);
        else if (avg <= -0.3 && hit <= 40) shortPairs.push(p.displayName);
      }
    }
  }

  for (let i = 0; i < 12; i++) {
    if (counts[i] === 0) continue;
    months[i].avgReturn /= counts[i];
    months[i].hitRate /= counts[i];
  }

  const cur = counts[currentMonth - 1] > 0 ? months[currentMonth - 1].avgReturn : null;
  return { months, currentAvgReturn: cur, longPairs, shortPairs };
}

// ── Retail: Pair-Sentiment auf die Währung aggregieren ──────────────────────
/**
 * Ø Retail-Long-% aus Sicht der Währung: Long-% der Base-Pairs direkt,
 * Quote-Pairs invertiert (100 − long%). null wenn kein Pair Daten hat.
 */
export function aggregateCcyRetail(
  pairs: Array<{ baseIsCcy: boolean; longPct: number }>,
): number | null {
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((s, p) => s + (p.baseIsCcy ? p.longPct : 100 - p.longPct), 0);
  return sum / pairs.length;
}

export const SUBSCORE_ORDER: Array<{ key: SubScoreKey; short: string }> = [
  { key: "cot", short: "C" },
  { key: "zinsen", short: "Z" },
  { key: "saison", short: "S" },
  { key: "retail", short: "R" },
];
