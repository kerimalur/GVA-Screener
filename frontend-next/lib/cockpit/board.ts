/**
 * Trade-Cockpit — reine Lane-Assembly (keine I/O, damit isoliert prüfbar).
 *
 * Vier Lanes, eingeordnet nach dem gemeinsamen Vokabular aus
 * `lib/setup/lifecycle.ts`:
 *  - Nähert sich : Live-Scanner `PREPARE`, Distanz ≤ Schwelle (ephemer,
 *                  `naehert` — NICHT gespeichert, verschwindet von selbst)
 *  - Getroffen   : `getroffen` (signals.status = 'new', unentschieden)
 *  - Watchlist   : `beobachtung` — gesehen, aber noch nichts vorbereitet
 *  - In Arbeit   : `wartend` + `aktiv`
 *
 * Die Lane hiess früher „Wartend" und meinte damit das Gegenteil dessen, was
 * „Wartend" im Outlook bedeutet (dort: bewusste, bestehende Absicht). Deshalb
 * heisst sie jetzt „Nähert sich" — dasselbe Wort bedeutet überall dasselbe.
 *
 * **Zwei Herkünfte, dieselben Lanes.** Bis zum Modus-Umbau zeigte das Cockpit
 * nur Setups aus einem GVA-Hit; wer nach einer anderen Strategie ein Setup von
 * Hand erfasste, sah es hier nie — das Cockpit war damit nicht die Übersicht,
 * die es zu sein behauptete. Manuelle Outlooks (`source='manual'`, ohne
 * `signal_id`) laufen jetzt durch dieselbe Einsortierung und tragen nur ein
 * eigenes Badge. Bewusst KEINE eigene Lane: die Herkunft ist eine Eigenschaft
 * des Setups, kein eigener Zustand.
 *
 * Konfluenz = Stärke-Quintil-Ranking (pairBias) gegen die Linien-Richtung.
 * Nur `ausgefuehrt` (via „Genommen") landet im Journal → Winrate bleibt sauber.
 */
import { splitPair } from "@/lib/journal/fundamentals";
import { pairBias, biasReason } from "@/lib/ml/pairBias";
import { freshnessOf, type Freshness } from "@/lib/calc/realYield";
import {
  effectiveSetupStatus,
  fromOutlookStatus,
  isClosedSetup,
  type SetupStatus,
} from "@/lib/setup/lifecycle";
import type { MarketData } from "@/lib/gva/api";
import type { SignalRecord } from "@/lib/journal/signals";
import type { OutlookRecord } from "@/lib/journal/outlooks";

export const NAEHERT_PIP_LIMIT = 100;

/** Frische-Schwellen der Kopfzeile in MINUTEN (nicht Tagen wie bei Real Yield). */
export const SNAPSHOT_FRESH_MIN = 2;
export const SNAPSHOT_STALE_MIN = 5;

export type LaneId = "naehert" | "getroffen" | "watchlist" | "inArbeit";
export type LineDir = "long" | "short";
export type Verdict = "rueckenwind" | "gegenwind" | "neutral";

export interface Confluence {
  verdict: Verdict;
  /** Kurzbegründung aus den Extrem-Quintilen, z.B. "AUD Q5 · USD Q1". */
  reason: string;
}

export interface CockpitCard {
  /** stabiler React-Key */
  key: string;
  pair: string; // "EURUSD"
  base: string; // "EUR"
  quote: string; // "USD"
  lineDir: LineDir | null;
  lineLevel: number | null;
  /** nur „Nähert sich": Pip-Distanz zur Linie */
  distance: number | null;
  /** nur Getroffen/In-Arbeit: ISO-Zeit des HITs */
  hitAt: string | null;
  /** gesetzt = Karte stammt aus der signals-Tabelle (Aktionen möglich) */
  signalId: string | null;
  /** Vereinheitlichter Zustand — dieselbe Sprache wie im Outlook. */
  status: SetupStatus;
  /** Verknüpfter Outlook, sofern vorhanden (Altbestand hat keinen). */
  outlookId: string | null;
  /**
   * true = von Hand erfasstes Setup (`outlooks.source = 'manual'`), es gibt
   * keinen GVA-Hit dahinter. Steuert nur das Badge — Lane und Lebenszyklus
   * sind dieselben wie bei einem GVA-Setup.
   */
  manual: boolean;
  /** Anlage-Zeitpunkt des Outlooks; sortiert Karten ohne HIT-Zeitstempel. */
  createdAt: string | null;
  /** Anreicherung aus dem Outlook — entfällt still, wenn keiner verknüpft ist. */
  isStarred: boolean;
  hasThesis: boolean;
  checklistDone: number;
  checklistTotal: number;
  baseQuintile: number | undefined;
  quoteQuintile: number | undefined;
  confluence: Confluence;
  /** true = Pip-Distanz basiert auf dem Tagesschluss, nicht auf einem Live-Preis. */
  stale: boolean;
  /** true = HIT wurde nachträglich aus der Kerzen-Historie erkannt (Downtime). */
  detectedLate: boolean;
  /**
   * Tag der Linien-Bildung. Aus dem Scanner als 'DD.MM.YYYY', aus der
   * signals-Tabelle als ISO — die Anzeige normalisiert beides.
   * null bei Altzeilen, die das Feld noch nicht kennen.
   */
  lineFormedDate: string | null;
}

