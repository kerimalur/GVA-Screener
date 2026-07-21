/**
 * Seit wann steht eine Ranking-Konstellation je Pair?
 *
 * `ml_weekly_rankings.week_start` ist die ZIELWOCHE der Prognose — der
 * kommende Montag (Backend/ml_engine/run_weekly.py:50). Als Startpunkt eines
 * Kursverlaufs ist der Wert deshalb immer falsch: er liegt in der Zukunft, und
 * die Konstellation steht meist schon Wochen.
 *
 * Richtig ist der Anfang des aktuellen ununterbrochenen Laufs derselben
 * Richtung. Reine Berechnung, ohne I/O.
 */

import type { PairIdea } from "./ranking";

export interface WeekIdeas {
  /** 'YYYY-MM-DD' */
  weekStart: string;
  ideas: PairIdea[];
}

/**
 * Startwoche des aktuellen Laufs je Pair.
 *
 * Gezählt wird von der jüngsten Woche rückwärts, solange das Pair in jeder
 * Woche vorkommt UND dieselbe Richtung trägt. Ein Richtungswechsel oder eine
 * Lücke beendet den Lauf — beides bedeutet, dass die Konstellation neu ist.
 */
export function signalStarts(weeks: WeekIdeas[]): Record<string, string> {
  const sortiert = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (sortiert.length === 0) return {};

  const richtungIn = sortiert.map((w) => {
    const m = new Map<string, "long" | "short">();
    for (const i of w.ideas) m.set(i.pair, i.direction);
    return m;
  });

  const letzte = richtungIn[richtungIn.length - 1];
  const out: Record<string, string> = {};

  for (const [pair, richtung] of letzte) {
    let start = sortiert[sortiert.length - 1].weekStart;
    for (let i = richtungIn.length - 2; i >= 0; i--) {
      if (richtungIn[i].get(pair) !== richtung) break;
      start = sortiert[i].weekStart;
    }
    out[pair] = start;
  }
  return out;
}

/**
 * Startpunkt für den Kursverlauf — oder `null`, wenn es keinen gibt.
 *
 * Ein Lauf, der erst in der Zielwoche beginnt, liegt in der Zukunft: das
 * Signal ist brandneu und hat noch keinen Verlauf. Dann darf die Oberfläche
 * kein Datum behaupten.
 */
export function sinceForPair(
  start: string | undefined,
  heute: Date = new Date(),
): string | null {
  if (!start) return null;
  const heuteIso = heute.toISOString().slice(0, 10);
  return start <= heuteIso ? start : null;
}

/** Volle Wochen zwischen Start und heute (abgerundet). */
export function wochenSeit(start: string, heute: Date = new Date()): number {
  const tage = (heute.getTime() - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.floor(tage / 7));
}
