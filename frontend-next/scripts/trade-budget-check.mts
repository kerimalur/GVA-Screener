// Kontrollwerte für das Trade-Budget: npx tsx scripts/trade-budget-check.mts
//
// Deckt ab:
//   - Blockgrenzen (feste 7-Tage-Blöcke ab dem 1., Block 4 laeuft bis Monatsende)
//   - Freischaltung 2/4/6/8, kumulativ (ungenutzte Kaestchen verfallen nicht)
//   - Verbrauch von links, Ueberzug ab dem 9. Trade
//   - Nur Live-Trades des laufenden Monats, kontenuebergreifend
import {
  TRADE_BUDGET_PER_MONTH,
  budgetState,
  unlockedBoxes,
  usedThisMonth,
  weekBlockOf,
} from "../lib/journal/budget";
import { expectancyPerMonth } from "../lib/journal/discipline";
import type { Trade } from "../lib/journal/types";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

// --- Blockgrenzen ------------------------------------------------------------
check("1. -> Block 1", weekBlockOf(d("2026-07-01")), 1);
check("7. -> Block 1", weekBlockOf(d("2026-07-07")), 1);
check("8. -> Block 2", weekBlockOf(d("2026-07-08")), 2);
check("14. -> Block 2", weekBlockOf(d("2026-07-14")), 2);
check("15. -> Block 3", weekBlockOf(d("2026-07-15")), 3);
check("21. -> Block 3", weekBlockOf(d("2026-07-21")), 3);
check("22. -> Block 4", weekBlockOf(d("2026-07-22")), 4);
check("31. bleibt Block 4", weekBlockOf(d("2026-07-31")), 4);
check("28. im Februar bleibt Block 4", weekBlockOf(d("2026-02-28")), 4);

// --- Freischaltung -----------------------------------------------------------
check("Block 1 schaltet 2 frei", unlockedBoxes(d("2026-07-03")), 2);
check("Block 2 schaltet 4 frei", unlockedBoxes(d("2026-07-10")), 4);
check("Block 3 schaltet 6 frei", unlockedBoxes(d("2026-07-17")), 6);
check("Block 4 schaltet 8 frei", unlockedBoxes(d("2026-07-25")), 8);
check("Deckel bleibt bei 8", unlockedBoxes(d("2026-07-31")), TRADE_BUDGET_PER_MONTH);

// --- Verbrauch ---------------------------------------------------------------
const t = (over: Partial<Trade>): Trade =>
  ({
    id: "x", type: "funded", pair: "EURUSD", direction: "long",
    date: "2026-07-02", result: "win", rMultiple: 1,
    notes: "", comment: "", sessionType: "live", session: "",
    confluences: [],
    ...over,
  }) as Trade;

check(
  "nur Live-Trades zaehlen",
  usedThisMonth([t({}), t({ id: "b", sessionType: "backtest" })], d("2026-07-21")),
  1,
);
check(
  "Vormonat zaehlt nicht",
  usedThisMonth([t({}), t({ id: "v", date: "2026-06-30" })], d("2026-07-21")),
  1,
);
check(
  "Folgemonat zaehlt nicht",
  usedThisMonth([t({}), t({ id: "n", date: "2026-08-01" })], d("2026-07-21")),
  1,
);
check(
  "beide Kontotypen zaehlen zusammen",
  usedThisMonth([t({}), t({ id: "e", type: "ek" })], d("2026-07-21")),
  2,
);

// --- Zusammengesetzter Zustand ----------------------------------------------
// Block 3 (17.07.), 2 Trades verbraucht -> 6 frei, 4 offen
const s1 = budgetState([t({}), t({ id: "2", date: "2026-07-09" })], d("2026-07-17"));
check("used/unlocked/offen", [s1.used, s1.unlocked, s1.offen], [2, 6, 4]);
check("kein Ueberzug", s1.overrun, 0);
check(
  "Verbrauch von links, Rest offen, Block 4 gesperrt",
  s1.boxes,
  ["used", "used", "open", "open", "open", "open", "locked", "locked"],
);

// Uebertrag: Block 1 ohne Trades -> in Block 2 stehen alle 4 offen
const s2 = budgetState([], d("2026-07-10"));
check(
  "ungenutzte Kaestchen verfallen nicht",
  s2.boxes,
  ["open", "open", "open", "open", "locked", "locked", "locked", "locked"],
);
check("nichts verbraucht", [s2.used, s2.offen], [0, 4]);

// Ueberzug: 9 Trades im Monat
const neun = Array.from({ length: 9 }, (_, i) => t({ id: `t${i}`, date: "2026-07-23" }));
const s3 = budgetState(neun, d("2026-07-25"));
check("Ueberzug wird gezaehlt", s3.overrun, 1);
check("kein offenes Kaestchen mehr", s3.offen, 0);
check("neun Kaestchen, das letzte ist Ueberzug", s3.boxes.length, 9);
check("letztes Kaestchen ist overrun", s3.boxes[8], "overrun");

// Leerer Monat
const s4 = budgetState([], d("2026-07-01"));
check("Monatsanfang: 2 offen, 6 gesperrt", [s4.offen, s4.unlocked, s4.used], [2, 2, 0]);

// --- Expectancy rechnet mit dem festen Budget -------------------------------
// (WR·RR·Risiko%) − ((1−WR)·Risiko%), mal 8 Trades
const p = { riskPct: 1, rr: 4, fallbackWinrate: 40 };
check("WR 25 % -> +2,0 % / Monat", Math.round(expectancyPerMonth(25, p) * 10) / 10, 2);
check("WR 50 % -> +12,0 % / Monat", Math.round(expectancyPerMonth(50, p) * 10) / 10, 12);
check("WR 0 % -> −8,0 % / Monat", Math.round(expectancyPerMonth(0, p) * 10) / 10, -8);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
