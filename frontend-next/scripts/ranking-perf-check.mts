// Kontrollwerte für die Ranking-Performance.
// Aufruf:  npx -y tsx scripts/ranking-perf-check.mts
import {
  wilson, quote, letzteWochen, vergleiche, nachQuintil, verlauf, urteile,
  type RankingErgebnis,
} from "../lib/ml/rankingPerf";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}
const r3 = (x: number | null) => (x === null ? null : Number(x.toFixed(3)));

const E = (p: Partial<RankingErgebnis>): RankingErgebnis => ({
  week_start: "2026-01-05", model: "champion", ccy: "EUR",
  strength_quintile: 5, hit: true, ...p,
});

// --- Wilson ------------------------------------------------------------------
// Bei 50/100 muss das Intervall symmetrisch um 0.5 liegen und ~±0.098 breit sein.
const w = wilson(50, 100);
check("Wilson mittig bei 50/100", [r3(w.unten), r3(w.oben)], [0.404, 0.596]);
// Randfall: 0 Treffer darf nie unter 0 gehen, 100 % nie ueber 1.
check("Wilson bei 0/10 bleibt in [0,1]", [wilson(0, 10).unten >= 0, wilson(0, 10).oben <= 1], [true, true]);
check("Wilson bei 10/10 bleibt in [0,1]", [wilson(10, 10).unten >= 0, wilson(10, 10).oben <= 1], [true, true]);
check("Wilson bei n=0 ist das ganze Intervall", wilson(0, 0), { unten: 0, oben: 1 });
// Mehr Daten -> engeres Intervall. Das ist der ganze Sinn der Uebung.
const eng = wilson(600, 1000), weit = wilson(6, 10);
check("mehr Daten engen das Intervall ein", eng.oben - eng.unten < weit.oben - weit.unten, true);

// --- quote -------------------------------------------------------------------
const gemischt = [E({ hit: true }), E({ hit: true }), E({ hit: false }), E({ hit: null })];
const q = quote(gemischt);
check("offene Prognosen zaehlen nicht mit", q.n, 3);
check("Quote", r3(q.quote), 0.667);
check("kleine Stichprobe ist nicht nachweisbar", q.nachweisbar, false);
check("leere Menge liefert null statt NaN", [quote([]).quote, quote([]).n], [null, 0]);

// 200 von 300 Treffern: Intervall liegt klar ueber 50 %.
const stark = [
  ...Array.from({ length: 200 }, () => E({ hit: true })),
  ...Array.from({ length: 100 }, () => E({ hit: false })),
];
check("grosse klare Stichprobe ist nachweisbar", quote(stark).nachweisbar, true);
// Genau 50 % ist nie nachweisbar, egal wie gross n ist.
const muenze = [
  ...Array.from({ length: 500 }, () => E({ hit: true })),
  ...Array.from({ length: 500 }, () => E({ hit: false })),
];
check("exakter Muenzwurf ist nie nachweisbar", quote(muenze).nachweisbar, false);

// --- Zeitfenster -------------------------------------------------------------
const wochen = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"];
const reihe = wochen.flatMap((week_start) => [E({ week_start }), E({ week_start, ccy: "USD" })]);
check("letzte 2 Wochen", [...new Set(letzteWochen(reihe, 2).map((e) => e.week_start))],
  ["2026-01-26", "2026-02-02"]);
check("Fenster 0 heisst alles", new Set(letzteWochen(reihe, 0).map((e) => e.week_start)).size, 5);
check("Fenster groesser als die Historie liefert alles", letzteWochen(reihe, 99).length, 10);
// Das Fenster zaehlt ab der juengsten BEWERTETEN Woche, nicht ab heute.
const mitOffenen = [...reihe, E({ week_start: "2026-03-01", hit: null })];
check("offene Wochen verschieben das Fenster nicht",
  [...new Set(letzteWochen(mitOffenen, 1).map((e) => e.week_start))], ["2026-02-02"]);

// --- Vergleich ---------------------------------------------------------------
const beide = [
  ...Array.from({ length: 100 }, (_, i) => E({ model: "champion", hit: i < 70 })),
  ...Array.from({ length: 100 }, (_, i) => E({ model: "baseline", hit: i < 50 })),
];
const v = vergleiche(beide, 0, "gesamt");
check("Champion 70 %", r3(v.champion.quote), 0.7);
check("Baseline 50 %", r3(v.baseline.quote), 0.5);
check("Vorsprung in Punkten", r3(v.vorsprung), 20);
check("klarer Vorsprung ist belegt", v.vorsprungBelegt, true);

const knapp = [
  ...Array.from({ length: 100 }, (_, i) => E({ model: "champion", hit: i < 54 })),
  ...Array.from({ length: 100 }, (_, i) => E({ model: "baseline", hit: i < 52 })),
];
check("knapper Vorsprung ist NICHT belegt", vergleiche(knapp, 0, "x").vorsprungBelegt, false);

// --- Quintile ----------------------------------------------------------------
const quintile = [
  ...Array.from({ length: 40 }, (_, i) => E({ strength_quintile: 5, hit: i < 28 })),
  ...Array.from({ length: 40 }, (_, i) => E({ strength_quintile: 3, hit: i < 20 })),
];
const nq = nachQuintil(quintile);
check("Extreme 70 %", r3(nq.extreme.quote), 0.7);
check("Mittelfeld 50 %", r3(nq.mittelfeld.quote), 0.5);
check("Abstand", r3(nq.abstand), 20);
check("Quintil null zaehlt nirgends",
  nachQuintil([E({ strength_quintile: null })]).mittelfeld.n, 0);

// --- Verlauf -----------------------------------------------------------------
const langeReihe = Array.from({ length: 20 }, (_, i) =>
  ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"][i % 4]).map((week_start, i) =>
  E({ week_start, ccy: `C${i}`, hit: i % 2 === 0 }));
const vl = verlauf(langeReihe);
check("eine Zeile je Woche", vl.length, 4);
check("chronologisch", vl.map((p) => p.week_start),
  ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
check("gleitende Linie erst ab halbem Fenster", vl[0].gleitend, null);
check("anderes Modell wird nicht gemischt", verlauf(langeReihe, "baseline").length, 0);

// --- Urteil ------------------------------------------------------------------
check("zu wenig Material", urteile(vergleiche(gemischt, 0, "x")).urteil, "kein-material");
check("klarer Vorsprung traegt", urteile(v).urteil, "traegt");
check("knapp ueber 50 ohne Nachweis", urteile(vergleiche(knapp, 0, "x")).urteil, "kein-nachweis");
const schlecht = [
  ...Array.from({ length: 200 }, (_, i) => E({ model: "champion", hit: i < 60 })),
  ...Array.from({ length: 200 }, (_, i) => E({ model: "baseline", hit: i < 100 })),
];
check("systematisch verkehrt wird benannt", urteile(vergleiche(schlecht, 0, "x")).urteil, "schlechter");
check("jedes Urteil hat einen Satz",
  [urteile(v).satz.length > 20, urteile(vergleiche(knapp, 0, "x")).satz.length > 20], [true, true]);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
