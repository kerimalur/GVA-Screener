// Kontrollwerte für die Holdout-Darstellung: npx tsx scripts/holdout-check.mts
//
// Deckt ab:
//   - Urteil: KI der Differenz schliesst die Null ein -> "kein Nachweis"
//     (darf NIE als Erfolg erscheinen, auch wenn das Delta positiv ist)
//   - Delta-Anzeige im Engine-Log: exakt 0 wird angezeigt, "▲0.000" gibt es nicht
import { formatDelta, verdictOf, VERDICT_LABEL } from "../lib/ml/holdoutFormat";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

// --- Urteil ------------------------------------------------------------------
const v = (delta: number | null, lo: number | null, hi: number | null, isBaseline = false) =>
  verdictOf({ isBaseline, delta, deltaCiLow: lo, deltaCiHigh: hi });

check("Baseline ist die Referenz", v(null, null, null, true), "baseline");
check("KI umschliesst die Null -> kein Nachweis", v(0.012, -0.02, 0.04), "kein-nachweis");
check("positives Delta zaehlt NICHT allein", v(0.05, -0.001, 0.1), "kein-nachweis");
check("KI komplett ueber Null -> besser", v(0.04, 0.01, 0.07), "besser");
check("KI komplett unter Null -> schlechter", v(-0.04, -0.07, -0.01), "schlechter");
check("KI beruehrt die Null von oben -> kein Nachweis", v(0.03, 0.0, 0.06), "kein-nachweis");
check("ohne Baseline-Vergleich -> offen", v(null, null, null), "offen");
check("Label fuer kein-nachweis", VERDICT_LABEL["kein-nachweis"], "kein Nachweis");

// --- Delta-Anzeige -----------------------------------------------------------
check("kein Delta -> keine Anzeige", formatDelta(null), null);
check("exakt 0 wird als unveraendert gezeigt", formatDelta(0), { sign: "flat", text: "±0.000" });
check("normales Plus", formatDelta(0.012), { sign: "up", text: "▲0.012" });
check("normales Minus", formatDelta(-0.012), { sign: "down", text: "▼0.012" });
// Der eigentliche Fix: 0.0004 ergab frueher "▲0.000"
check("winziges Plus bekommt mehr Stellen", formatDelta(0.0004), { sign: "up", text: "▲0.0004" });
// Es werden nur so viele Stellen ergaenzt, bis der Wert nicht mehr 0 ist —
// 0.00006 ist auf 4 Stellen bereits sichtbar (0.0001), also stoppt es dort.
check("winziges Minus bekommt mehr Stellen", formatDelta(-0.00006), {
  sign: "down",
  text: "▼0.0001",
});
check("noch kleiner -> noch mehr Stellen", formatDelta(0.000004), {
  sign: "up",
  text: "▲0.000004",
});
check("unter der feinsten Stufe -> unveraendert", formatDelta(1e-9), {
  sign: "flat",
  text: "±0.000",
});
check("NaN -> keine Anzeige", formatDelta(Number.NaN), null);

// Nie "▲0.000" oder "▼0.000" — egal wie klein der Wert ist
const kandidaten = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 5e-4, -5e-5, 0.5];
const boese = kandidaten
  .map((d) => formatDelta(d)?.text ?? "")
  .filter((t) => t === "▲0.000" || t === "▼0.000");
check("kein Fall erzeugt ▲0.000/▼0.000", boese, []);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
