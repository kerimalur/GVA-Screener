export type InstrumentKind = "fx" | "commodity" | "index" | "crypto";

export interface InstrumentDef {
  instrument: string; // OANDA-Notation, z.B. 'EUR_USD'
  displayName: string;
  baseCcy: string | null;
  quoteCcy: string | null;
  kind: InstrumentKind;
  cftcCode: string | null; // Legacy-COT Contract-Code (nur Majors + Rohstoffe)
}

// 28 FX-Paare — identisch zur Liste in Backend/main.py (dort ohne Unterstrich)
const FX_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "USD_CHF", "NZD_USD",
  "EUR_JPY", "GBP_JPY", "EUR_GBP", "AUD_JPY", "CAD_JPY", "CHF_JPY", "EUR_AUD",
  "EUR_CAD", "EUR_CHF", "EUR_NZD", "GBP_AUD", "GBP_CAD", "GBP_CHF", "GBP_NZD",
  "AUD_CAD", "AUD_CHF", "AUD_NZD", "CAD_CHF", "NZD_CAD", "NZD_CHF", "NZD_JPY",
] as const;

const FX_CFTC: Record<string, string> = {
  EUR_USD: "099741",
  GBP_USD: "096742",
  USD_JPY: "097741",
  USD_CHF: "092741",
  USD_CAD: "090741",
  AUD_USD: "232741",
  NZD_USD: "112741",
};

export const INSTRUMENTS: InstrumentDef[] = [
  ...FX_PAIRS.map((p) => {
    const [base, quote] = p.split("_");
    return {
      instrument: p,
      displayName: `${base}/${quote}`,
      baseCcy: base,
      quoteCcy: quote,
      kind: "fx" as const,
      cftcCode: FX_CFTC[p] ?? null,
    };
  }),
  { instrument: "XAU_USD", displayName: "Gold", baseCcy: "XAU", quoteCcy: "USD", kind: "commodity", cftcCode: "088691" },
  { instrument: "WTICO_USD", displayName: "WTI Öl", baseCcy: "WTI", quoteCcy: "USD", kind: "commodity", cftcCode: "067651" },
  { instrument: "BCO_USD", displayName: "Brent Öl", baseCcy: "BCO", quoteCcy: "USD", kind: "commodity", cftcCode: null },
  { instrument: "XCU_USD", displayName: "Kupfer", baseCcy: "XCU", quoteCcy: "USD", kind: "commodity", cftcCode: "085692" },
  { instrument: "SPX500_USD", displayName: "S&P 500", baseCcy: "SPX", quoteCcy: "USD", kind: "index", cftcCode: "13874A" },
  { instrument: "BTC_USD", displayName: "Bitcoin", baseCcy: "BTC", quoteCcy: "USD", kind: "crypto", cftcCode: "133741" },
];

export const G8_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"] as const;
export type G8Currency = (typeof G8_CURRENCIES)[number];

export const FX_INSTRUMENTS = INSTRUMENTS.filter((i) => i.kind === "fx");

/** Alle FX-Paare, in denen eine Währung vorkommt (7 je Währung). */
export function pairsForCurrency(ccy: G8Currency): InstrumentDef[] {
  return FX_INSTRUMENTS.filter((i) => i.baseCcy === ccy || i.quoteCcy === ccy);
}

/** Pair-Notation Backend (EURUSD) ↔ OANDA (EUR_USD) */
export function toOanda(pair: string): string {
  return pair.length === 6 ? `${pair.slice(0, 3)}_${pair.slice(3)}` : pair;
}
export function fromOanda(instrument: string): string {
  return instrument.replace("_", "");
}
