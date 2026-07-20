// Kontrollwerte für das Trade-Cockpit: npx tsx scripts/cockpit-board-check.mts
//
// Deckt die reine Logik der Arbeitspakete A/C ab (keine I/O):
//   - Board-Zustand: Kaltstart ist NICHT "ok" (sonst sieht ein halb geladenes
//     Backend aus wie "diese Woche ist nichts los")
//   - Snapshot-Frische in Minuten über dasselbe freshnessOf wie Real Yield
//   - Karten tragen stale/detectedLate bis in die Lanes durch
//   - toSnapshot hebt auch die alte Array-Antwort auf den neuen Vertrag
import {
  assembleLanes,
  boardStateOf,
  snapshotFreshness,
  SNAPSHOT_FRESH_MIN,
  SNAPSHOT_STALE_MIN,
} from "../lib/cockpit/board";
import { toSnapshot, type MarketData } from "../lib/gva/api";
import type { SignalRecord } from "../lib/journal/signals";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

// --- Board-Zustand (Arbeitspaket C) ------------------------------------------
check("noch nichts geladen -> loading", boardStateOf(false, false, 0, 28), "loading");
check("Backend nicht erreichbar -> offline", boardStateOf(true, true, 28, 28), "offline");
check("Kaltstart 6/28 -> warmup", boardStateOf(true, false, 6, 28), "warmup");
check("alle Zonen da -> ok", boardStateOf(true, false, 28, 28), "ok");
check("offline schlägt warmup", boardStateOf(false, true, 3, 28), "offline");

// --- Snapshot-Frische (Minuten-Skala auf freshnessOf) ------------------------
const NOW = 1_700_000_000_000; // ms
const secAgo = (min: number) => (NOW - min * 60_000) / 1000;
check("30 s alt -> fresh", snapshotFreshness(secAgo(0.5), NOW), "fresh");
check(`${SNAPSHOT_FRESH_MIN} min alt -> fresh (Grenze inklusiv)`, snapshotFreshness(secAgo(2), NOW), "fresh");
check("3 min alt -> old (grau)", snapshotFreshness(secAgo(3), NOW), "old");
check(`${SNAPSHOT_STALE_MIN} min alt -> old (Grenze inklusiv)`, snapshotFreshness(secAgo(5), NOW), "old");
check("6 min alt -> dead (warn)", snapshotFreshness(secAgo(6), NOW), "dead");
check("kein Zeitstempel -> dead", snapshotFreshness(null, NOW), "dead");

// --- Lanes tragen die neuen Flags durch --------------------------------------
const md = (over: Partial<MarketData>): MarketData => ({
  pair: "EURUSD", price: 1.09, short: 1.1, short_date: null, long: null, long_date: null,
  status: "PREPARE", near: "SHORT", triggered: false, pending: false, distance: 40,
  last_touched: null, stale: false, detected_late: false, ...over,
});
const sig = (over: Partial<SignalRecord>): SignalRecord => ({
  id: "s1", source: "gva", pair: "GBPUSD", lineType: "long", lineLevel: 1.25,
  hitAt: "2026-07-20T10:00:00Z", fundamentalSnapshot: null, status: "new",
  createdAt: "2026-07-20T10:00:00Z", detectedLate: false, ...over,
});

const lanes = assembleLanes(
  [md({ stale: true }), md({ pair: "AUDUSD", triggered: true })],
  [sig({ detectedLate: true }), sig({ id: "s2", pair: "USDJPY", status: "watchlist" })],
  {},
);
check("Wartend zeigt nur nicht-getriggerte Pairs", lanes.wartend.map((c) => c.pair), ["EURUSD"]);
check("Wartend-Karte erbt stale -> '~' vor der Distanz", lanes.wartend[0].stale, true);
check("Aktiv-Karte trägt 'nachträglich erkannt'", lanes.aktiv[0].detectedLate, true);
check("In-Arbeit-Karte ohne Flag", lanes.inArbeit[0].detectedLate, false);
check("HIT-Karten zeigen keine Live-Distanz", lanes.aktiv[0].stale, false);

// --- Rückwärtskompatibilität des Screener-Vertrags ---------------------------
const legacy = toSnapshot([md({})]);
check("altes Array wird gehoben", [legacy.data.length, legacy.zones, legacy.live], [1, 1, true]);
check("altes Array hat keinen Zeitstempel", legacy.updated, null);

const modern = toSnapshot({ data: [md({})], updated: 1700, zones: 6, pairs_total: 28, live: false });
check("neuer Vertrag wird übernommen", [modern.zones, modern.pairsTotal, modern.live], [6, 28, false]);
check("Müll-Antwort kippt nicht um", toSnapshot(null).data, []);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
