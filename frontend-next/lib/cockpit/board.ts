/**
 * Trade-Cockpit — reine Lane-Assembly (keine I/O, damit isoliert prüfbar).
 *
 * Drei Lanes aus vorhandenen Quellen zusammengesetzt:
 *  - Wartend   : Live-Scanner `PREPARE`, Distanz ≤ Schwelle (ephemer)
 *  - Aktiv     : signals.status = 'new'  (frischer GVA-HIT, unentschieden)
 *  - In Arbeit : signals.status = 'watchlist' (beobachtet)
 *
 * Konfluenz = Stärke-Quintil-Ranking (pairBias) gegen die Linien-Richtung.
 * Nur `journaled` (via „Genommen") landet im Journal → Winrate bleibt sauber.
 */
import { splitPair } from "@/lib/journal/fundamentals";
import { pairBias, biasReason } from "@/lib/ml/pairBias";
import { freshnessOf, type Freshness } from "@/lib/calc/realYield";
import type { MarketData } from "@/lib/gva/api";
import type { SignalRecord } from "@/lib/journal/signals";

export const WARTEND_PIP_LIMIT = 100;

/** Frische-Schwellen der Kopfzeile in MINUTEN (nicht Tagen wie bei Real Yield). */
export const SNAPSHOT_FRESH_MIN = 2;
export const SNAPSHOT_STALE_MIN = 5;

export type LaneId = "wartend" | "aktiv" | "inArbeit";
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
  /** nur Wartend: Pip-Distanz zur Linie */
  distance: number | null;
  /** nur Aktiv/In-Arbeit: ISO-Zeit des HITs */
  hitAt: string | null;
  /** gesetzt = Karte stammt aus der signals-Tabelle (Aktionen möglich) */
  signalId: string | null;
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
  wartend: CockpitCard[];
  aktiv: CockpitCard[];
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

function cardFromSignal(s: SignalRecord, quintiles: Record<string, number>): CockpitCard {
  const { base, quote } = splitPair(s.pair);
  const lineDir = toLineDir(s.lineType);
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
 * Baut die drei Lanes. `scanner` = Live `/api/screener`, `signals` = signals-Tabelle,
 * `quintiles` = Stärke-Quintil je Währung (Champion). `pipLimit` steuert Wartend.
 */
export function assembleLanes(
  scanner: MarketData[],
  signals: SignalRecord[],
  quintiles: Record<string, number> = {},
  pipLimit: number = WARTEND_PIP_LIMIT,
): CockpitLanes {
  const wartend = scanner
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

  const aktiv = signals
    .filter((s) => s.status === "new")
    .map((s) => cardFromSignal(s, quintiles))
    .sort(byHitDesc);

  const inArbeit = signals
    .filter((s) => s.status === "watchlist")
    .map((s) => cardFromSignal(s, quintiles))
    .sort(byHitDesc);

  return { wartend, aktiv, inArbeit };
}
