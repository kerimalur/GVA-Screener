export interface CftcContractDef {
  code: string;          // cftc_contract_market_code (stabiler Schlüssel)
  name: string;          // offizieller Contract-Name (Verifikation)
  label: string;         // UI-Label
  ccy: string | null;    // zugehörige G8-Währung (null bei Rohstoffen/Indizes)
  /** Instrument für Preis-Join (Backtest, Overlay). */
  priceInstrument: string | null;
  /**
   * true, wenn Future die Fremdwährung in USD quotiert, das Preis-Instrument
   * aber USD_XXX ist (JPY/CHF/CAD): Long-Future = Währungsstärke = Pair fällt.
   * Forward-Returns im Backtest müssen dann invertiert werden.
   */
  invertPrice: boolean;
  /**
   * true = Contract erscheint auch im TFF-Report ("Traders in Financial
   * Futures": Dealer / Asset Manager / Leveraged Funds / Other). Nur
   * Financial Futures — Gold/WTI/Kupfer sind im Disaggregated-Report, nicht TFF.
   */
  inTff: boolean;
}

export const CFTC_CONTRACTS: CftcContractDef[] = [
  { code: "099741", name: "EURO FX", label: "EUR (Euro FX)", ccy: "EUR", priceInstrument: "EUR_USD", invertPrice: false, inTff: true },
  { code: "096742", name: "BRITISH POUND", label: "GBP (British Pound)", ccy: "GBP", priceInstrument: "GBP_USD", invertPrice: false, inTff: true },
  { code: "097741", name: "JAPANESE YEN", label: "JPY (Japanese Yen)", ccy: "JPY", priceInstrument: "USD_JPY", invertPrice: true, inTff: true },
  { code: "092741", name: "SWISS FRANC", label: "CHF (Swiss Franc)", ccy: "CHF", priceInstrument: "USD_CHF", invertPrice: true, inTff: true },
  { code: "090741", name: "CANADIAN DOLLAR", label: "CAD (Canadian Dollar)", ccy: "CAD", priceInstrument: "USD_CAD", invertPrice: true, inTff: true },
  { code: "232741", name: "AUSTRALIAN DOLLAR", label: "AUD (Australian Dollar)", ccy: "AUD", priceInstrument: "AUD_USD", invertPrice: false, inTff: true },
  { code: "112741", name: "NZ DOLLAR", label: "NZD (New Zealand Dollar)", ccy: "NZD", priceInstrument: "NZD_USD", invertPrice: false, inTff: true },
  { code: "098662", name: "U.S. DOLLAR INDEX", label: "USD (Dollar Index)", ccy: "USD", priceInstrument: null, invertPrice: false, inTff: true },
  { code: "133741", name: "BITCOIN", label: "BTC (Bitcoin, CME)", ccy: null, priceInstrument: "BTC_USD", invertPrice: false, inTff: true },
  { code: "088691", name: "GOLD", label: "Gold", ccy: null, priceInstrument: "XAU_USD", invertPrice: false, inTff: false },
  { code: "067651", name: "CRUDE OIL, LIGHT SWEET-WTI", label: "WTI Öl", ccy: null, priceInstrument: "WTICO_USD", invertPrice: false, inTff: false },
  { code: "085692", name: "COPPER- #1", label: "Kupfer", ccy: null, priceInstrument: "XCU_USD", invertPrice: false, inTff: false },
  { code: "13874A", name: "E-MINI S&P 500", label: "S&P 500 (E-Mini)", ccy: null, priceInstrument: "SPX500_USD", invertPrice: false, inTff: true },
];

/** Contracts, die im TFF-Report erscheinen (FX + DXY + BTC + SPX). */
export const TFF_CONTRACTS = CFTC_CONTRACTS.filter((c) => c.inTff);

export const CONTRACT_BY_CODE = new Map(CFTC_CONTRACTS.map((c) => [c.code, c]));
export const CONTRACT_BY_CCY = new Map(
  CFTC_CONTRACTS.filter((c) => c.ccy).map((c) => [c.ccy as string, c]),
);
