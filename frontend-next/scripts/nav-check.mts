// Kontrollwerte für die Navigation: npx tsx scripts/nav-check.mts
//
// Deckt ab:
//   - jede Route findet ihren Eintrag, auch beim direkten Aufruf einer Unterseite
//   - der längste Treffer gewinnt ("/ml" darf "/ml/ranking" nicht schlucken)
//   - `exact`-Einträge sammeln keine unbekannten Unterpfade ein
//   - Routen, die es hier nicht mehr gibt, finden keinen Eintrag
import { NAV, MENUE, TITEL, aktiverPfad, navItem, HOME } from "../components/layout/nav";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

// --- Route -> Eintrag --------------------------------------------------------
check("Startseite", aktiverPfad(HOME), "/");
check("/markt", aktiverPfad("/markt"), "/markt");
check("/strategien", aktiverPfad("/strategien"), "/strategien");
check("/ml/engine-log", aktiverPfad("/ml/engine-log"), "/ml/engine-log");
check("/ml/ranking", aktiverPfad("/ml/ranking"), "/ml/ranking");
check("/ml/training", aktiverPfad("/ml/training"), "/ml/training");
check("/ml (Datenlage)", aktiverPfad("/ml"), "/ml");
check("/leitfaden", aktiverPfad("/leitfaden"), "/leitfaden");
check("/einstellungen", aktiverPfad("/einstellungen"), "/einstellungen");

// --- Längster Treffer gewinnt ------------------------------------------------
check("Unterseite erbt den Elterneintrag", aktiverPfad("/strategien/abc"), "/strategien");
check("/ml/engine-log/detail erbt Engine", aktiverPfad("/ml/engine-log/detail"), "/ml/engine-log");

// --- exact hält, was es verspricht -------------------------------------------
// Ohne `exact` auf "/" wuerde JEDE Route dort landen, und ohne `exact` auf
// "/ml" saehe eine 404 unter /ml/... wie die Datenlage aus.
check("unbekannte /ml-Unterseite gehoert niemandem", aktiverPfad("/ml/gibtesnicht"), null);
check("unbekannte Route gehoert niemandem", aktiverPfad("/voellig/anders"), null);

// --- Was hier nicht mehr existiert -------------------------------------------
// Diese Seiten sind am 14.08.2026 aufgeloest worden - teils nach KerimOS,
// teils in /markt. Ein Treffer waere ein stehen gebliebener Eintrag.
for (const weg of [
  "/cockpit", "/journal", "/scanner/radar", "/ml/replay",
  "/makro/terminal", "/makro/real-yield", "/cot/intelligence", "/weekly",
  "/dashboard", "/ml/season", "/ml/factor-lab", "/ml/fundamental-track",
  "/ml/setup-finder", "/ml/modell",
]) {
  check(`${weg} gibt es nicht mehr`, aktiverPfad(weg), null);
}

// --- Struktur ----------------------------------------------------------------
check("sechs Eintraege in der Leiste", NAV.map((i) => i.label),
  ["Übersicht", "Markt", "Strategien", "Engine", "Ranking", "Training"]);
check("drei im Menue", MENUE.map((i) => i.label),
  ["Datenlage", "Leitfaden", "Einstellungen"]);

const alle = [...NAV, ...MENUE];
check("keine doppelten Pfade", alle.map((i) => i.href).filter((h, i, a) => a.indexOf(h) !== i), []);
check("jeder Eintrag hat einen Zweck", alle.filter((i) => !i.zweck.trim()).map((i) => i.href), []);
check("jeder Eintrag hat einen Titel", alle.filter((i) => !TITEL[i.href]).map((i) => i.href), []);
check("navItem findet das Label", navItem("/markt")?.label, "Markt");
check("navItem bei Unbekanntem null", navItem("/voellig/anders"), null);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
