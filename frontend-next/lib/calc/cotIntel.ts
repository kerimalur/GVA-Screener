/**
 * COT Intelligence — institutionelle Positionierungs-Analyse.
 * Gewichtete Bias-Berechnung über alle Trader-Gruppen des CFTC-Reports.
 * Rein deterministisch, keine externen Aufrufe.
 */

export type GroupKey = "dealer" | "assetMgr" | "levFunds" | "commercials" | "retail";

export interface SignalGroupDef {
  key: GroupKey;
  label: string;
  weight: number;
  /** Hedger/Retail werden konträr gewichtet (negatives Vorzeichen im Composite). */
  contrarian: boolean;
}

export const SIGNAL_GROUPS: SignalGroupDef[] = [
  { key: "dealer", label: "Dealer", weight: 0.4, contrarian: false },
  { key: "assetMgr", label: "Asset Mgr", weight: 0.25, contrarian: false },
  { key: "levFunds", label: "Lev Funds", weight: 0.2, contrarian: false },
  { key: "commercials", label: "Commercials", weight: 0.1, contrarian: true },
  { key: "retail", label: "Retail", weight: 0.05, contrarian: true },
];

export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface GroupStat {
  key: GroupKey;
  label: string;
  net: number | null;
  /** COT-Index = Rolling-Perzentil 0..100 der Nettoposition */
  index: number | null;
  /** normierter Score −100..+100 = (Index−50)·2 */
  score: number | null;
}

export interface CurrencySignal {
  ccy: string;
  score: number; // gewichteter Composite −100..+100
  bias: Bias;
  confidence: number; // |score| in %
  groups: GroupStat[];
  latestDate: string | null;
}

/** Perzentil (0..100) → Score −100..+100. */
export function scoreFromIndex(index: number | null): number | null {
  return index === null ? null : (index - 50) * 2;
}

export function biasOf(score: number): Bias {
  return score > 15 ? "BULLISH" : score < -15 ? "BEARISH" : "NEUTRAL";
}

/**
 * Gewichteter Composite aus den Gruppen-Indizes (Perzentilen).
 * Fehlende Gruppe → wird übersprungen (kein Beitrag), Gewichte nicht renormiert.
 */
export function buildSignal(
  ccy: string,
  indices: Record<GroupKey, number | null>,
  nets: Record<GroupKey, number | null>,
  latestDate: string | null,
): CurrencySignal {
  const groups: GroupStat[] = SIGNAL_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    net: nets[g.key],
    index: indices[g.key],
    score: scoreFromIndex(indices[g.key]),
  }));

  let composite = 0;
  for (const g of SIGNAL_GROUPS) {
    const sc = scoreFromIndex(indices[g.key]);
    if (sc === null) continue;
    composite += (g.contrarian ? -1 : 1) * g.weight * sc;
  }
  const score = Math.round(Math.max(-100, Math.min(100, composite)));

  return {
    ccy,
    score,
    bias: biasOf(score),
    confidence: Math.min(100, Math.abs(score)),
    groups,
    latestDate,
  };
}

/** Klartext für einen COT-Index (0..100) einer Gruppe. */
export function indexText(label: string, index: number | null): string {
  if (index === null) return `${label}: keine Daten`;
  const lvl =
    index >= 90
      ? "extrem Long"
      : index >= 70
        ? "deutlich Long"
        : index <= 10
          ? "extrem Short"
          : index <= 30
            ? "deutlich Short"
            : "neutral";
  return `${label}: COT-Index ${index.toFixed(0)} (${lvl})`;
}
