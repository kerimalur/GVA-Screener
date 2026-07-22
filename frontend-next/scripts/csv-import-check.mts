// Kontrollwerte für den CSV-Import: npx tsx scripts/csv-import-check.mts
//
// Deckt ab:
//   - tolerantes Zahlen-/Datum-/Zeit-Parsing
//   - Session aus der Eintritts-Stunde
//   - Broker-CSV → Trades (MT-Format, .raw-Suffix, Summenzeile ignoriert,
//     rMultiple aus Entry/SL/Exit, Ergebnis aus Profit)
//   - Duplikat-Erkennung gegen Bestand und innerhalb des Imports
import {
  num,
  parseDate,
  parseHour,
  sessionFromHour,
  parseTradesCsv,
  dedupeKey,
  markDuplicates,
} from "../lib/journal/csvImport";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

// --- num ---------------------------------------------------------------------
check("num europäisch 1.234,56", num("1.234,56"), 1234.56);
check("num mit Symbol/Vorzeichen", num("$-50.00"), -50);
check("num Tausender-Komma", num("1,234.50"), 1234.5);
check("num leer -> undefined", num(""), undefined);

// --- Datum / Zeit ------------------------------------------------------------
check("parseDate MT-Punkt", parseDate("2026.07.15 14:30:00"), "2026-07-15");
check("parseDate ISO", parseDate("2026-07-15"), "2026-07-15");
check("parseDate DD.MM.YYYY", parseDate("15.07.2026"), "2026-07-15");
check("parseHour", parseHour("2026.07.15 14:30:00"), 14);
check("session 8 -> london", sessionFromHour(8), "london");
check("session 14 -> newyork", sessionFromHour(14), "newyork");
check("session 3 -> asia", sessionFromHour(3), "asia");
check("session null -> leer", sessionFromHour(null), "");

// --- Broker-CSV --------------------------------------------------------------
const csv = [
  "Ticket,Open Time,Type,Size,Symbol,Open Price,S/L,T/P,Close Time,Close Price,Profit",
  "1001,2026.07.06 08:30:00,buy,0.10,EURUSD,1.08000,1.07800,1.08600,2026.07.06 12:00:00,1.08400,40.00",
  "1002,2026.07.07 14:15:00,sell,0.20,GBPUSD.raw,1.27000,1.27300,1.26000,2026.07.07 16:00:00,1.27300,-60.00",
  "Total,,,,,,,,,,-20.00",
].join("\n");

const parsed = parseTradesCsv(csv);
check("2 Trades geparst (Summe ignoriert)", parsed.length, 2);
check("Pair .raw entfernt", parsed[1].pair, "GBPUSD");
check("Richtung buy->long", parsed[0].direction, "long");
check("Richtung sell->short", parsed[1].direction, "short");
check("Datum aus Close Time", parsed[0].date, "2026-07-06");
check("Ergebnis aus Profit (win)", parsed[0].result, "win");
check("Ergebnis aus Profit (loss)", parsed[1].result, "loss");
check("rMultiple long 2R", parsed[0].rMultiple, 2);
check("rMultiple short -1R", parsed[1].rMultiple, -1);
check("Session aus Open Time (london)", parsed[0].session, "london");
check("Session aus Open Time (newyork)", parsed[1].session, "newyork");
check("Profit übernommen", parsed[0].profitAmount, 40);

// --- Duplikat-Erkennung ------------------------------------------------------
check(
  "gegen Bestand: 1. ist Duplikat",
  markDuplicates(parsed, [
    { pair: "EURUSD", date: "2026-07-06", direction: "long", entryPrice: 1.08, profitAmount: 40 },
  ]).map((m) => m.duplicate),
  [true, false],
);
check(
  "innerhalb Import: 2. Gleiche ist Duplikat",
  markDuplicates([parsed[0], parsed[0]], []).map((m) => m.duplicate),
  [false, true],
);
check("dedupeKey stabil", dedupeKey(parsed[0]), "EURUSD|2026-07-06|long|1.08000|40.00");

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
