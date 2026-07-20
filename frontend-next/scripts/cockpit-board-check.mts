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
  zonesLabel,
  SNAPSHOT_FRESH_MIN,
  SNAPSHOT_STALE_MIN,
  WARMUP_GRACE_MS,
  type BoardStatusInput,
} from "../lib/cockpit/board";
import { toSnapshot, type MarketData } from "../lib/gva/api";
import type { SignalRecord } from "../lib/journal/signals";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`);
}

// --- Board-Zustand (Arbeitspaket C + Punkt 1) --------------------------------
const T0 = 1_700_000_000_000; // ms, Zeitpunkt des ersten erfolgreichen Fetches
const st = (over: Partial<BoardStatusInput> = {}) =>
  boardStateOf({
    loaded: true, offline: false, zones: 28, pairsTotal: 28,
    completeRun: true, firstFetchMs: T0, nowMs: T0, ...over,
  });

check("noch nichts geladen -> loading", st({ loaded: false, firstFetchMs: null }), "loading");
check("Backend nicht erreichbar -> offline", st({ offline: true }), "offline");
check("alle Zonen da -> ok", st(), "ok");
check("offline schlägt alles", st({ loaded: false, offline: true, zones: 3 }), "offline");

// Kaltstart: erster Zyklus läuft noch -> keine Lanes, "Backend startet"
check(
  "Kaltstart 6/28, kein Zyklus durch -> warmup",
  st({ zones: 6, completeRun: false }),
  "warmup",
);
// Punkt 1: ein dauerhaft kaputtes Pair darf das Board nicht blockieren
check(
  "Zyklus durch, 27/28 -> partial (Lanes werden gerendert)",
  st({ zones: 27 }),
  "partial",
);
check("Zyklus durch, 28/28 -> ok", st({ zones: 28 }), "ok");

// Sicherheitsnetz: altes Backend meldet zones_complete_run nicht
check(
  "ohne completeRun, innerhalb der Zeitgrenze -> warmup",
  st({ zones: 27, completeRun: false, nowMs: T0 + WARMUP_GRACE_MS - 1 }),
  "warmup",
);
check(
  "ohne completeRun, nach der Zeitgrenze -> partial",
  st({ zones: 27, completeRun: false, nowMs: T0 + WARMUP_GRACE_MS + 1 }),
  "partial",
);

// --- Kopfzeile: "startet" / "unvollständig" / "vollständig" ablesbar ---------
check("Label warmup", zonesLabel("warmup", 6, 28), "startet · Zonen 6/28");
check(
  "Label partial (Singular)",
  zonesLabel("partial", 27, 28),
  "nur 27/28 Pairs geladen — 1 Pair liefert keine Daten",
);
check(
  "Label partial (Plural)",
  zonesLabel("partial", 25, 28),
  "nur 25/28 Pairs geladen — 3 Pairs liefern keine Daten",
);
check("Label ok", zonesLabel("ok", 28, 28), "28/28 Pairs");
check("Label offline leer", zonesLabel("offline", 0, 28), "");

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
  pair: "EURUSD", price: 1.09, short: 1.1, short_date: "01.07.2026", long: null,
  long_date: null, status: "PREPARE", near: "SHORT", triggered: false, pending: false,
  distance: 40, last_touched: null, stale: false, detected_late: false, ...over,
});
const sig = (over: Partial<SignalRecord>): SignalRecord => ({
  id: "s1", source: "gva", pair: "GBPUSD", lineType: "long", lineLevel: 1.25,
  hitAt: "2026-07-20T10:00:00Z", fundamentalSnapshot: null, status: "new",
  createdAt: "2026-07-20T10:00:00Z", detectedLate: false, lineFormedDate: "2026-07-02",
  ...over,
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

// Punkt 5: Bildungsdatum landet auf beiden Kartenquellen
check("Wartend-Karte erbt short_date vom Scanner", lanes.wartend[0].lineFormedDate, "01.07.2026");
check("Aktiv-Karte erbt lineFormedDate aus signals", lanes.aktiv[0].lineFormedDate, "2026-07-02");

// --- Rückwärtskompatibilität des Screener-Vertrags ---------------------------
const legacy = toSnapshot([md({})]);
check("altes Array wird gehoben", [legacy.data.length, legacy.zones, legacy.live], [1, 1, true]);
check("altes Array hat keinen Zeitstempel", legacy.updated, null);
check("altes Array gilt als vollständiger Lauf", legacy.zonesCompleteRun, true);

// Aktuelle Antwortform (Commit 341d425, noch ohne zones_complete_run)
const zwischenstand = toSnapshot({ data: [md({})], updated: 1700, zones: 6, pairs_total: 28, live: false });
check(
  "Antwort ohne das neue Feld -> completeRun false",
  [zwischenstand.zones, zwischenstand.pairsTotal, zwischenstand.live, zwischenstand.zonesCompleteRun],
  [6, 28, false, false],
);

// Neue Antwortform
const modern = toSnapshot({
  data: [md({})], updated: 1700, zones: 27, pairs_total: 28, live: true,
  zones_complete_run: true, zones_runs: 4,
});
check("neuer Vertrag wird übernommen", [modern.zones, modern.zonesCompleteRun], [27, true]);
check("Müll-Antwort kippt nicht um", toSnapshot(null).data, []);
check("Müll-Antwort gilt nicht als vollständiger Lauf", toSnapshot(null).zonesCompleteRun, false);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
