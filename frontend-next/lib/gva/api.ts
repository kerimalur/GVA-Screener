// Client-seitiger Zugriff auf das GVA-FastAPI-Backend (Render).
// Datenvertrag identisch zu Backend GET /api/screener — NICHT ändern ohne Backend-Abgleich.

export interface LastTouched {
  type: "SHORT" | "LONG";
  level: number;
  date: string;
  touched_date: string;
}

export interface MarketData {
  pair: string;
  price: number;
  short: number | null;
  short_date: string | null;
  long: number | null;
  long_date: string | null;
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
}

/** Antwort von GET /api/screener — inkl. Zustandskontext (Arbeitspaket C). */
export interface ScreenerSnapshot {
  data: MarketData[];
  /** Unix-Sekunden des letzten Snapshots, null solange keiner gebaut wurde. */
  updated: number | null;
  /** Berechnete Zonen. < pairsTotal = Backend startet noch. */
  zones: number;
  pairsTotal: number;
  /** false = OANDA-Pricing ausgefallen, gerechnet wird mit dem Tagesschluss. */
  live: boolean;
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
    const data = raw as MarketData[];
    return { data, updated: null, zones: data.length, pairsTotal: PAIRS_TOTAL, live: true };
  }
  const data: MarketData[] = Array.isArray(raw?.data) ? raw.data : [];
  return {
    data,
    updated: typeof raw?.updated === "number" ? raw.updated : null,
    zones: typeof raw?.zones === "number" ? raw.zones : data.length,
    pairsTotal: typeof raw?.pairs_total === "number" ? raw.pairs_total : PAIRS_TOTAL,
    live: raw?.live !== false,
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
): { level: number | null; date: string | null } {
  switch (type) {
    case "short":
    case "hit-short":
      return { level: item.short, date: item.short_date };
    case "long":
    case "hit-long":
      return { level: item.long, date: item.long_date };
    default: {
      if (item.near === "SHORT") return { level: item.short, date: item.short_date };
      if (item.near === "LONG") return { level: item.long, date: item.long_date };
      if (item.short != null) return { level: item.short, date: item.short_date };
      return { level: item.long, date: item.long_date };
    }
  }
}

export function sortByDistance(data: MarketData[]): MarketData[] {
  return [...data].sort((a, b) => {
    const da = a.distance != null ? a.distance : Infinity;
    const db = b.distance != null ? b.distance : Infinity;
    return da - db;
  });
}
