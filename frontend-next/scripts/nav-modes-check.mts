// Kontrollwerte für die Modus-Navigation: npx tsx scripts/nav-modes-check.mts
//
// Deckt ab:
//   - jede Route findet ihren Modus und den richtigen aktiven Tab, auch beim
//     direkten URL-Aufruf einer Unterseite
//   - der längste Treffer gewinnt (sonst zieht "/journal" den falschen Modus
//     für "/journal/backtest" auf)
//   - gesperrte Routen (proxy.ts) erscheinen in KEINER Tab-Leiste
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
check("/cockpit", modus("/cockpit"), "trades");
check("/ml/ranking", modus("/ml/ranking"), "trades");
check("/scanner/heatmap", modus("/scanner/heatmap"), "trades");
check("/journal (Trades)", modus("/journal"), "journal");
check("/journal/equity per Direktaufruf", modus("/journal/equity"), "journal");
check("/journal/outlook", modus("/journal/outlook"), "journal");
check("/ml/replay", modus("/ml/replay"), "backtest");
check("/makro/real-yield", modus("/makro/real-yield"), "labor");
check("/dashboard (News)", modus("/dashboard"), "labor");
// Einstellungen und Leitfaden hängen am Avatar-Menü, gehören zu keinem Modus.
check("/einstellungen", modus("/einstellungen"), null);
check("/leitfaden", modus("/leitfaden"), null);

// Längster Treffer gewinnt: sonst schluckt "/journal" beide Unterseiten.
check("/journal/backtest gehört zu Backtesten", modus("/journal/backtest"), "backtest");
check("/journal/strategie gehört zu Journalieren", modus("/journal/strategie"), "journal");
check("aktiver Tab /journal/strategie", activeTabHref("/journal/strategie"), "/journal/strategie");

// --- Aktiver Tab -------------------------------------------------------------
check("aktiver Tab /journal/equity", activeTabHref("/journal/equity"), "/journal/equity");
check("aktiver Tab /journal/backtest", activeTabHref("/journal/backtest"), "/journal/backtest");
check("aktiver Tab /journal", activeTabHref("/journal"), "/journal");
check(
  "Unterseite ohne eigenen Tab erbt den Elterntab",
  activeTabHref("/makro/terminal/vergleich"),
  "/makro/terminal",
);
check("Launcher hat keinen aktiven Tab", activeTabHref(LAUNCHER_HREF), null);
check("unbekannte Route hat keinen Modus", modus("/gibtesnicht"), null);

// --- Gesperrte Routen tauchen nirgends als Tab auf ---------------------------
const alleTabs = MODES.flatMap((m) => m.tabs.map((t) => t.href));
check("kein Tab zeigt auf eine gesperrte Route", alleTabs.filter(isHiddenRoute), []);
check(
  "gesperrte Prefixe finden keinen Modus",
  HIDDEN_PREFIXES.map(modus).filter(Boolean),
  [],
);
check("exakt /ml ist gesperrt", isHiddenRoute("/ml"), true);
check("aber /ml/ranking nicht", isHiddenRoute("/ml/ranking"), false);

// --- Struktur ----------------------------------------------------------------
check("vier Modi", MODES.map((m) => m.key), ["trades", "journal", "backtest", "labor"]);
check(
  "jede Basisroute ist selbst ein Tab des Modus",
  MODES.filter((m) => !m.tabs.some((t) => t.href === m.base)).map((m) => m.key),
  [],
);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
