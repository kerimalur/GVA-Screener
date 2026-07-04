/**
 * Fundamentaldaten — EINZIGE Quelle: GVA-Backend `/api/fundamentals`
 * (FastAPI/Render, Makro-Loop aus Backend/macro.py + fundamentals.py).
 * Ersetzt currencyStrength.ts des alten Journals (CFTC-Doppelfetch,
 * frankfurter.dev, hartkodierte Zinssätze).
 */

export interface G8Currency {
  code: string; // 'USD', 'EUR', …
  name?: string;
  rate?: number; // Leitzins
  score?: number; // Stärke-Score
  chg?: number; // Zins-Drehung / Score-Änderung
  realRate?: number;
  cpi?: number;
  tenY?: number;
  gdpRole?: string;
  tradeRole?: string;
  [key: string]: unknown;
}

export interface FundamentalsData {
  updated: string | number | null;
  byCode: Record<string, G8Currency>;
}

const BASE = process.env.NEXT_PUBLIC_GVA_API_URL || "";

/** null = Endpoint nicht erreichbar — Aufrufer zeigt Empty-State. */
export async function fetchFundamentals(): Promise<FundamentalsData | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/api/fundamentals`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const list: G8Currency[] = Array.isArray(json?.currencies) ? json.currencies : [];
    if (list.length === 0) return null;
    const byCode: Record<string, G8Currency> = {};
    for (const c of list) {
      if (c?.code) byCode[c.code] = c;
    }
    return { updated: json.updated ?? null, byCode };
  } catch {
    return null;
  }
}

export function splitPair(symbol: string): { base: string; quote: string } {
  const clean = symbol.replace("/", "").toUpperCase();
  return { base: clean.slice(0, 3), quote: clean.slice(3, 6) };
}

/** Kompakter Text-Block für Trade-Notizen (Signals-Inbox „Journalieren"). */
export function fundamentalsNote(c?: G8Currency | null): string {
  if (!c) return "—";
  const parts: string[] = [];
  if (c.score !== undefined) parts.push(`Score ${c.score}`);
  if (c.rate !== undefined) parts.push(`Leitzins ${c.rate}%`);
  if (c.realRate !== undefined) parts.push(`Realzins ${c.realRate}%`);
  if (c.cpi !== undefined) parts.push(`CPI ${c.cpi}%`);
  if (c.tenY !== undefined) parts.push(`10Y ${c.tenY}%`);
  return parts.join(" · ") || "—";
}
