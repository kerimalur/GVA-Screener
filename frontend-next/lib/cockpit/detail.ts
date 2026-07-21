/**
 * Fundamentale Detailebene eines Setups — Typen und reine Helfer.
 *
 * Die Inhalte lagen vorher im `FundamentalModal` des Cockpits. Damit gab es
 * zwei Detailansichten für dasselbe Setup: das Modal und die Outlook-Seite.
 * Sie zeigten Unterschiedliches und niemand wusste, welche die richtige war.
 * Seit dem Umbau ist der Outlook die einzige Detailebene; diese Datei hält die
 * Bausteine, damit dort nichts fehlt, was das Modal konnte.
 */

/** Ranking-Detail je Währung (Champion). */
export interface CcyRanking {
  quintile: number;
  score: number;
  top: { feature: string; value: number }[];
}

export interface CockpitEvent {
  title: string;
  when: string; // ISO
}

/** High-Impact-Termine beider Pair-Währungen, chronologisch. */
export function eventsForPair(
  eventsByCcy: Record<string, CockpitEvent[]>,
  base: string,
  quote: string,
): CockpitEvent[] {
  return [...(eventsByCcy[base] ?? []), ...(eventsByCcy[quote] ?? [])].sort((a, b) =>
    a.when.localeCompare(b.when),
  );
}
