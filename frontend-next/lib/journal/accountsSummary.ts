/**
 * Konten-Übersicht fürs Journal-Dashboard — reine Ableitung ohne I/O.
 *
 * P&L eines Kontos = aktueller Kontostand − Startkapital. Bewusst aus den
 * Konto-Daten und nicht aus den Trades summiert: bei mehreren Konten desselben
 * Typs trägt die App-Trade-Zeile keine Konto-ID, eine Trade-Summe wäre also
 * nicht eindeutig einem Konto zuzuordnen. Der Kontostand ist die belastbare,
 * bereits abgeglichene Grösse (recomputeBalances im Journal).
 */

import type { AccountConfig, AccountConfigs } from "./types";

export interface AccountSummary {
  pnl: number;
  /** pnl / Startkapital * 100; null wenn kein Startkapital (>0) hinterlegt. */
  pnlPct: number | null;
}

export function accountSummary(a: Pick<AccountConfig, "currentBalance" | "initialStartBalance">): AccountSummary {
  const start = a.initialStartBalance || 0;
  const pnl = (a.currentBalance || 0) - start;
  return { pnl, pnlPct: start > 0 ? (pnl / start) * 100 : null };
}

/**
 * Alle aktiven Konten des Users, EK vor Funded, in Ladereihenfolge. Nutzt die
 * bereits geladenen Listen aus loadAccountConfigs() — kein zusätzlicher Fetch.
 */
export function allAccounts(configs: AccountConfigs | null): AccountConfig[] {
  if (!configs) return [];
  return [...(configs.ekAccounts ?? []), ...(configs.fundedAccounts ?? [])];
}
