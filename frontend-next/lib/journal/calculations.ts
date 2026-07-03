/**
 * Trade-Berechnungen — Port aus shared/utils/calculations.ts des Journals.
 */

import type { Trade } from "./types";

export function calculateProfitAmount(
  rMultiple: number,
  riskAmount: number,
  result: "win" | "loss" | "breakeven",
): number {
  if (result === "breakeven") return 0;
  const adjustedR = result === "loss" ? -Math.abs(rMultiple) : Math.abs(rMultiple);
  return Math.round(riskAmount * adjustedR * 100) / 100;
}

export function calculateRiskAmount(accountBalance: number, riskPercent: number): number {
  return Math.round(((accountBalance * riskPercent) / 100) * 100) / 100;
}

/**
 * Geplantes R:R aus Entry / Stop-Loss / Take-Profit. Liefert null,
 * wenn die Level nicht plausibel zur Richtung passen.
 */
export function calcRMultipleFromLevels(
  entry?: number,
  stopLoss?: number,
  takeProfit?: number,
  direction: "long" | "short" = "long",
): number | null {
  if (entry == null || stopLoss == null || takeProfit == null) return null;
  const riskDist = Math.abs(entry - stopLoss);
  const rewardDist = Math.abs(takeProfit - entry);
  if (riskDist === 0) return null;
  const valid =
    direction === "long"
      ? takeProfit > entry && stopLoss < entry
      : takeProfit < entry && stopLoss > entry;
  if (!valid) return null;
  return Math.round((rewardDist / riskDist) * 100) / 100;
}

/**
 * Rechnet die Kontostand-Historie ALLER Trades chronologisch neu durch.
 * `startBalance` = Kontostand vor dem ersten Trade
 * (Start-Kapital + Netto-Ein-/Auszahlungen).
 */
export function recomputeBalances(
  trades: Trade[],
  startBalance: number,
): { trades: Trade[]; finalBalance: number } {
  const sorted = [...trades].sort((a, b) => {
    const d = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (d !== 0) return d;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });

  let bal = startBalance;
  const out = sorted.map((t) => {
    const profit =
      t.profitAmount ?? calculateProfitAmount(t.rMultiple || 0, t.riskAmount || 0, t.result);
    const before = Math.round(bal * 100) / 100;
    const after = Math.round((bal + profit) * 100) / 100;
    bal = after;
    return { ...t, accountBalanceBefore: before, accountBalanceAfter: after, runningBalance: after };
  });

  return { trades: out, finalBalance: Math.round(bal * 100) / 100 };
}
