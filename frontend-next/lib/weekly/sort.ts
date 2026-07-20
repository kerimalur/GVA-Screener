import type { WeeklyPairCard } from "@/lib/data/weekly";

/**
 * FAKTISCHE Sortierung der Weekly-Karten — bewusst KEIN Signal.
 *
 * Warum kein Signal-Sort: Der frühere Score (alignedCount*10 + flowGap + inPlay,
 * 5-Faktor-Screener) UND die Q5/Q1-Baseline sind beide out-of-sample widerlegt
 * (Screener-Verdict ~50 %, Alle-4-Kombi 47,4 %, COT-NC schädlich; Q5/Q1 46,9 %
 * @1W / 45,4 % @4W — beide unter Münzwurf). Bis eine Metrik NACHWEISLICH >50 %
 * liefert, wird die Seite nach reinen Fakten sortiert: „wo passiert diese Woche
 * etwas". Keine dieser Sortierungen impliziert eine Handelsrichtung.
 */

export type WeeklySortMode = "events" | "alpha" | "flow";

export const WEEKLY_SORT_MODES: { key: WeeklySortMode; label: string; hint: string }[] = [
  { key: "events", label: "Ereignisse", hint: "High-Impact-Events + CB-Sitzungen dieser Woche" },
  { key: "alpha", label: "Alphabetisch", hint: "Pair-Name A→Z" },
  { key: "flow", label: "|4W-COT-Flow|", hint: "Betrag der Smart-Money-Rotation (Base−Quote)" },
];

/** Anzahl faktischer Wochen-Termine (High-Impact-Events + CB-Sitzungen). */
export function eventCount(c: WeeklyPairCard): number {
  return c.events.length + c.meetings.length;
}

/** |4W-COT-Flow-Differenz Base−Quote| in % OI; fehlende Seite → 0. */
export function absFlowGap(c: WeeklyPairCard): number {
  const b = c.baseFlow?.delta4wPctOi;
  const q = c.quoteFlow?.delta4wPctOi;
  if (b == null || q == null) return 0;
  return Math.abs(b - q);
}

/** Deterministische, rein faktische Sortierung (stabiler Tie-Break: Pair-Name). */
export function sortCards(cards: WeeklyPairCard[], mode: WeeklySortMode): WeeklyPairCard[] {
  const byName = (a: WeeklyPairCard, b: WeeklyPairCard) => a.displayName.localeCompare(b.displayName);
  const copy = [...cards];
  if (mode === "alpha") return copy.sort(byName);
  if (mode === "flow") {
    return copy.sort((a, b) => absFlowGap(b) - absFlowGap(a) || byName(a, b));
  }
  return copy.sort((a, b) => eventCount(b) - eventCount(a) || byName(a, b));
}
