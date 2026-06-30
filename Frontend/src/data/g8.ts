// Gemeinsame G8-Datenquelle für die "Makro & Stärke"-Views (Power Index, Stärke Matrix, Datenzentrum).
//
// PHASE 1: Platzhalter-/Beispieldaten. Bewusst zentral hier, damit Phase 2 (Backend) nur die
// Fetch-Funktion unten ersetzen muss — die Views konsumieren ausschließlich G8Currency[].
// Geplante echte Quellen: Score = FRED Real-Zins + Zins-Drehung; cot = CFTC Socrata
// (publicreporting.cftc.gov, Commercials net = comm_long - comm_short, 52 Wochen);
// rate/cpi/tenY = FRED. Siehe Backend/fundamentals.py.

export interface G8Currency {
  code: string;        // ISO, z.B. "USD"
  name: string;        // Land/Region
  rate: number;        // Leitzins %
  score: number;       // Stärke-Score (-10..+10)
  chg: number;         // 7-Tage-Änderung des Scores
  realRate: number;    // Real-Zins (Leitzins − CPI) %
  cpi: number;         // CPI YoY %
  tenY: number;        // 10Y-Rendite %
  cot: number[];       // 52 Wochen Commercials-Netto (in Tausend Kontrakten)
  gdpRole: string;     // Rolle BIP für diese Währung (Popup-Text)
  tradeRole: string;   // Rolle Import/Export (Popup-Text)
}

// Deterministischer 52-Wochen-Verlauf (Trend von s nach e + Oszillation).
function genCot(s: number, e: number, amp: number, k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 52; i++) {
    const t = i / 51;
    const base = s + (e - s) * t;
    const wave = Math.sin(i * 0.55 + k) * amp + Math.sin(i * 0.23 + k * 1.7) * amp * 0.5;
    out.push(Math.round(base + wave));
  }
  return out;
}

const UPDATED = 'Stand: 28. Jun 2026';

export const G8: G8Currency[] = [
  { code: 'CAD', name: 'Kanada', rate: 4.25, score: 8.5, chg: 1.2, realRate: 2.25, cpi: 2.0, tenY: 3.30, cot: genCot(-6, -52, 5, 1),
    gdpRole: 'Robustes BIP-Wachstum stützt CAD; rohstoffgetriebene Konjunktur reagiert stark auf Ölpreis.',
    tradeRole: 'Hoher Handelsbilanzüberschuss durch Energie-Exporte (v.a. in die USA) wirkt CAD-positiv.' },
  { code: 'NZD', name: 'Neuseeland', rate: 5.25, score: 6.2, chg: 0.8, realRate: 3.05, cpi: 2.2, tenY: 4.40, cot: genCot(6, -22, 4, 2),
    gdpRole: 'Solides BIP, aber kleine Volkswirtschaft — empfindlich gegenüber globaler Risikostimmung.',
    tradeRole: 'Agrar-/Milchexporte dominieren die Handelsbilanz; China-Nachfrage ist der Haupttreiber.' },
  { code: 'AUD', name: 'Australien', rate: 4.10, score: 4.1, chg: 1.5, realRate: 0.50, cpi: 3.6, tenY: 4.00, cot: genCot(4, -30, 4, 3),
    gdpRole: 'BIP eng an Rohstoffzyklus (Eisenerz, Kohle) gekoppelt; China-Wachstum entscheidend.',
    tradeRole: 'Großer Exportüberschuss bei Industriemetallen stützt AUD in Risk-On-Phasen.' },
  { code: 'USD', name: 'USA', rate: 5.00, score: 1.5, chg: -0.4, realRate: 1.90, cpi: 3.1, tenY: 4.28,
    cot: genCot(32, -18, 6, 4),
    gdpRole: 'Größte Volkswirtschaft; BIP-Stärke + hoher Realzins ziehen Kapital an (USD-Reservestatus).',
    tradeRole: 'Strukturelles Handelsdefizit, aber als Reservewährung von Kapitalflüssen statt Handel getrieben.' },
  { code: 'GBP', name: 'Großbritannien', rate: 4.50, score: 0.3, chg: 0.6, realRate: 1.10, cpi: 3.4, tenY: 4.12, cot: genCot(-24, 0, 5, 5),
    gdpRole: 'Dienstleistungslastiges BIP; moderate Wachstumsdynamik hält GBP nahe neutral.',
    tradeRole: 'Handelsdefizit bei Gütern, teils ausgeglichen durch Finanzdienstleistungs-Exporte.' },
  { code: 'EUR', name: 'Eurozone', rate: 3.75, score: -0.8, chg: -1.1, realRate: 1.35, cpi: 2.4, tenY: 2.51, cot: genCot(-42, 2, 6, 6),
    gdpRole: 'Schwaches BIP-Momentum (v.a. Industrie) belastet EUR; fragmentierte Konjunktur.',
    tradeRole: 'Exportüberschuss (Deutschland) ist EUR-stützend, aber von Energiekosten gedämpft.' },
  { code: 'CHF', name: 'Schweiz', rate: 1.25, score: -6.0, chg: -0.9, realRate: 0.15, cpi: 1.1, tenY: 0.68, cot: genCot(-4, 20, 4, 7),
    gdpRole: 'Stabiles BIP, niedrige Inflation; CHF eher Safe-Haven als wachstumsgetrieben.',
    tradeRole: 'Hoher Exportüberschuss (Pharma, Uhren); SNB interveniert gegen zu starken CHF.' },
  { code: 'JPY', name: 'Japan', rate: 0.50, score: -9.2, chg: -2.0, realRate: -2.50, cpi: 3.0, tenY: 0.98, cot: genCot(-12, 88, 7, 8),
    gdpRole: 'Schwaches BIP + negativer Realzins belasten JPY massiv (Carry-Trade-Finanzierung).',
    tradeRole: 'Importabhängig bei Energie; Handelsbilanz schwankt mit Ölpreis und Yen-Schwäche.' },
];

export function sortByScore(list: G8Currency[] = G8): G8Currency[] {
  return [...list].sort((a, b) => b.score - a.score);
}

export function findCurrency(code: string): G8Currency {
  return G8.find((c) => c.code === code) ?? G8[0];
}

export function tierLabel(score: number): string {
  if (score >= 6) return 'Sehr stark';
  if (score >= 2) return 'Stark';
  if (score > -2) return 'Neutral';
  if (score > -6) return 'Schwach';
  return 'Sehr schwach';
}

export { UPDATED };

// PHASE 2: hier später echten Fetch einsetzen (z.B. GET /api/fundamentals) und G8 ersetzen.
export async function fetchG8(): Promise<G8Currency[]> {
  return G8;
}
