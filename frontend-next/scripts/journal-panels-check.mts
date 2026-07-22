// Kontrollwerte für die Kalender-/Dashboard-Panels:
//   npx tsx scripts/journal-panels-check.mts
//
// Deckt ab:
//   - Session-Normalisierung (london/newyork/asia, Varianten, leer/unbekannt)
//   - Wochentag-Zuordnung Mo–Fr, Wochenende fällt heraus
//   - Winrate wins/(wins+losses); reiner Breakeven-Bucket -> null (nicht 0 %)
//   - Sum R je Bucket, "ohne Session"-Zähler, enough-Schwelle
//   - Konto-P&L = Kontostand − Startkapital, pnlPct, allAccounts-Reihenfolge
import {
  MIN_PATTERN_TRADES,
  sessionOf,
  timePatterns,
} from "../lib/journal/timePatterns";
import { accountSummary, allAccounts } from "../lib/journal/accountsSummary";
import type { Trade } from "../lib/journal/types";
import type { AccountConfig, AccountConfigs } from "../lib/journal/types";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

const t = (over: Partial<Trade>): Trade =>
  ({
    id: Math.random().toString(36).slice(2),
    type: "funded",
    pair: "EURUSD",
    direction: "long",
    date: "2026-07-06",
    result: "win",
    rMultiple: 1,
    sessionType: "live",
    session: "",
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as Trade;

// --- Session-Normalisierung --------------------------------------------------
check("london", sessionOf("london"), "london");
check("LONDON open (Varianten)", sessionOf("LONDON open"), "london");
check("frankfurt -> london", sessionOf("Frankfurt"), "london");
check("newyork", sessionOf("newyork"), "newyork");
check("New York mit Leerzeichen", sessionOf("New York"), "newyork");
check("ny-Kürzel", sessionOf("NY"), "newyork");
check("asia", sessionOf("asia"), "asia");
check("tokyo -> asia", sessionOf("Tokyo"), "asia");
check("leer -> null", sessionOf(""), null);
check("unbekannt -> null", sessionOf("mittags"), null);

// --- Wochentag-Zuordnung (2026-07-06 = Montag) -------------------------------
const weekdays = timePatterns([
  t({ date: "2026-07-06" }), // Mo
  t({ date: "2026-07-07" }), // Di
  t({ date: "2026-07-01" }), // Mi
  t({ date: "2026-07-02" }), // Do
  t({ date: "2026-07-03" }), // Fr
  t({ date: "2026-07-04" }), // Sa -> raus
  t({ date: "2026-07-05" }), // So -> raus
]).weekday.map((b) => b.trades);
check("Mo–Fr je 1, Wochenende ignoriert", weekdays, [1, 1, 1, 1, 1]);

// --- Winrate + Sum R ---------------------------------------------------------
const wr = timePatterns([
  t({ date: "2026-07-06", result: "win", rMultiple: 2 }),
  t({ date: "2026-07-06", result: "win", rMultiple: 1.5 }),
  t({ date: "2026-07-06", result: "loss", rMultiple: -1 }),
]).weekday[0];
check("Montag Winrate 2/3 = 66.67", Number(wr.winRate!.toFixed(2)), 66.67);
check("Montag Sum R", Number(wr.totalR.toFixed(2)), 2.5);

const beOnly = timePatterns([
  t({ date: "2026-07-06", result: "breakeven", rMultiple: 0 }),
]).weekday[0];
check("reiner Breakeven -> Winrate null", beOnly.winRate, null);
check("reiner Breakeven -> 1 Trade", beOnly.trades, 1);

// --- Session-Buckets + ohne-Angabe ------------------------------------------
const sess = timePatterns([
  t({ session: "london" }),
  t({ session: "london" }),
  t({ session: "newyork" }),
  t({ session: "asia" }),
  t({ session: "" }), // ohne Angabe
]);
check(
  "Session-Buckets asia/london/newyork",
  sess.session.map((b) => [b.key, b.trades]),
  [["asia", 1], ["london", 2], ["newyork", 1]],
);
check("ohne Session gezählt", sess.withoutSession, 1);

// --- enough-Schwelle ---------------------------------------------------------
check("MIN = 5", MIN_PATTERN_TRADES, 5);
check("4 Trades -> nicht genug", timePatterns(Array.from({ length: 4 }, () => t({}))).enough, false);
check("5 Trades -> genug", timePatterns(Array.from({ length: 5 }, () => t({}))).enough, true);

// --- Backtest zählt nie ------------------------------------------------------
check(
  "Backtest-Zeilen ignoriert",
  timePatterns([t({ sessionType: "backtest" }), t({ sessionType: "live" })]).total,
  1,
);

// --- Konto-P&L ---------------------------------------------------------------
check("Gewinn 10 %", accountSummary({ currentBalance: 11000, initialStartBalance: 10000 }), { pnl: 1000, pnlPct: 10 });
check("Verlust 5 %", accountSummary({ currentBalance: 9500, initialStartBalance: 10000 }), { pnl: -500, pnlPct: -5 });
check("kein Startkapital -> pnlPct null", accountSummary({ currentBalance: 5000, initialStartBalance: 0 }), { pnl: 5000, pnlPct: null });

const a = (name: string): AccountConfig => ({ name, type: "ek", currency: "USD", initialStartBalance: 0, currentBalance: 0, defaultRiskPerTrade: 1 });
check(
  "allAccounts: EK vor Funded",
  allAccounts({ ek: null, funded: null, ekAccounts: [a("EK1")], fundedAccounts: [a("F1"), a("F2")] } as AccountConfigs).map((x) => x.name),
  ["EK1", "F1", "F2"],
);
check("allAccounts null -> []", allAccounts(null), []);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