export interface CockpitLanes {
  naehert: CockpitCard[];
  getroffen: CockpitCard[];
  watchlist: CockpitCard[];
  inArbeit: CockpitCard[];
}

/**
 * Zustand des Boards.
 *
 * `warmup` ist bewusst NICHT `ok`: beim Kaltstart hat das Backend erst einen
 * Teil der Zonen berechnet — drei leere Lanes würden dann wie „diese Woche ist
 * nichts los" aussehen statt wie „startet noch".
 *
 * `partial` ist die Gegenprobe dazu: Der Kaltstart ist durch, aber einzelne
 * Pairs liefern dauerhaft keine Daten (OANDA-Fehler, Instrument-Problem).
 * `compute_zones` überspringt solche Pairs, `ZONES` bekommt nie einen Eintrag —
 * ohne diesen Zustand würde EIN kaputtes Pair das Board für immer auf
 * „Backend startet (Zonen 27/28)" nageln und die 27 funktionierenden Pairs
 * unsichtbar machen. Lanes werden gerendert, der Hinweis bleibt stehen.
 */
export type BoardState = "loading" | "warmup" | "offline" | "partial" | "ok";

/**
 * Sicherheitsnetz, falls `zonesCompleteRun` ausbleibt (altes Backend während
 * eines Deploy-Fensters): so lange nach dem ersten erfolgreichen Fetch darf
 * `warmup` stehen, danach wird mit Hinweis gerendert.
 */
export const WARMUP_GRACE_MS = 3 * 60_000;

export interface BoardStatusInput {
  /** mindestens ein Fetch war erfolgreich */
  loaded: boolean;
  offline: boolean;
  zones: number;
  pairsTotal: number;
  /** Backend meldet mindestens einen abgeschlossenen Zonen-Refresh */
  completeRun: boolean;
  /** ms-Zeitstempel des ersten erfolgreichen Fetches, null solange keiner war */
  firstFetchMs: number | null;
  nowMs?: number;
}

export function boardStateOf({
  loaded,
  offline,
  zones,
  pairsTotal,
  completeRun,
  firstFetchMs,
  nowMs = Date.now(),
}: BoardStatusInput): BoardState {
  if (offline) return "offline";
  if (!loaded) return "loading";
  if (zones >= pairsTotal) return "ok";
  // Unvollständig: nur solange der erste Zyklus plausibel noch läuft, gilt das
  // als Kaltstart. Danach sind die vorhandenen Pairs mehr wert als das Warten.
  if (completeRun) return "partial";
  if (firstFetchMs !== null && nowMs - firstFetchMs > WARMUP_GRACE_MS) return "partial";
  return "warmup";
}

/** Kopfzeilen-Text zum Zonen-Stand — muss jederzeit ablesbar sein. */
export function zonesLabel(state: BoardState, zones: number, pairsTotal: number): string {
  if (state === "warmup") return `startet · Zonen ${zones}/${pairsTotal}`;
  if (state === "partial") {
    const fehlend = Math.max(0, pairsTotal - zones);
    const subjekt = fehlend === 1 ? "1 Pair liefert" : `${fehlend} Pairs liefern`;
    return `nur ${zones}/${pairsTotal} Pairs geladen — ${subjekt} keine Daten`;
  }
  if (state === "ok") return `${zones}/${pairsTotal} Pairs`;
  return "";
}

/**
 * Frische des Snapshots für die Kopfzeile — dieselbe Einstufung wie im
 * Real-Yield-View, nur mit Minuten-Schwellen: ≤2 min frisch, ≤5 min alt,
 * darüber (oder ohne Zeitstempel) tot.
 */
export function snapshotFreshness(
  updatedSec: number | null,
  nowMs: number = Date.now(),
): Freshness {
  if (updatedSec == null) return "dead";
  const ageMin = (nowMs - updatedSec * 1000) / 60_000;
  return freshnessOf(ageMin, SNAPSHOT_FRESH_MIN, SNAPSHOT_STALE_MIN);
}

