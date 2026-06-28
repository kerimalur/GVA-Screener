import type { MarketData, RadarType } from './types';

// Dynamische API-URL: lokal Fallback auf 127.0.0.1, Production via VITE_API_URL (.env.production).
const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

export async function fetchScreener(): Promise<MarketData[]> {
  const response = await fetch(`${API_URL}/api/screener`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// User-Aktion auf ein getroffenes Paar: "pending" (dran) oder "done" (Line verbraucht).
export async function markPair(pair: string, action: 'pending' | 'done'): Promise<void> {
  await fetch(`${API_URL}/api/mark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pair, action }),
  });
}

// MarketData → visueller Status für Radar/Heatmap/Modal-Badge.
export function radarType(item: MarketData): RadarType {
  if (item.triggered || item.status === 'HIT') {
    return item.near === 'LONG' ? 'hit-long' : 'hit-short';
  }
  if (item.status === 'NEUTRAL' || !item.near) return 'neutral';
  return item.near === 'SHORT' ? 'short' : 'long';
}

// Welche Linie ist für diesen Status relevant (Level + Erstellungsdatum)?
export function targetLine(item: MarketData, type: RadarType): { level: number | null; date: string | null } {
  switch (type) {
    case 'short':
    case 'hit-short':
      return { level: item.short, date: item.short_date };
    case 'long':
    case 'hit-long':
      return { level: item.long, date: item.long_date };
    default: {
      // neutral → nähere der beiden Linien (per near, sonst was vorhanden ist)
      if (item.near === 'SHORT') return { level: item.short, date: item.short_date };
      if (item.near === 'LONG') return { level: item.long, date: item.long_date };
      if (item.short != null) return { level: item.short, date: item.short_date };
      return { level: item.long, date: item.long_date };
    }
  }
}

// Sortierung nach Distanz (nächste Linie zuerst); null ans Ende.
export function sortByDistance(data: MarketData[]): MarketData[] {
  return [...data].sort((a, b) => {
    const da = a.distance != null ? a.distance : Infinity;
    const db = b.distance != null ? b.distance : Infinity;
    return da - db;
  });
}
