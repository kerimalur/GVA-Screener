/**
 * Trade-Cockpit — reine Lane-Assembly (keine I/O, damit isoliert prüfbar).
 *
 * Drei Lanes, eingeordnet nach dem gemeinsamen Vokabular aus
 * `lib/setup/lifecycle.ts`:
 *  - Nähert sich : Live-Scanner `PREPARE`, Distanz ≤ Schwelle (ephemer,
 *                  `naehert` — NICHT gespeichert, verschwindet von selbst)
 *  - Getroffen   : `getroffen` (signals.status = 'new', unentschieden)
 *  - In Arbeit   : `beobachtung` + `wartend` + `aktiv`
 *
 * Die Lane hiess früher „Wartend" und meinte damit das Gegenteil dessen, was
 * „Wartend" im Outlook bedeutet (dort: bewusste, bestehende Absicht). Deshalb
 * heisst sie jetzt „Nähert sich" — dasselbe Wort bedeutet überall dasselbe.
 *
 * Konfluenz = Stärke-Quintil-Ranking (pairBias) gegen die Linien-Richtung.
 * Nur `ausgefuehrt` (via „Genommen") landet im Journal → Winrate bleibt sauber.
 */
import { splitPair } from "@/lib/journal/fundamentals";
import { pairBias, biasReason } from "@/lib/ml/pairBias";
import { freshnessOf, type Freshness } from "@/lib/calc/realYield";
import { effectiveSetupStatus, type SetupStatus } from "@/lib/setup/lifecycle";
import type { MarketData } from "@/lib/gva/api";
import type { SignalRecord } from "@/lib/journal/signals";
import type { OutlookRecord } from "@/lib/journal/outlooks";

export const NAEHERT_PIP_LIMIT = 100;

/** Frische-Schwellen der Kopfzeile in MINUTEN (nicht Tagen wie bei Real Yield). */
export const SNAPSHOT_FRESH_MIN = 2;
export const SNAPSHOT_STALE_MIN = 5;

export type LaneId = "naehert" | "getroffen" | "inArbeit";
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
    baseQuintile: quintiles[base],
    quoteQuintile: quintiles[quote],
    confluence: confluenceOf(base, quote, lineDir, quintiles),
    stale: false, // HIT-Karten zeigen keine Live-Distanz
    detectedLate: s.detectedLate,
    lineFormedDate: s.lineFormedDate,
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
    baseQuintile: quintiles[base],
    quoteQuintile: quintiles[quote],
    confluence: confluenceOf(base, quote, lineDir, quintiles),
    stale: md.stale === true,
    detectedLate: md.detected_late === true,
    lineFormedDate:
      md.near === "SHORT" ? md.short_date : md.near === "LONG" ? md.long_date : null,
  };
}

/** In-Arbeit-Lane: alles, was angefasst, aber noch nicht abgeschlossen ist. */
const IN_ARBEIT: readonly SetupStatus[] = ["beobachtung", "wartend", "aktiv"];

/**
 * Baut die drei Lanes. `scanner` = Live `/api/screener`, `signals` = signals-Tabelle,
 * `quintiles` = Stärke-Quintil je Währung (Champion), `outlookBySignal` = die
 * verknüpften Outlooks (Index signal_id → Outlook, darf leer sein).
 * `pipLimit` steuert die Lane „Nähert sich".
 *
 * Eingeordnet wird nach dem VEREINHEITLICHTEN Status: ein Signal auf
 * 'watchlist', dessen Outlook auf `wartend` oder `aktiv` steht, bleibt in
 * „In Arbeit" und zeigt dort denselben Zustand wie der Outlook.
 */
export function assembleLanes(
  scanner: MarketData[],
  signals: SignalRecord[],
  quintiles: Record<string, number> = {},
  outlookBySignal: Record<string, OutlookRecord> = {},
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

  const byHitDesc = (a: CockpitCard, b: CockpitCard) =>
    (b.hitAt ?? "").localeCompare(a.hitAt ?? "");

  const karten = signals.map((s) => cardFromSignal(s, quintiles, outlookBySignal[s.id]));

  return {
    naehert,
    getroffen: karten.filter((c) => c.status === "getroffen").sort(byHitDesc),
    inArbeit: karten.filter((c) => IN_ARBEIT.includes(c.status)).sort(byHitDesc),
  };
}
