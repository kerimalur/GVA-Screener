// Kontrollwerte für die Strategie-Auswertung.
// Aufruf:  npx -y tsx scripts/strategien-check.mts
import {
  feuert, werteAus, bilanziere, fenster, imFenster, gruppiere, vorschlaege,
  basisWaehrung, monat, MITGELIEFERT,
  type Strategie, type Treffer,
} from "../lib/strategien/regeln";
import type { SetupFinderRow } from "../lib/ml/backtest";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}
const rund = (x: number | null, n = 2) => (x === null ? null : Number(x.toFixed(n)));

const S = (p: Partial<Strategie>): Strategie => ({
  id: "t", name: "t", these: "", bedingungen: [1, 1, null, null, null],
  minTreffer: 2, horizont: 4, pairs: [], eigen: true, ...p,
});
const R = (p: Partial<SetupFinderRow>): SetupFinderRow => ({
  w: "2020-01-06", i: "EUR_USD", d: [1, 1, null, null, null], r: [1, 1, 1, 1], ...p,
});

// --- feuert ------------------------------------------------------------------
check("beide Faktoren dafuer -> long", feuert(S({}), [1, 1, 0, 0, 0]), { richtung: 1, konfluenz: 2 });
check("beide dagegen -> short (Spiegel)", feuert(S({}), [-1, -1, 0, 0, 0]), { richtung: -1, konfluenz: 2 });
check("einer dafuer, einer dagegen -> nichts", feuert(S({}), [1, -1, 0, 0, 0]), null);
check("nur einer aktiv, minTreffer 2 -> nichts", feuert(S({}), [1, 0, 0, 0, 0]), null);
check("fehlender Faktor zaehlt nicht als Zustimmung", feuert(S({}), [1, null, 0, 0, 0]), null);
check("minTreffer 1 reicht ein Faktor", feuert(S({ minTreffer: 1 }), [1, 0, 0, 0, 0]), { richtung: 1, konfluenz: 1 });
check("Gegenfaktor kippt trotz erreichter Mindestzahl",
  feuert(S({ bedingungen: [1, 1, 1, null, null], minTreffer: 2 }), [1, 1, -1, 0, 0]), null);
check("Regel ohne Bedingungen feuert nie",
  feuert(S({ bedingungen: [null, null, null, null, null] }), [1, 1, 1, 1, 1]), null);
// Eine invertierte Bedingung: Retail muss DAGEGEN sprechen.
check("invertierte Bedingung trifft bei -1",
  feuert(S({ bedingungen: [null, null, null, null, -1], minTreffer: 1 }), [0, 0, 0, 0, -1]),
  { richtung: 1, konfluenz: 1 });
check("invertierte Bedingung spiegelt sauber",
  feuert(S({ bedingungen: [null, null, null, null, -1], minTreffer: 1 }), [0, 0, 0, 0, 1]),
  { richtung: -1, konfluenz: 1 });

// --- Fenster -----------------------------------------------------------------
const f = fenster("2026-08-14");
check("Entwicklungsfenster", f.entwicklung, { von: "2016-08-14", bis: "2024-08-14" });
check("Pruefungsfenster", f.pruefung, { von: "2024-08-14", bis: "2026-08-14" });
check("Grenze gehoert dem spaeteren Fenster", imFenster("2024-08-14", f.entwicklung), false);
check("Grenze ist im Pruefungsfenster", imFenster("2024-08-14", f.pruefung), true);
check("davor gehoert nirgends hin", imFenster("2010-01-01", f.entwicklung), false);

// --- werteAus ----------------------------------------------------------------
const rows: SetupFinderRow[] = [
  R({ w: "2020-01-06", r: [0.5, 1, 1.5, 2] }),                    // long, +2 @4W
  R({ w: "2020-02-03", d: [-1, -1, null, null, null], r: [0, 0, 0, -3] }), // short, +3
  R({ w: "2020-03-02", r: [0, 0, 0, -1] }),                       // long, -1
  R({ w: "2020-04-06", d: [1, -1, null, null, null], r: [9, 9, 9, 9] }),   // feuert nicht
  R({ w: "2025-01-06", r: [0, 0, 0, 5] }),                        // im Pruefungsfenster
  R({ w: "2020-05-04", r: [0, 0, 0, null] }),                     // kein Kurs
];
const t = werteAus(S({}), rows, [1, 2, 3, 4], f.entwicklung);
check("nur gefeuerte Zeilen im Entwicklungsfenster", t.length, 3);
check("Short-Rendite wird gedreht", rund(t[1].rendite), 3);
check("Pruefungsfenster bleibt aussen vor", t.some((x) => x.woche.startsWith("2025")), false);
check("Zeile ohne Kurs faellt raus", t.some((x) => x.woche === "2020-05-04"), false);

const nurPruefung = werteAus(S({}), rows, [1, 2, 3, 4], f.pruefung);
check("Pruefungsfenster liefert seine eine Zeile", nurPruefung.length, 1);

