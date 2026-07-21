/**
 * Trade-Budget: acht Kästchen pro Monat, blockweise freigeschaltet.
 * Spec: docs/superpowers/specs/2026-07-21-trade-budget-design.md
 *
 * Reine Berechnung ohne I/O — dasselbe Muster wie lib/cockpit/board.ts, damit
 * die Wochen- und Übertragsregel ohne Browser durchgerechnet werden kann.
 *
 * Das Budget ist eine Konstante, keine Einstellung. Es ist eine Zusage an sich
 * selbst und soll nicht in dem Moment verhandelbar sein, in dem sie drückt.
 */

import type { Trade } from "./types";

/** Fest. Bewusst nicht konfigurierbar. */
export const TRADE_BUDGET_PER_MONTH = 8;

/** Vier feste 7-Tage-Blöcke ab dem 1. des Monats. */
export const BUDGET_BLOCKS = 4;

export type BoxState =
  /** verbraucht */
  | "used"
  /** freigeschaltet und noch frei */
  | "open"
  /** dieser Block ist noch nicht erreicht */
  | "locked"
  /** jenseits des Monatsbudgets */
  | "overrun";

export interface BudgetState {
  total: number;
  unlocked: number;
  used: number;
  /** freigeschaltet und noch nicht verbraucht */
  offen: number;
  /** Trades über dem Monatsbudget */
  overrun: number;
  /** Länge = total + overrun */
  boxes: BoxState[];
  block: number;
}

/**
 * Block 1..4 nach Tag im Monat: 1–7, 8–14, 15–21, ab 22.
 *
 * Bewusst feste 7-Tage-Blöcke und keine Kalenderwochen: ein Monat berührt 5–6
 * Kalenderwochen, feste Blöcke ergeben immer exakt vier. Block 4 ist dadurch
 * 7–10 Tage lang.
 */
export function weekBlockOf(datum: Date): number {
  const tag = datum.getDate();
  return Math.min(BUDGET_BLOCKS, Math.floor((tag - 1) / 7) + 1);
}

/** Kumulativ: je Block kommen `total / 4` Kästchen dazu, gedeckelt auf `total`. */
export function unlockedBoxes(datum: Date, total: number = TRADE_BUDGET_PER_MONTH): number {
  const proBlock = Math.ceil(total / BUDGET_BLOCKS);
  return Math.min(total, proBlock * weekBlockOf(datum));
}

/**
 * Live-Trades im Kalendermonat von `datum` — kontenübergreifend.
 *
 * Das Budget begrenzt eine Trade-Entscheidung, kein Konto: dasselbe Setup auf
 * Funded und Eigenkapital sind zwei Entscheidungen. Backtest-Zeilen zählen nie.
 */
export function usedThisMonth(trades: Trade[], datum: Date): number {
  const praefix = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}`;
  return trades.filter(
    (t) => t.sessionType === "live" && typeof t.date === "string" && t.date.startsWith(praefix),
  ).length;
}

/**
 * Vollständiger Zustand für die Anzeige.
 *
 * Der Übertrag braucht keine eigene Regel: verbraucht wird von links,
 * freigeschaltet wird nach Block — ungenutzte Kästchen bleiben dadurch von
 * selbst offen.
 */
export function budgetState(
  trades: Trade[],
  datum: Date = new Date(),
  total: number = TRADE_BUDGET_PER_MONTH,
): BudgetState {
  const unlocked = unlockedBoxes(datum, total);
  const used = usedThisMonth(trades, datum);
  const overrun = Math.max(0, used - total);

  const boxes: BoxState[] = [];
  for (let i = 0; i < total; i++) {
    boxes.push(i < used ? "used" : i < unlocked ? "open" : "locked");
  }
  for (let i = 0; i < overrun; i++) boxes.push("overrun");

  return {
    total,
    unlocked,
    used,
    offen: Math.max(0, unlocked - used),
    overrun,
    boxes,
    block: weekBlockOf(datum),
  };
}

/** Beschriftung der vier Blöcke unter den Kästchenpaaren. */
export const BLOCK_LABELS = ["1.–7.", "8.–14.", "15.–21.", "ab 22."] as const;
