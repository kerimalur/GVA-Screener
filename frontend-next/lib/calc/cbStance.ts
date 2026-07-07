import type { SeriesPoint } from "./seriesMath";

export interface StanceResult {
  bank: string;
  ccy: string;
  /** kombiniert −10 (sehr dovish) … +10 (sehr hawkish) */
  score: number;
  manualScore: number;
  trajectoryScore: number;
  rationale: string;
}

/**
 * Hawkish/Dovish-Spektrum: manueller Score (cb_stance, 60%) kombiniert mit
 * berechneter Raten-Trajektorie (Δ Leitzins 6 Monate, 40%).
 * +100bp in 6M ≈ Trajektorie +10 (max hawkish).
 */
export function combineStance(params: {
  bank: string;
  ccy: string;
  manualScore: number;
  manualRationale: string | null;
  policyRate: SeriesPoint[]; // monatlich oder täglich, chronologisch
}): StanceResult {
  const { policyRate } = params;
  let trajectoryScore = 0;
  let trajText = "keine Zinsdaten";

  if (policyRate.length > 0) {
    const last = policyRate[policyRate.length - 1];
    const cutoff = new Date(last.date);
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const past = [...policyRate].reverse().find((p) => p.date <= cutoffStr);
    if (past) {
      const deltaPp = last.value - past.value;
      trajectoryScore = Math.max(-10, Math.min(10, deltaPp * 10));
      trajText =
        deltaPp === 0
          ? "Leitzins 6M unverändert"
          : `Leitzins 6M: ${deltaPp > 0 ? "+" : ""}${(deltaPp * 100).toFixed(0)} bps`;
    }
  }

  const score = Math.max(
    -10,
    Math.min(10, params.manualScore * 0.6 + trajectoryScore * 0.4),
  );

  return {
    bank: params.bank,
    ccy: params.ccy,
    score,
    manualScore: params.manualScore,
    trajectoryScore,
    rationale: `${trajText}${params.manualRationale ? ` · ${params.manualRationale}` : ""}`,
  };
}
