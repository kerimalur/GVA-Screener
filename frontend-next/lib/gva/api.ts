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
}

export type RadarType = "hit-short" | "hit-long" | "short" | "long" | "neutral";

const API_URL = (
  process.env.NEXT_PUBLIC_GVA_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export async function fetchScreener(): Promise<MarketData[]> {
  const response = await fetch(`${API_URL}/api/screener`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function markPair(pair: string, action: "pending" | "done"): Promise<void> {
  await fetch(`${API_URL}/api/mark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pair, action }),
  });
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
