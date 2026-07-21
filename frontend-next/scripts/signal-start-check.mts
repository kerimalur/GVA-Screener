// Kontrollwerte für den Signalstart: npx tsx scripts/signal-start-check.mts
//
// Deckt ab:
//   - Laufanfang je Pair (ununterbrochene Wochen gleicher Richtung)
//   - Richtungswechsel und Lücken brechen den Lauf
//   - die Zielwoche liegt in der Zukunft (run_weekly schreibt den KOMMENDEN
//     Montag) -> ein brandneues Signal hat keinen Startpunkt in der Vergangenheit
import { signalStarts, sinceForPair, wochenSeit } from "../lib/ml/signalStart";
import type { PairIdea } from "../lib/ml/ranking";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

const idee = (pair: string, direction: "long" | "short"): PairIdea =>
  ({ pair, direction, reason: `${pair} ${direction}` });

// Drei Wochen dieselbe Richtung, die jüngste ist die Zielwoche (Zukunft).
const wochen = [
  { weekStart: "2026-07-06", ideas: [idee("AUD/USD", "long"), idee("EUR/GBP", "short")] },
  { weekStart: "2026-07-13", ideas: [idee("AUD/USD", "long")] },
  { weekStart: "2026-07-20", ideas: [idee("AUD/USD", "long"), idee("EUR/GBP", "long")] },
  { weekStart: "2026-07-27", ideas: [idee("AUD/USD", "long"), idee("EUR/GBP", "long")] },
];

const starts = signalStarts(wochen);
check("durchgehender Lauf startet in der ersten Woche", starts["AUD/USD"], "2026-07-06");
check("Richtungswechsel bricht den Lauf", starts["EUR/GBP"], "2026-07-20");

// Lücke: Pair fehlt in einer Woche -> Lauf beginnt danach neu
const mitLuecke = [
  { weekStart: "2026-07-06", ideas: [idee("GBP/USD", "long")] },
  { weekStart: "2026-07-13", ideas: [] },
  { weekStart: "2026-07-20", ideas: [idee("GBP/USD", "long")] },
  { weekStart: "2026-07-27", ideas: [idee("GBP/USD", "long")] },
];
check("Lücke bricht den Lauf", signalStarts(mitLuecke)["GBP/USD"], "2026-07-20");

// Pair nur in der Zielwoche -> Lauf beginnt dort
const neu = [
  { weekStart: "2026-07-20", ideas: [] },
  { weekStart: "2026-07-27", ideas: [idee("USD/CHF", "short")] },
];
check("brandneues Signal startet in der Zielwoche", signalStarts(neu)["USD/CHF"], "2026-07-27");

// Unsortierte Eingabe darf nichts ändern
const unsortiert = [wochen[3], wochen[0], wochen[2], wochen[1]];
check("Reihenfolge der Eingabe egal", signalStarts(unsortiert)["AUD/USD"], "2026-07-06");

// Pair kommt gar nicht vor
check("unbekanntes Pair hat keinen Start", starts["NZD/JPY"], undefined);

// --- sinceForPair: nie ein Startpunkt in der Zukunft ------------------------
const heute = new Date("2026-07-21T12:00:00Z");
check("Start in der Vergangenheit wird durchgereicht", sinceForPair("2026-07-06", heute), "2026-07-06");
check("Start in der Zukunft -> kein Verlauf", sinceForPair("2026-07-27", heute), null);
check("kein Start -> null", sinceForPair(undefined, heute), null);
// Genau heute zählt als gültig (Montag-Start am selben Tag)
check("Start heute ist gültig", sinceForPair("2026-07-21", heute), "2026-07-21");

// --- wochenSeit --------------------------------------------------------------
check("15 Tage sind 2 Wochen", wochenSeit("2026-07-06", heute), 2);
check("7 Tage sind 1 Woche", wochenSeit("2026-07-14", heute), 1);
check("selber Tag sind 0 Wochen", wochenSeit("2026-07-21", heute), 0);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
