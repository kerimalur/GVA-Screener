// Datenvertrag mit dem Backend (GET /api/screener). NICHT ändern ohne Backend-Abgleich.
export interface LastTouched {
  type: 'SHORT' | 'LONG';
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
  status: 'HIT' | 'PREPARE' | 'NEUTRAL';
  near: 'SHORT' | 'LONG' | null;
  triggered: boolean;
  pending: boolean;
  distance: number | null;
  last_touched: LastTouched | null;
}

// Visueller Status für Radar/Heatmap/Modal (abgeleitet aus MarketData via radarType()).
export type RadarType = 'hit-short' | 'hit-long' | 'short' | 'long' | 'neutral';

// IDs der sechs Views (Sidebar-Navigation).
export type ViewId =
  | 'radar'
  | 'heatmap'
  | 'powerindex'
  | 'strength'
  | 'calendar'
  | 'datacenter';
