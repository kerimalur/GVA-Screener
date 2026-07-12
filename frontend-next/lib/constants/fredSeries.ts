export type FredCategory =
  | "policy_rate"   // Leitzins / kurzfristiger Geldmarktsatz
  | "rate_2y"       // 2Y-Rendite (Erwartungs-Proxy)
  | "yield_10y"     // 10Y-Staatsanleihen
  | "real_10y"      // 10Y-Realrendite (TIPS) — Treiber für Gold/BTC
  | "breakeven"     // Inflationserwartung (Breakeven)
  | "cpi"           // Verbraucherpreise (Index oder YoY)
  | "unemployment"  // Arbeitslosenquote
  | "gdp"           // reales BIP
  | "cli"           // OECD Composite Leading Indicator (PMI-Proxy)
  | "trade"         // Handelsbilanz
  | "yield_curve"   // 10Y-2Y-Spread (Rezessions-Signal)
  | "sentiment"     // Consumer Confidence
  | "pmi"           // ISM / Einkaufsmanager (nur USA)
  | "retail_sales"  // Retail Trade Volume
  | "balance_sheet" // Zentralbank-Bilanzsumme (QE/QT)
  | "business_confidence" // Business Tendency Survey (Manufacturing)
  | "market";       // Marktdaten (VIX, Dollar-Indizes, FX)

export interface FredSeriesDef {
  id: string;
  ccy: string | null; // G8-Währung oder null (Marktdaten)
  category: FredCategory;
  label: string;
  /** true = Wert ist Indexstand, YoY muss berechnet werden (CPI-Indizes) */
  isIndex?: boolean;
}