function toLineDir(v: string | null | undefined): LineDir | null {
  if (!v) return null;
  const s = v.toLowerCase();
  return s === "long" ? "long" : s === "short" ? "short" : null;
}

/** Ranking-Bias (Q5/Q1) gegen die Linien-Richtung → Rückenwind / Gegenwind. */
export function confluenceOf(
  base: string,
  quote: string,
  lineDir: LineDir | null,
  quintiles: Record<string, number>,
): Confluence {
  const bq = quintiles[base];
  const qq = quintiles[quote];
  const bias = pairBias(bq, qq); // "long" | "short" | "neutral"
  const reason = biasReason(base, quote, bq, qq);
  let verdict: Verdict = "neutral";
  if (lineDir && bias !== "neutral") {
    verdict = bias === lineDir ? "rueckenwind" : "gegenwind";
  }
  return { verdict, reason };
}

function cardFromSignal(
  s: SignalRecord,
  quintiles: Record<string, number>,
  outlook: OutlookRecord | undefined,
): CockpitCard {
  const { base, quote } = splitPair(s.pair);
  const lineDir = toLineDir(s.lineType);
  const checklist = outlook?.strategyChecklist ?? [];
  return {
    key: s.id,
    pair: s.pair,
    base,
    quote,
    lineDir,
    lineLevel: Number.isFinite(s.lineLevel) ? s.lineLevel : null,
    distance: null,
    hitAt: s.hitAt,
    signalId: s.id,
    status: effectiveSetupStatus(s.status, outlook?.status),
    outlookId: outlook?.id ?? null,
    isStarred: outlook?.isStarred === true,
    hasThesis: (outlook?.thesis ?? "").trim().length > 0,
    checklistDone: checklist.filter((i) => i.checked).length,
    checklistTotal: checklist.length,
    manual: false,
    createdAt: s.createdAt,
    baseQuintile: quintiles[base],
    quoteQuintile: quintiles[quote],
    confluence: confluenceOf(base, quote, lineDir, quintiles),
    stale: false, // HIT-Karten zeigen keine Live-Distanz
    detectedLate: s.detectedLate,
    lineFormedDate: s.lineFormedDate,
  };
}

/**
 * Karte aus einem von Hand erfassten Outlook. Es gibt kein Signal, also auch
 * keinen HIT-Zeitpunkt, keine Pip-Distanz und kein Bildungsdatum — die Richtung
 * und das Level kommen aus dem Outlook selbst.
 *
 * Der Zustand wird NICHT neu erfunden: `fromOutlookStatus` ist dieselbe
 * Übersetzung, die auch `effectiveSetupStatus` für verknüpfte Outlooks nutzt.
 */
function cardFromOutlook(o: OutlookRecord, quintiles: Record<string, number>): CockpitCard {
  const { base, quote } = splitPair(o.symbol);
  const lineDir = toLineDir(o.direction);
  const checklist = o.strategyChecklist ?? [];
  const level = o.interestingZone ?? o.targetEntry ?? null;
  return {
    key: `m-${o.id}`,
    pair: o.symbol,
    base,
    quote,
    lineDir,
    lineLevel: level != null && Number.isFinite(level) ? level : null,
    distance: null,
    hitAt: null,
    signalId: o.signalId ?? null,
    status: fromOutlookStatus(o.status),
    outlookId: o.id ?? null,
    manual: true,
    createdAt: o.createdAt ?? null,
    isStarred: o.isStarred === true,
    hasThesis: (o.thesis ?? "").trim().length > 0,
    checklistDone: checklist.filter((i) => i.checked).length,
    checklistTotal: checklist.length,
    baseQuintile: quintiles[base],
    quoteQuintile: quintiles[quote],
    confluence: confluenceOf(base, quote, lineDir, quintiles),
    stale: false,
    detectedLate: false,
    lineFormedDate: null,
  };
}

function cardFromScanner(md: MarketData, quintiles: Record<string, number>): CockpitCard {
  const { base, quote } = splitPair(md.pair);
  const lineDir = toLineDir(md.near);
  const lineLevel = md.near === "SHORT" ? md.short : md.near === "LONG" ? md.long : null;
  return {
    key: `w-${md.pair}`,
    pair: md.pair,
    base,
    quote,
    lineDir,
    lineLevel,
    distance: md.distance,
    hitAt: null,
    signalId: null,
    // Ephemer: es gibt weder Signal noch Outlook — deshalb `naehert` und keine
    // Anreicherung. Die Karte verschwindet von selbst, wenn der Preis weglaeuft.
    status: "naehert",
    outlookId: null,
    isStarred: false,
    hasThesis: false,
    checklistDone: 0,
    checklistTotal: 0,
    manual: false,
    createdAt: null,
    baseQuintile: quintiles[base],
    quoteQuintile: quintiles[quote],
    confluence: confluenceOf(base, quote, lineDir, quintiles),
    stale: md.stale === true,
    detectedLate: md.detected_late === true,
    lineFormedDate:
      md.near === "SHORT" ? md.short_date : md.near === "LONG" ? md.long_date : null,
  };
}

