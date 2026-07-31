// Client-seitiger Zugriff auf das GVA-FastAPI-Backend (Render).
// Datenvertrag identisch zu Backend GET /api/screener — NICHT ändern ohne Backend-Abgleich.

/** Timeframe, auf dem die GVA entstanden ist. Altes Backend liefert das Feld
 *  nicht → als "3D" behandeln (bis Juli 2026 gab es nur 3D). */
export type GvaTf = "3D" | "W";

export interface LastTouched {
  type: "SHORT" | "LONG";
  level: number;
  date: string;
  touched_date: string;
  tf?: GvaTf;
}

/** Eine geformte, noch aktive GVA-Linie (Detail-Popup: letzte Setups). */
export interface RecentGva {
  type: "SHORT" | "LONG";
  level: number;
  date: string; // 'DD.MM.YYYY'
  tf?: GvaTf;
}

export interface MarketData {
  pair: string;
  price: number;
  short: number | null;
  short_date: string | null;
  short_tf: GvaTf | null;
  long: number | null;
  long_date: string | null;
  long_tf: GvaTf | null;
  status: "HIT" | "PREPARE" | "NEUTRAL";
  near: "SHORT" | "LONG" | null;
  triggered: boolean;
  pending: boolean;
  distance: number | null;
  last_touched: LastTouched | null;
  /** true = Preis kommt vom letzten Tagesschluss, nicht von OANDA (Karte zeigt „~"). */
  stale: boolean;
  /** true = HIT wurde nachträglich aus der Kerzen-Historie erkannt (Downtime). */
  detected_late: boolean;
  /** Letzte 3 geformte, noch aktive GVA-Linien (neueste zuerst). Altes Backend
   *  liefert das Feld nicht → undefined; die Historie zeigt dann einen Hinweis. */
  recent_gvas?: RecentGva[];
}

/** Antwort von GET /api/screener — inkl. Zustandskontext (Arbeitspaket C). */
export interface ScreenerSnapshot {
  data: MarketData[];
  /** Unix-Sekunden des letzten Snapshots, null solange keiner gebaut wurde. */
  updated: number | null;
  /** Berechnete Zonen. */
  zones: number;
  pairsTotal: number;
  /** false = OANDA-Pricing ausgefallen, gerechnet wird mit dem Tagesschluss. */
  live: boolean;
  /**
   * true = das Backend hat mindestens einen vollständigen Zonen-Refresh hinter
   * sich. Erst damit ist `zones < pairsTotal` als Datenproblem einzelner Pairs
   * lesbar und nicht mehr als Kaltstart. Altes Backend liefert das Feld nicht
   * → false, das Zeitfenster in `boardStateOf` fängt den Fall ab.
   */
  zonesCompleteRun: boolean;
}

/** Alle vom Backend gescannten Pairs (Fallback, wenn das Backend es nicht meldet). */
export const PAIRS_TOTAL = 28;

export type RadarType = "hit-short" | "hit-long" | "short" | "long" | "neutral";

