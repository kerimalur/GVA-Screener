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
  cardForOutlook,
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
import type { OutlookRecord } from "../lib/journal/outlooks";

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
check("«Nähert sich» zeigt nur nicht-getriggerte Pairs", lanes.naehert.map((c) => c.pair), ["EURUSD"]);
check("«Nähert sich»-Karte erbt stale -> '~' vor der Distanz", lanes.naehert[0].stale, true);
check("Getroffen-Karte trägt 'nachträglich erkannt'", lanes.getroffen[0].detectedLate, true);
// 'watchlist' im Signal = `beobachtung` und liegt seit dem Modus-Umbau in der
// eigenen Watchlist-Lane: „gesehen" und „Einstieg definiert" sind zwei Dinge.
check("Watchlist-Karte ohne Flag", lanes.watchlist[0].detectedLate, false);
check("In Arbeit bleibt leer, solange nichts vorbereitet ist", lanes.inArbeit.length, 0);
check("HIT-Karten zeigen keine Live-Distanz", lanes.getroffen[0].stale, false);

// Punkt 5: Bildungsdatum landet auf beiden Kartenquellen
check("«Nähert sich» erbt short_date vom Scanner", lanes.naehert[0].lineFormedDate, "01.07.2026");
check("Getroffen-Karte erbt lineFormedDate aus signals", lanes.getroffen[0].lineFormedDate, "2026-07-02");

// --- Vereinheitlichter Status + Outlook-Anreicherung -------------------------
const out = (over: Partial<OutlookRecord>): OutlookRecord => ({
  id: "o1", symbol: "USDJPY", direction: "long", thesis: "", confidence: 3,
  status: "observation", signalId: "s2", source: "gva", ...over,
});

// Ein Signal auf 'watchlist' mit Outlook auf 'active' bleibt in "In Arbeit"
// und zeigt dort den feineren Zustand des Outlooks.
const angereichert = assembleLanes(
  [],
  [sig({ id: "s2", pair: "USDJPY", status: "watchlist" })],
  {},
  {
    s2: out({
      status: "active",
      thesis: "Rücklauf in die Zone",
      isStarred: true,
      strategyChecklist: [
        { ruleId: "r1", text: "BOS", checked: true },
        { ruleId: "r2", text: "Session", checked: true },
        { ruleId: "r3", text: "Konfluenz", checked: false },
      ],
    }),
  },
);
check("Outlook 'active' bleibt in der In-Arbeit-Lane", angereichert.inArbeit.length, 1);
check("Karte übernimmt den feineren Outlook-Zustand", angereichert.inArbeit[0].status, "aktiv");
check("Karte kennt den verknüpften Outlook", angereichert.inArbeit[0].outlookId, "o1");
check("Stern wandert ins Cockpit", angereichert.inArbeit[0].isStarred, true);
check("These wird als vorhanden gemeldet", angereichert.inArbeit[0].hasThesis, true);
check(
  "Checklisten-Fortschritt landet auf der Karte",
  [angereichert.inArbeit[0].checklistDone, angereichert.inArbeit[0].checklistTotal],
  [2, 3],
);

// Signal ohne Outlook (Altbestand): Cockpit funktioniert, Anreicherung entfällt
const ohneOutlook = assembleLanes([], [sig({ id: "s3", status: "watchlist" })], {}, {});
check("Altbestand landet trotzdem in der Lane", ohneOutlook.watchlist.length, 1);
check("Altbestand ohne Outlook-Verknüpfung", ohneOutlook.watchlist[0].outlookId, null);
check("Altbestand fällt auf den Signal-Zustand zurück", ohneOutlook.watchlist[0].status, "beobachtung");
check("Scanner-Karten sind ephemer -> 'naehert'", lanes.naehert[0].status, "naehert");

// --- Manuelle Setups: zweite Kartenquelle, dieselben Lanes ------------------
// Vorher zeigte das Cockpit ausschliesslich Setups aus einem GVA-Hit — wer
// nach einer anderen Strategie von Hand erfasste, sah davon hier nichts.
const man = (over: Partial<OutlookRecord>): OutlookRecord => ({
  id: "m1", symbol: "EURJPY", direction: "short", thesis: "", confidence: 3,
  status: "observation", signalId: null, source: "manual",
  createdAt: "2026-07-21T08:00:00Z", ...over,
});

const gemischt = assembleLanes(
  [],
  [sig({ id: "s9", pair: "GBPUSD", status: "new" })],
  {},
  {},
  [
    man({ interestingZone: 168.4 }),
    man({ id: "m2", symbol: "AUDUSD", status: "waiting" }),
    man({ id: "m3", symbol: "NZDUSD", status: "active" }),
    // abgeschlossen -> fällt raus, genau wie ein 'journaled' Signal
    man({ id: "m4", symbol: "USDCAD", status: "executed" }),
    man({ id: "m5", symbol: "USDCHF", status: "cancelled" }),
  ],
);
check("manuelles Setup landet ohne Signal in der Watchlist", gemischt.watchlist.map((c) => c.pair), ["EURJPY"]);
check("manuelle Karte trägt das Badge", gemischt.watchlist[0].manual, true);
check("GVA-Karte trägt es nicht", gemischt.getroffen[0].manual, false);
check("Level kommt aus der interessanten Zone", gemischt.watchlist[0].lineLevel, 168.4);
check("Richtung aus dem Outlook", gemischt.watchlist[0].lineDir, "short");
check("Karte kennt ihren Outlook (Klickziel)", gemischt.watchlist[0].outlookId, "m1");
check("manuelle Karte hat kein Signal", gemischt.watchlist[0].signalId, null);
check(
  "wartend/aktiv wandern nach «In Arbeit»",
  gemischt.inArbeit.map((c) => [c.pair, c.status]),
  // gleicher createdAt -> stabile Reihenfolge der Eingabe
  [["AUDUSD", "wartend"], ["NZDUSD", "aktiv"]],
);
check("abgeschlossene manuelle Setups fallen raus", gemischt.watchlist.length + gemischt.inArbeit.length, 3);

// Ein manueller Outlook, der doch an einem Signal hängt, darf nicht doppelt
// im Board stehen — die Signal-Karte trägt den Lebenszyklus.
const doppelt = assembleLanes(
  [],
  [sig({ id: "s9", pair: "GBPUSD", status: "new" })],
  {},
  {},
  [man({ id: "m9", symbol: "GBPUSD", signalId: "s9" })],
);
check("kein Doppel-Eintrag bei verknüpftem Signal", doppelt.getroffen.length + doppelt.watchlist.length, 1);

// --- Detailebene: Karte zu EINEM Outlook -------------------------------------
const detailManuell = cardForOutlook(man({}), undefined, {});
check("Detail-Karte eines manuellen Setups", [detailManuell.pair, detailManuell.manual], ["EURJPY", true]);
const detailGva = cardForOutlook(
  out({ id: "o7", symbol: "GBPUSD", signalId: "s7" }),
  sig({ id: "s7", pair: "GBPUSD", status: "new" }),
  {},
);
check("Detail-Karte mit Signal erbt den HIT", detailGva.hitAt, "2026-07-20T10:00:00Z");
check("Detail-Karte mit Signal ist nicht manuell", detailGva.manual, false);

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
