// Strikte Q5/Q1-Regel für den Pair-Bias aus dem Wochen-Ranking — identisch zu
// derivePairIdeas (lib/ml/ranking.ts) und Backend _pair_bias (replay/fundamentals.py).
// Q2–Q4 gelten als neutral; nur die Extrem-Quintile geben Richtung.
// Client-tauglich (kein "server-only"), da das Dashboard-Widget sie live braucht.

export type PairBias = "long" | "short" | "neutral";

export function pairBias(baseQ: number | undefined, quoteQ: number | undefined): PairBias {
  const b5 = baseQ === 5, b1 = baseQ === 1, q5 = quoteQ === 5, q1 = quoteQ === 1;
  if ((b5 && q5) || (b1 && q1)) return "neutral"; // beide gleich extrem → kein relativer Vorteil
  if (b5 && q1) return "long";
  if (b1 && q5) return "short";
  if (b5 || q1) return "long";
  if (b1 || q5) return "short";
  return "neutral";
}

/** Kurzbegründung, z.B. "CHF Q1" oder "AUD Q5 · JPY Q1" */
export function biasReason(
  base: string,
  quote: string,
  baseQ: number | undefined,
  quoteQ: number | undefined,
): string {
  const parts: string[] = [];
  if (baseQ === 5 || baseQ === 1) parts.push(`${base} Q${baseQ}`);
  if (quoteQ === 5 || quoteQ === 1) parts.push(`${quote} Q${quoteQ}`);
  return parts.join(" · ");
}