check("Pair-Filter greift",
  werteAus(S({ pairs: ["GBP_USD"] }), rows, [1, 2, 3, 4], f.entwicklung).length, 0);
check("unbekannter Horizont liefert nichts",
  werteAus(S({ horizont: 3 }), rows, [1, 2, 4], f.entwicklung).length, 0);
check("Horizont 1 nimmt die erste Spalte",
  rund(werteAus(S({ horizont: 1 }), rows, [1, 2, 3, 4], f.entwicklung)[0].rendite), 0.5);

// --- Bilanz ------------------------------------------------------------------
const b = bilanziere(t);
check("n", b.n, 3);
check("Gewinne/Verluste", [b.gewinne, b.verluste], [2, 1]);
check("Trefferquote", rund(b.trefferquote, 1), 66.7);
check("Gesamt +2 +3 -1", rund(b.gesamt), 4);
check("Schnitt", rund(b.schnitt), 1.33);
check("Ø Gewinn", rund(b.schnittGewinn), 2.5);
check("Ø Verlust ist negativ", rund(b.schnittVerlust), -1);
check("Profitfaktor 5/1", rund(b.profitFaktor), 5);
// Chronologisch: +2 (Jan), +3 (Feb) -> Hoch 5, dann -1 (Maer) -> Rueckgang 1
check("maxRueckgang", rund(b.maxRueckgang), 1);

check("leere Bilanz teilt nicht durch null",
  [bilanziere([]).trefferquote, bilanziere([]).schnitt, bilanziere([]).profitFaktor],
  [null, null, null]);
const nurGewinn = bilanziere([{ woche: "2020-01-06", instrument: "EUR_USD", richtung: 1, rendite: 1, gewonnen: true, konfluenz: 2 }]);
check("ohne Verlust ist der Profitfaktor null, nicht unendlich", nurGewinn.profitFaktor, null);

// --- Gruppierung -------------------------------------------------------------
// Gross genug, dass die Schutzschwellen (30 Rest, 10 weg, 4 Punkte Hub)
// ueberhaupt greifen koennen - bei 40 Signalen lehnt `vorschlaege` bewusst
// alles ab, weil nach dem Filter zu wenig Material uebrig bliebe.
const viele: Treffer[] = [
  ...Array.from({ length: 60 }, (_, k) => ({ woche: `2020-0${(k % 9) + 1}-06`, instrument: "EUR_USD", richtung: 1 as const, rendite: 1, gewonnen: true, konfluenz: 3 })),
  ...Array.from({ length: 40 }, (_, k) => ({ woche: `2021-0${(k % 9) + 1}-06`, instrument: "JPY_USD", richtung: 1 as const, rendite: -1, gewonnen: false, konfluenz: 2 })),
];
const gr = gruppiere(viele, basisWaehrung);
check("zwei Gruppen", gr.map((g) => g.schluessel).sort(), ["EUR", "JPY"]);
check("EUR trifft immer", gr.find((g) => g.schluessel === "EUR")!.bilanz.trefferquote, 100);
check("Monatsname aus dem Datum", monat({ woche: "2020-03-02" } as Treffer), "Mär");

// --- Vorschlaege -------------------------------------------------------------
const v = vorschlaege(viele);
check("erkennt die schwache Basiswaehrung",
  v.some((x) => x.titel.includes("JPY")), true);
check("Konfluenz-Vorschlag kommt ebenfalls",
  v.some((x) => x.titel.includes("übereinstimmenden")), true);
check("jeder Vorschlag verbessert wirklich", v.every((x) => x.nachher > x.vorher), true);
check("zu wenig Material -> keine Vorschlaege", vorschlaege(viele.slice(0, 5)).length, 0);
// Die Schwellen sind kein Schmuck: knapp unter der Grenze wird abgelehnt.
check("39 Signale reichen nicht", vorschlaege(viele.slice(0, 39)).length, 0);
check("Vorschlag nennt Rest und Weggefallenes",
  v.every((x) => x.nRest >= 30 && x.nWeg >= 10), true);
check("hoechstens sechs Vorschlaege", v.length <= 6, true);

// --- Mitgeliefertes ----------------------------------------------------------
check("vier Startpunkte", MITGELIEFERT.length, 4);
check("alle mit fuenf Bedingungen", MITGELIEFERT.every((s) => s.bedingungen.length === 5), true);
check("alle mit These", MITGELIEFERT.every((s) => s.these.trim().length > 10), true);
check("keine doppelten IDs",
  MITGELIEFERT.map((s) => s.id).filter((x, i, a) => a.indexOf(x) !== i), []);
check("minTreffer nie groesser als die Zahl der Bedingungen",
  MITGELIEFERT.filter((s) => s.minTreffer > s.bedingungen.filter((b) => b !== null).length).map((s) => s.id), []);

console.log(fails === 0 ? "\nAlle Kontrollwerte gruen." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