/**
 * Karte zu EINEM Outlook — für die Detailansicht unter `/journal/outlook`.
 *
 * Bewusst dieselben Fabriken wie im Board: die Detailseite darf Verdikt,
 * Quintile und Linien-Info nicht anders herleiten als die Karte, von der aus
 * man sie geöffnet hat. Mit verknüpftem Signal gewinnt die Signal-Karte (sie
 * trägt HIT-Zeitpunkt und Bildungsdatum), sonst die Outlook-Karte.
 */
export function cardForOutlook(
  outlook: OutlookRecord,
  signal: SignalRecord | undefined,
  quintiles: Record<string, number> = {},
): CockpitCard {
  return signal
    ? cardFromSignal(signal, quintiles, outlook)
    : cardFromOutlook(outlook, quintiles);
}

/**
 * In-Arbeit-Lane: konkret vorbereitet oder laufend. `beobachtung` gehört
 * bewusst NICHT mehr dazu — „gesehen" und „Einstieg definiert" sind zwei
 * verschiedene Dinge, und in einer gemeinsamen Bahn verschwand der Unterschied.
 */
const IN_ARBEIT: readonly SetupStatus[] = ["wartend", "aktiv"];

/**
 * Baut die vier Lanes. `scanner` = Live `/api/screener`, `signals` =
 * signals-Tabelle, `quintiles` = Stärke-Quintil je Währung (Champion),
 * `outlookBySignal` = die verknüpften Outlooks (Index signal_id → Outlook,
 * darf leer sein), `manualOutlooks` = von Hand erfasste Setups.
 * `pipLimit` steuert die Lane „Nähert sich".
 *
 * Eingeordnet wird nach dem VEREINHEITLICHTEN Status: ein Signal auf
 * 'watchlist', dessen Outlook auf `wartend` oder `aktiv` steht, wandert nach
 * „In Arbeit" und zeigt dort denselben Zustand wie der Outlook.
 *
 * Abgeschlossene manuelle Setups (`ausgefuehrt` / `verworfen`) fallen raus —
 * dieselbe Regel, nach der die Signal-Abfrage nur 'new' und 'watchlist' lädt.
 */
export function assembleLanes(
  scanner: MarketData[],
  signals: SignalRecord[],
  quintiles: Record<string, number> = {},
  outlookBySignal: Record<string, OutlookRecord> = {},
  manualOutlooks: OutlookRecord[] = [],
  pipLimit: number = NAEHERT_PIP_LIMIT,
): CockpitLanes {
  const naehert = scanner
    .filter(
      (md) =>
        md.status === "PREPARE" &&
        !md.triggered &&
        md.near != null &&
        md.distance != null &&
        md.distance <= pipLimit,
    )
    .map((md) => cardFromScanner(md, quintiles))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  /** HIT-Zeit, ersatzweise Anlage-Zeit — manuelle Karten haben keinen HIT. */
  const byRecentDesc = (a: CockpitCard, b: CockpitCard) =>
    (b.hitAt ?? b.createdAt ?? "").localeCompare(a.hitAt ?? a.createdAt ?? "");

  const ausSignalen = signals.map((s) =>
    cardFromSignal(s, quintiles, outlookBySignal[s.id]),
  );

  // Ein manueller Outlook, der doch an einem Signal hängt, wäre sonst zweimal
  // im Board — die Signal-Karte gewinnt, sie trägt den Lebenszyklus.
  const signalIds = new Set(signals.map((s) => s.id));
  const ausOutlooks = manualOutlooks
    .filter((o) => o.id && !(o.signalId && signalIds.has(o.signalId)))
    .map((o) => cardFromOutlook(o, quintiles))
    .filter((c) => !isClosedSetup(c.status));

  const karten = [...ausSignalen, ...ausOutlooks];

  return {
    naehert,
    getroffen: karten.filter((c) => c.status === "getroffen").sort(byRecentDesc),
    watchlist: karten.filter((c) => c.status === "beobachtung").sort(byRecentDesc),
    inArbeit: karten.filter((c) => IN_ARBEIT.includes(c.status)).sort(byRecentDesc),
  };
}