const API_URL = (
  process.env.NEXT_PUBLIC_GVA_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

/* eslint-disable @typescript-eslint/no-explicit-any -- rohe Backend-Antwort */
/**
 * Normalisiert die Backend-Antwort. Ältere Backend-Versionen lieferten das
 * rohe Array — während eines Deploy-Fensters darf das Frontend daran nicht
 * zerbrechen, also wird es hier auf den neuen Vertrag gehoben.
 */
export function toSnapshot(raw: any): ScreenerSnapshot {
  if (Array.isArray(raw)) {
    // Uraltes Backend: rohes Array, kein Zustandskontext. Als vollständiger
    // Lauf werten — mehr weiss diese Antwortform nicht her, und ein ewiges
    // „startet noch" wäre schlechter als die Lanes zu zeigen.
    const data = raw as MarketData[];
    return {
      data,
      updated: null,
      zones: data.length,
      pairsTotal: PAIRS_TOTAL,
      live: true,
      zonesCompleteRun: data.length > 0,
    };
  }
  const data: MarketData[] = Array.isArray(raw?.data) ? raw.data : [];
  return {
    data,
    updated: typeof raw?.updated === "number" ? raw.updated : null,
    zones: typeof raw?.zones === "number" ? raw.zones : data.length,
    pairsTotal: typeof raw?.pairs_total === "number" ? raw.pairs_total : PAIRS_TOTAL,
    live: raw?.live !== false,
    zonesCompleteRun: raw?.zones_complete_run === true,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchScreener(): Promise<ScreenerSnapshot> {
  const response = await fetch(`${API_URL}/api/screener`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return toSnapshot(await response.json());
}

export interface Candle {
  time: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * OHLC-Kerzen eines Pairs ab `since` (Signal-Start, ISO 'YYYY-MM-DD') für den
 * Performance-Chart im Währungs-Ranking. `granularity` 'D' = Tag, 'W' = Woche.
 * Quelle OANDA (Backend reused die warme Tageskerzen-Cache des Scanners).
 */
export async function fetchCandles(
  pair: string,
  granularity: "D" | "W",
  since: string,
): Promise<Candle[]> {
  const res = await fetch(
    `${API_URL}/api/candles?pair=${encodeURIComponent(pair)}` +
      `&granularity=${granularity}&since=${encodeURIComponent(since)}`,
    { signal: AbortSignal.timeout(CANDLE_TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.candles) ? (json.candles as Candle[]) : [];
}

/** Harte Obergrenze für Kerzen-Requests. Ohne Timeout hängt ein kaltes/lahmes
 *  Render den SSR-Render bzw. den Spinner unbegrenzt („lädt ewig"). */
const CANDLE_TIMEOUT_MS = 25_000;

/**
 * Kerzen mehrerer Pairs in EINEM Request (Backend `/api/candles/batch`).
 * Jedes Pair bringt seinen eigenen Signal-Start mit. Rückgabe je Symbol
 * (ohne „/") beide Granularitäten — genau das, was das Performance-Panel
 * vorlädt. Einzelrequests je Pair/Granularität waren auf Render zu langsam.
 */
export async function fetchCandlesBatch(
  items: { symbol: string; since: string }[],
): Promise<Record<string, { D: Candle[]; W: Candle[] }>> {
  if (items.length === 0) return {};
  const spec = items.map((i) => `${i.symbol}:${i.since}`).join(",");
  const res = await fetch(
    `${API_URL}/api/candles/batch?pairs=${encodeURIComponent(spec)}`,
    { signal: AbortSignal.timeout(CANDLE_TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const json = await res.json();
  const out: Record<string, { D: Candle[]; W: Candle[] }> = {};
  for (const [sym, v] of Object.entries((json?.pairs ?? {}) as Record<string, unknown>)) {
    const e = v as { D?: unknown; W?: unknown };
    out[sym] = {
      D: Array.isArray(e?.D) ? (e.D as Candle[]) : [],
      W: Array.isArray(e?.W) ? (e.W as Candle[]) : [],
    };
  }
  return out;
}

/**
 * Schliesst den Lebenszyklus im Backend: 'done' verbraucht die Linie (Pair ist
 * danach nicht mehr TRIGGERED, der nächste Hit auf die nächste Linie alarmiert
 * wieder), 'pending' setzt sie auf beobachtet.
 *
 * Idempotent und bewusst NICHT werfend: ein fehlgeschlagener Aufruf darf weder
 * die Supabase-Statusänderung noch die UI-Aktion blockieren. Rückgabe sagt nur,
 * ob es geklappt hat.
 */
export async function markPair(pair: string, action: "pending" | "done"): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair, action }),
    });
    if (!res.ok) {
      console.warn(`markPair(${pair}, ${action}): HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`markPair(${pair}, ${action}) fehlgeschlagen:`, e);
    return false;
  }
}

export function radarType(item: MarketData): RadarType {
  if (item.triggered || item.status === "HIT") {
    return item.near === "LONG" ? "hit-long" : "hit-short";
  }
  if (item.status === "NEUTRAL" || !item.near) return "neutral";
  return item.near === "SHORT" ? "short" : "long";
}

export function targetLine(
  item: MarketData,
  type: RadarType,
): { level: number | null; date: string | null; tf: GvaTf | null } {
  const short = { level: item.short, date: item.short_date, tf: item.short_tf ?? null };
  const long = { level: item.long, date: item.long_date, tf: item.long_tf ?? null };
  switch (type) {
    case "short":
    case "hit-short":
      return short;
    case "long":
    case "hit-long":
      return long;
    default: {
      if (item.near === "SHORT") return short;
      if (item.near === "LONG") return long;
      if (item.short != null) return short;
      return long;
    }
  }
}

/**
 * Reihenfolge im Board: getroffene Paare zuerst, danach nach Pip-Distanz.
 *
 * Ein HIT ist sticky — er bleibt offen, bis Kerim ihn im Detail-Fenster
 * erledigt oder übernimmt. Solange das nicht passiert ist, gehört er nach
 * oben, egal wie weit der Preis inzwischen weggelaufen ist. Vorher rutschte
 * genau der Hit nach unten, um den man sich kümmern sollte.
 *
 * Innerhalb der Hits entscheidet ebenfalls die Distanz, damit die Reihenfolge
 * bei mehreren offenen Hits stabil und nachvollziehbar bleibt.
 */
export function sortByDistance(data: MarketData[]): MarketData[] {
  const istHit = (m: MarketData) => m.triggered || m.status === "HIT";
  return [...data].sort((a, b) => {
    const ha = istHit(a) ? 0 : 1;
    const hb = istHit(b) ? 0 : 1;
    if (ha !== hb) return ha - hb;
    const da = a.distance != null ? a.distance : Infinity;
    const db = b.distance != null ? b.distance : Infinity;
    return da - db;
  });
}
