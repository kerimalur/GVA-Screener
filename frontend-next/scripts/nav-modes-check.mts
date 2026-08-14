// Kontrollwerte für die Modus-Navigation: npx tsx scripts/nav-modes-check.mts
//
// Deckt ab:
//   - jede Route findet ihren Modus und den richtigen aktiven Tab, auch beim
//     direkten URL-Aufruf einer Unterseite
//   - der längste Treffer gewinnt (sonst zieht "/ml" den falschen Tab
//     für "/ml/ranking" auf)
//   - gesperrte Routen (proxy.ts) erscheinen in KEINER Tab-Leiste
//   - die Routen, die es hier nicht mehr geben darf, finden keinen Modus
import { MODES, modeForPath, activeTabHref, LAUNCHER_HREF } from "../components/layout/nav";
import { isHiddenRoute, HIDDEN_PREFIXES } from "../lib/nav/hidden";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

const modus = (p: string) => modeForPath(p)?.key ?? null;

// --- Route -> Modus ----------------------------------------------------------
check("Launcher gehört zu keinem Modus", modus(LAUNCHER_HREF), null);
check("/ml/engine-log", modus("/ml/engine-log"), "modelle");
check("/ml/ranking", modus("/ml/ranking"), "modelle");
check("/ml (Datenlage)", modus("/ml"), "modelle");
check("/ml/factor-lab", modus("/ml/factor-lab"), "faktoren");
check("/ml/fundamental-track", modus("/ml/fundamental-track"), "faktoren");
check("/ml/season", modus("/ml/season"), "faktoren");
check("/makro/terminal", modus("/makro/terminal"), "maerkte");
check("/makro/real-yield", modus("/makro/real-yield"), "maerkte");
check("/cot/intelligence", modus("/cot/intelligence"), "maerkte");
check("/weekly", modus("/weekly"), "maerkte");
check("/dashboard (Termine)", modus("/dashboard"), "maerkte");
// Einstellungen und Leitfaden hängen am Avatar-Menü, gehören zu keinem Modus.
check("/einstellungen", modus("/einstellungen"), null);
check("/leitfaden", modus("/leitfaden"), null);

// Längster Treffer gewinnt: "/ml" darf "/ml/ranking" nicht schlucken.
check("aktiver Tab /ml/ranking", activeTabHref("/ml/ranking"), "/ml/ranking");
check("aktiver Tab /ml", activeTabHref("/ml"), "/ml");
check(
  "Unterseite ohne eigenen Tab erbt den Elterntab",
  activeTabHref("/makro/terminal/vergleich"),
  "/makro/terminal",
);
check(
  "COT-Detailseite erbt den Elterntab",
  activeTabHref("/cot/intelligence/EUR"),
  "/cot/intelligence",
);
check("Launcher hat keinen aktiven Tab", activeTabHref(LAUNCHER_HREF), null);
check("unbekannte Route hat keinen Modus", modus("/gibtesnicht"), null);

// --- Was hier nicht mehr existiert ------------------------------------------
// Diese Bereiche liegen seit 13.08.2026 in KerimOS. Ein Modus-Treffer wäre ein
// Zeichen, dass beim Umbau ein Tab stehen geblieben ist.
for (const weg of ["/cockpit", "/journal", "/journal/equity", "/journal/backtest",
                   "/scanner/radar", "/scanner/heatmap", "/ml/replay"]) {
  check(`${weg} gibt es hier nicht mehr`, modus(weg), null);
}

// --- Gesperrte Routen tauchen nirgends als Tab auf ---------------------------
const alleTabs = MODES.flatMap((m) => m.tabs.map((t) => t.href));
check("kein Tab zeigt auf eine gesperrte Route", alleTabs.filter(isHiddenRoute), []);
check("Sperrliste ist leer", [...HIDDEN_PREFIXES], []);

// --- Struktur ----------------------------------------------------------------
check("drei Modi", MODES.map((m) => m.key), ["modelle", "faktoren", "maerkte"]);
check(
  "jede Basisroute ist selbst ein Tab des Modus",
  MODES.filter((m) => !m.tabs.some((t) => t.href === m.base)).map((m) => m.key),
  [],
);
check(
  "keine doppelten Tab-Pfade über alle Modi",
  alleTabs.filter((h, i) => alleTabs.indexOf(h) !== i),
  [],
);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
