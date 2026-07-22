/**
 * Wochenrückblick — reine Aggregation ohne I/O, Muster wie lib/journal/budget.ts.
 * Eine abgeschlossene (oder laufende) Woche: Ergebnis in R, Winrate, Adherence-
 * Quote, Budget-Verbrauch und die Trades der Woche. Vergangene Wochen wählbar.
 *
 * Nur Live-Trades zählen (Backtest nie), konsistent mit dem restlichen Journal.
 * Winrate = wins/(wins+losses); Breakeven zählt nicht mit. `null` = keine
 * entschiedenen bzw. keine bewerteten Trades — nicht 0 %.
 */

import type { Trade } from "./types";

export interface WeekReview {
  /** Montag der Woche, "YYYY-MM-DD". */
  weekStart: string;
  /** Sonntag der Woche, "YYYY-MM-DD". */
  weekEnd: string;
  trades: Trade[];
  totalR: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** wins/(wins+losses)*100; null wenn keine entschiedenen Trades. */
  winRate: number | null;
  /** Ø adherenceScore der bewerteten Trades; null wenn keiner bewertet. */
  adherenceAvg: number | null;
  /** Wie viele Trades der Woche eine Adherence-Bewertung tragen. */
  adherenceCount: number;
  /** Live-Trades der Woche = Budget-Verbrauch (kontenübergreifend). */
  budgetUsed: number;
}

function toMonday(d: Date): Date {
  const dow = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Montag der Kalenderwoche eines "YYYY-MM-DD"-Datums. */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return iso(toMonday(new Date(y || 1970, (m || 1) - 1, d || 1)));
}

/** Alle Wochen (Montage) mit ≥ 1 Live-Trade, jüngste zuerst. */
export function availableWeeks(trades: Trade[]): string[] {
  const set = new Set<string>();
  for (const t of trades) {
    if (t.sessionType === "live" && typeof t.date === "string" && t.date) set.add(mondayOf(t.date));
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function weekReview(trades: Trade[], weekStartMonday: string): WeekReview {
  const [y, m, d] = weekStartMonday.split("-").map(Number);
  const monday = new Date(y || 1970, (m || 1) - 1, d || 1);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const weekStart = iso(monday);
  const weekEnd = iso(sunday);

  const wt = trades.filter(
    (t) => t.sessionType === "live" && typeof t.date === "string" && t.date >= weekStart && t.date <= weekEnd,
  );

  const wins = wt.filter((t) => t.result === "win").length;
  const losses = wt.filter((t) => t.result === "loss").length;
  const breakevens = wt.filter((t) => t.result === "breakeven").length;
  const decided = wins + losses;

  const rated = wt.filter((t) => t.adherenceScore != null);
  const adherenceAvg =
    rated.length > 0 ? rated.reduce((s, t) => s + (t.adherenceScore ?? 0), 0) / rated.length : null;

  return {
    weekStart,
    weekEnd,
    trades: wt,
    totalR: wt.reduce((s, t) => s + t.rMultiple, 0),
    wins,
    losses,
    breakevens,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    adherenceAvg,
    adherenceCount: rated.length,
    budgetUsed: wt.length,
  };
}
