import { useEffect, useState } from 'react';
import { G8, type G8Currency } from './g8';

const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

// Modul-Cache: nur ein Fetch pro Session, Views teilen sich das Ergebnis.
let g8Cache: G8Currency[] | null = null;

// G8-Fundamentaldaten vom Backend (/api/fundamentals). Fällt auf STATIC-G8 zurück,
// solange der Fetch läuft oder fehlschlägt → UI rendert sofort.
export function useG8(): G8Currency[] {
  const [data, setData] = useState<G8Currency[]>(g8Cache ?? G8);
  useEffect(() => {
    if (g8Cache) return;
    fetch(`${API}/api/fundamentals`)
      .then((r) => r.json())
      .then((j) => {
        const list = j?.currencies;
        if (Array.isArray(list) && list.length) {
          g8Cache = list;
          setData(list);
        }
      })
      .catch(() => {});
  }, []);
  return data;
}

export interface CalEvent {
  time: string;
  ccy: string;
  impact: number; // 1..3
  event: string;
  actual: string;
  forecast: string;
  previous: string;
}

const CAL_FALLBACK: CalEvent[] = [
  { time: 'Heute, 14:30', ccy: 'USD', impact: 3, event: 'Core CPI (MoM)', actual: '—', forecast: '0.3%', previous: '0.4%' },
  { time: 'Morgen, 09:30', ccy: 'CHF', impact: 3, event: 'SNB Zinsentscheid', actual: '—', forecast: '1.50%', previous: '1.50%' },
];

let calCache: CalEvent[] | null = null;

// Wirtschaftskalender vom Backend (/api/calendar, ForexFactory keyfrei). Fallback wie oben.
export function useCalendar(): CalEvent[] {
  const [data, setData] = useState<CalEvent[]>(calCache ?? CAL_FALLBACK);
  useEffect(() => {
    if (calCache) return;
    fetch(`${API}/api/calendar`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j) && j.length) {
          calCache = j;
          setData(j);
        }
      })
      .catch(() => {});
  }, []);
  return data;
}