// Hinweis: einige OECD-Serien wurden auf FRED eingestellt (2023/24).
// Der Backfill probt jede ID und markiert tote Serien in fred_series_meta.is_stale.
export const FRED_CATALOG: FredSeriesDef[] = [
  // — Leitzins / kurzfristig —
  { id: "FEDFUNDS", ccy: "USD", category: "policy_rate", label: "Fed Funds Rate" },
  { id: "ECBDFR", ccy: "EUR", category: "policy_rate", label: "EZB Einlagensatz" },
  { id: "IRSTCI01GBM156N", ccy: "GBP", category: "policy_rate", label: "UK Geldmarktsatz" },
  { id: "IRSTCI01JPM156N", ccy: "JPY", category: "policy_rate", label: "Japan Geldmarktsatz" },
  // CH/NZ: IRSTCI01…-Serien seit 2024 tot -> 3M-Interbank als Proxy (Audit 2026-07)
  { id: "IR3TIB01CHM156N", ccy: "CHF", category: "policy_rate", label: "Schweiz 3M-Geldmarktsatz" },
  { id: "IRSTCI01AUM156N", ccy: "AUD", category: "policy_rate", label: "Australien Geldmarktsatz" },
  { id: "IR3TIB01NZM156N", ccy: "NZD", category: "policy_rate", label: "Neuseeland 3M-Geldmarktsatz" },
  { id: "IRSTCI01CAM156N", ccy: "CAD", category: "policy_rate", label: "Kanada Geldmarktsatz" },
  { id: "DGS2", ccy: "USD", category: "rate_2y", label: "US 2Y Treasury" },

  // — Realrendite + Inflationserwartung (US; Treiber für Gold/BTC-Flüsse) —
  { id: "DFII10", ccy: "USD", category: "real_10y", label: "US 10Y TIPS (Realrendite)" },
  { id: "T10YIE", ccy: "USD", category: "breakeven", label: "US 10Y Breakeven-Inflation" },
  { id: "T5YIE", ccy: "USD", category: "breakeven", label: "US 5Y Breakeven-Inflation" },

  // — 10Y-Renditen (US täglich, Rest OECD monatlich; DE = EUR-Proxy) —
  { id: "DGS10", ccy: "USD", category: "yield_10y", label: "US 10Y (täglich)" },
  { id: "IRLTLT01DEM156N", ccy: "EUR", category: "yield_10y", label: "Deutschland 10Y" },
  { id: "IRLTLT01GBM156N", ccy: "GBP", category: "yield_10y", label: "UK 10Y" },
  { id: "IRLTLT01JPM156N", ccy: "JPY", category: "yield_10y", label: "Japan 10Y" },
  { id: "IRLTLT01CHM156N", ccy: "CHF", category: "yield_10y", label: "Schweiz 10Y" },
  { id: "IRLTLT01AUM156N", ccy: "AUD", category: "yield_10y", label: "Australien 10Y" },
  { id: "IRLTLT01NZM156N", ccy: "NZD", category: "yield_10y", label: "Neuseeland 10Y" },
  { id: "IRLTLT01CAM156N", ccy: "CAD", category: "yield_10y", label: "Kanada 10Y" },

  // — CPI —
  // Audit 2026-07: Nicht-US/EZ-CPI auf FRED tot (OECD-Feed eingestellt, letzte
  // Werte 2021–2025); auch CPALTT01…-Alternativen stale. Serien bleiben für
  // Historie, is_stale markiert sie. Aktuelle CPI-Werte: calendar_events.actual.
  { id: "CPIAUCSL", ccy: "USD", category: "cpi", label: "US CPI", isIndex: true },
  { id: "CP0000EZ19M086NEST", ccy: "EUR", category: "cpi", label: "Eurozone HICP", isIndex: true },
  { id: "GBRCPIALLMINMEI", ccy: "GBP", category: "cpi", label: "UK CPI", isIndex: true },
  { id: "JPNCPIALLMINMEI", ccy: "JPY", category: "cpi", label: "Japan CPI", isIndex: true },
  { id: "CHECPIALLMINMEI", ccy: "CHF", category: "cpi", label: "Schweiz CPI", isIndex: true },
  { id: "AUSCPIALLQINMEI", ccy: "AUD", category: "cpi", label: "Australien CPI (Q)", isIndex: true },
  { id: "NZLCPIALLQINMEI", ccy: "NZD", category: "cpi", label: "Neuseeland CPI (Q)", isIndex: true },
  { id: "CANCPIALLMINMEI", ccy: "CAD", category: "cpi", label: "Kanada CPI", isIndex: true },

  // — Arbeitslosenquote —
  { id: "UNRATE", ccy: "USD", category: "unemployment", label: "US Arbeitslosenquote" },
  { id: "LRHUTTTTEZM156S", ccy: "EUR", category: "unemployment", label: "Eurozone Arbeitslosenquote" },
  { id: "LRHUTTTTGBM156S", ccy: "GBP", category: "unemployment", label: "UK Arbeitslosenquote" },
  { id: "LRHUTTTTJPM156S", ccy: "JPY", category: "unemployment", label: "Japan Arbeitslosenquote" },
  // Monatsserie tot (404) -> Quartalsserie (Audit 2026-07); EZ-Serie stale, keine Alternative
  { id: "LRHUTTTTCHQ156S", ccy: "CHF", category: "unemployment", label: "Schweiz Arbeitslosenquote (Q)" },
  { id: "LRHUTTTTAUQ156S", ccy: "AUD", category: "unemployment", label: "Australien Arbeitslosenquote (Q)" },
  { id: "LRHUTTTTNZQ156S", ccy: "NZD", category: "unemployment", label: "Neuseeland Arbeitslosenquote (Q)" },
  { id: "LRHUTTTTCAM156S", ccy: "CAD", category: "unemployment", label: "Kanada Arbeitslosenquote" },

  // — BIP (real, Wachstum bzw. Niveau; best effort, stale-tolerant) —
  { id: "A191RL1Q225SBEA", ccy: "USD", category: "gdp", label: "US BIP-Wachstum (QoQ ann.)" },
  { id: "CLVMNACSCAB1GQEA19", ccy: "EUR", category: "gdp", label: "Eurozone reales BIP", isIndex: true },
  { id: "CLVMNACSCAB1GQUK", ccy: "GBP", category: "gdp", label: "UK reales BIP", isIndex: true },
  { id: "JPNRGDPEXP", ccy: "JPY", category: "gdp", label: "Japan reales BIP", isIndex: true },
  { id: "CLVMNACSCAB1GQCH", ccy: "CHF", category: "gdp", label: "Schweiz reales BIP", isIndex: true },
  { id: "AUSGDPRQDSMEI", ccy: "AUD", category: "gdp", label: "Australien reales BIP", isIndex: true },
  { id: "NZLGDPRQDSMEI", ccy: "NZD", category: "gdp", label: "Neuseeland reales BIP", isIndex: true },
  { id: "NGDPRSAXDCCAQ", ccy: "CAD", category: "gdp", label: "Kanada reales BIP", isIndex: true },

  // — OECD CLI (PMI-Proxy) —
  { id: "USALOLITONOSTSAM", ccy: "USD", category: "cli", label: "US Leading Indicator (CLI)" },
  { id: "EA19LOLITONOSTSAM", ccy: "EUR", category: "cli", label: "Eurozone CLI" },
  { id: "GBRLOLITONOSTSAM", ccy: "GBP", category: "cli", label: "UK CLI" },
  { id: "JPNLOLITONOSTSAM", ccy: "JPY", category: "cli", label: "Japan CLI" },
  { id: "CHELOLITONOSTSAM", ccy: "CHF", category: "cli", label: "Schweiz CLI" },
  { id: "AUSLOLITONOSTSAM", ccy: "AUD", category: "cli", label: "Australien CLI" },
  { id: "CANLOLITONOSTSAM", ccy: "CAD", category: "cli", label: "Kanada CLI" },
  // NZ: kein OECD-CLI verfügbar

  // — Handelsbilanz (US sicher; Rest OECD, stale-tolerant) —
  { id: "BOPGSTB", ccy: "USD", category: "trade", label: "US Handelsbilanz" },
  { id: "XTNTVA01EZM667S", ccy: "EUR", category: "trade", label: "Eurozone Handelsbilanz" },
  { id: "XTNTVA01GBM667S", ccy: "GBP", category: "trade", label: "UK Handelsbilanz" },
  { id: "XTNTVA01JPM667S", ccy: "JPY", category: "trade", label: "Japan Handelsbilanz" },
  { id: "XTNTVA01CHM667S", ccy: "CHF", category: "trade", label: "Schweiz Handelsbilanz" },
  { id: "XTNTVA01AUM667S", ccy: "AUD", category: "trade", label: "Australien Handelsbilanz" },
  { id: "XTNTVA01NZM667S", ccy: "NZD", category: "trade", label: "Neuseeland Handelsbilanz" },
  { id: "XTNTVA01CAM667S", ccy: "CAD", category: "trade", label: "Kanada Handelsbilanz" },

  // — Yield Curve (nur USA; Rezessions-Signal bei Inversion) —
  { id: "T10Y2Y", ccy: "USD", category: "yield_curve", label: "US 10-2Y Spread" },

  // — PMI (nur USA; Rest nutzt OECD CLI + BCI als Doppel-Proxy) —
  { id: "NAPM", ccy: "USD", category: "pmi", label: "ISM Manufacturing PMI" },

  // — Business Confidence Index / BCI (7 von 8 — CHF fehlt auf FRED) —
  // OECD Business Tendency Surveys (Manufacturing), Percent Balance, SB.
  { id: "BSCICP02USM460S", ccy: "USD", category: "business_confidence", label: "Business Confidence USD" },
  { id: "BSCICP02EZM460S", ccy: "EUR", category: "business_confidence", label: "Business Confidence EUR" },
  { id: "BSCICP02GBM460S", ccy: "GBP", category: "business_confidence", label: "Business Confidence GBP" },
  { id: "JPNBSCICP02STSAQ", ccy: "JPY", category: "business_confidence", label: "Business Confidence JPY (Q)" },
  { id: "BSCICP02AUQ460S", ccy: "AUD", category: "business_confidence", label: "Business Confidence AUD (Q)" },
  { id: "BSCICP02NZQ460S", ccy: "NZD", category: "business_confidence", label: "Business Confidence NZD (Q)" },
  { id: "CANBSCICP02STSAQ", ccy: "CAD", category: "business_confidence", label: "Business Confidence CAD (Q)" },

  // — Consumer Confidence / Sentiment (alle 8; CAD fehlt auf FRED) —
  { id: "UMCSENT", ccy: "USD", category: "sentiment", label: "UMich Consumer Sentiment" },
  { id: "CSCICP02EZM460S", ccy: "EUR", category: "sentiment", label: "Consumer Confidence EUR" },
  { id: "CSCICP02GBM460S", ccy: "GBP", category: "sentiment", label: "Consumer Confidence GBP" },
  { id: "CSCICP02JPM460S", ccy: "JPY", category: "sentiment", label: "Consumer Confidence JPY" },
  { id: "CSCICP02AUM460S", ccy: "AUD", category: "sentiment", label: "Consumer Confidence AUD" },
  { id: "LOCOCIORNZQ665S", ccy: "NZD", category: "sentiment", label: "Consumer Confidence NZD (Q)" },
  { id: "CSCICP02CHQ460S", ccy: "CHF", category: "sentiment", label: "Consumer Confidence CHF (Q)" },

  // — Retail Sales (Volume Index, alle 8) —
  { id: "RSXFS", ccy: "USD", category: "retail_sales", label: "US Retail Sales ex Food Services" },
  { id: "SLRTTO01EZM659S", ccy: "EUR", category: "retail_sales", label: "Retail Trade Volume EUR" },
  { id: "SLRTTO01GBM659S", ccy: "GBP", category: "retail_sales", label: "Retail Trade Volume GBP" },
  { id: "SLRTTO01JPM659S", ccy: "JPY", category: "retail_sales", label: "Retail Trade Volume JPY" },
  { id: "SLRTTO01AUM659S", ccy: "AUD", category: "retail_sales", label: "Retail Trade Volume AUD" },
  { id: "SLRTTO01NZM659S", ccy: "NZD", category: "retail_sales", label: "Retail Trade Volume NZD" },
  { id: "SLRTTO01CAM659S", ccy: "CAD", category: "retail_sales", label: "Retail Trade Volume CAD" },
  { id: "SLRTTO01CHM659S", ccy: "CHF", category: "retail_sales", label: "Retail Trade Volume CHF" },

  // — Zentralbank-Bilanzsummen (Fed/EZB/BoJ decken >80% globaler ZB-Liquidität) —
  { id: "WALCL", ccy: "USD", category: "balance_sheet", label: "Fed Total Assets" },
  { id: "ECBASSETSW", ccy: "EUR", category: "balance_sheet", label: "ECB Total Assets" },
  { id: "JPNASSETS", ccy: "JPY", category: "balance_sheet", label: "BoJ Total Assets" },

  // — Marktdaten —
  { id: "VIXCLS", ccy: null, category: "market", label: "VIX" },
  { id: "DTWEXBGS", ccy: null, category: "market", label: "Broad Dollar Index" },
  { id: "DEXSDUS", ccy: null, category: "market", label: "USD/SEK (für DXY-Formel)" },
];

export const FRED_BY_ID = new Map(FRED_CATALOG.map((s) => [s.id, s]));

export function seriesFor(ccy: string, category: FredCategory): FredSeriesDef | undefined {
  return FRED_CATALOG.find((s) => s.ccy === ccy && s.category === category);
}
