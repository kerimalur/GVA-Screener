/**
 * Fundamentaldaten — EINZIGE Quelle: GVA-Backend `/api/fundamentals`
 * (FastAPI/Render, Master aus Backend/fundamentals.py).
 * Ersetzt currencyStrength.ts des alten Journals (CFTC-Doppelfetch,
 * frankfurter.dev, hartkodierte Zinssätze).
 */

export interface CurrencyFundamentals {
  currency: string;
  score?: number;
  long_term_rate?: number;
  rate_change_3m?: number;
  cpi_yoy?: number;
  real_rate?: number;
  [key: string]: unknown;
}

export interface FundamentalsResponse {
  updated_at?: string;
  currencies: Record<string, CurrencyFundamentals>;
  [key: string]: unknown;
}

const BASE = process.env.NEXT_PUBLIC_GVA_API_URL || "";

/** null = Endpoint (noch) nicht verfügbar — Aufrufer zeigt Empty-State. */
export async function fetchFundamentals(): Promise<FundamentalsResponse | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/api/fundamentals`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== "object" || !json.currencies) return null;
    return json as FundamentalsResponse;
  } catch {
    return null;
  }
}

export function splitPair(symbol: string): { base: string; quote: string } {
  const clean = symbol.replace("/", "").toUpperCase();
  return { base: clean.slice(0, 3), quote: clean.slice(3, 6) };
}
