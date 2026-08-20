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

export type FredCadence = "daily" | "weekly" | "monthly" | "quarterly";

export interface FredSeriesDef {
  id: string;
  ccy: string | null; // G8-Währung oder null (Marktdaten)
  category: FredCategory;
  label: string;
  /** true = Wert ist Indexstand, YoY muss berechnet werden (CPI-/BIP-Indizes) */
  isIndex?: boolean;
  /** Publikations-Rhythmus: steuert Stale-Schwelle + Quartals-Kennzeichnung im UI */
  cadence?: FredCadence;
  /** "bis" = Serie wird von updateBis gepflegt — updateFred fetcht sie NICHT bei FRED */
  source?: "fred" | "bis";
  /**
   * Gesetzt, wenn FRED die Serie eingestellt hat — der Text sagt, wann und warum.
   *
   * Solche Serien werden NICHT mehr abgefragt: FRED antwortet mit "The series
   * does not exist", das kostet je Lauf eine Anfrage und schreibt eine
   * Fehlerzeile ins Log, die niemand mehr liest. Die Definition bleibt aber
   * stehen — die bereits geschriebenen Werte liegen weiter in `fred_series`,
   * und ein Rückblick auf 2021 braucht sie. Ohne Label wüsste dort niemand
   * mehr, was die Zahlen bedeuten.
   */
  eingestellt?: string;
}

/**
 * Max. Alter des letzten Werts (Tage) bevor eine Serie als stale gilt —
 * inkl. Publikationslag: Quartalsdaten sind mit Stichtag Quartalsbeginn
 * gestempelt und erscheinen ~3–6 Monate später (NZ/AU CPI: release-bedingt,
 * nicht kaputt). Ohne cadence nur wirklich tote Serien markieren.
 */
export function staleAllowanceDays(def: FredSeriesDef): number {
  switch (def.cadence) {
    case "daily": return 14;
    case "weekly": return 30;
    case "monthly": return 100;
    case "quarterly": return 220;
    default: return 400;
  }
}

// Hinweis: einige OECD-Serien wurden auf FRED eingestellt (2023/24).
// Der Backfill probt jede ID und markiert tote Serien in fred_series_meta.is_stale.
export const FRED_CATALOG: FredSeriesDef[] = [
  // — Leitzins / kurzfristig —
  { id: "FEDFUNDS", ccy: "USD", category: "policy_rate", label: "Fed Funds Rate", cadence: "monthly" },
  { id: "ECBDFR", ccy: "EUR", category: "policy_rate", label: "EZB Einlagensatz", cadence: "daily" },
  { id: "IRSTCI01GBM156N", ccy: "GBP", category: "policy_rate", label: "UK Geldmarktsatz", cadence: "monthly" },
  { id: "IRSTCI01JPM156N", ccy: "JPY", category: "policy_rate", label: "Japan Geldmarktsatz", cadence: "monthly" },
  // CH/NZ: IRSTCI01…-Serien seit 2024 tot -> 3M-Interbank als Proxy (Audit 2026-07)
  { id: "IR3TIB01CHM156N", ccy: "CHF", category: "policy_rate", label: "Schweiz 3M-Geldmarktsatz", cadence: "monthly" },
  { id: "IRSTCI01AUM156N", ccy: "AUD", category: "policy_rate", label: "Australien Geldmarktsatz", cadence: "monthly" },
  { id: "IR3TIB01NZM156N", ccy: "NZD", category: "policy_rate", label: "Neuseeland 3M-Geldmarktsatz", cadence: "monthly" },
  { id: "IRSTCI01CAM156N", ccy: "CAD", category: "policy_rate", label: "Kanada Geldmarktsatz", cadence: "monthly" },
  { id: "DGS2", ccy: "USD", category: "rate_2y", label: "US 2Y Treasury", cadence: "daily" },

  // — Realrendite + Inflationserwartung (US; Treiber für Gold/BTC-Flüsse) —
  { id: "DFII10", ccy: "USD", category: "real_10y", label: "US 10Y TIPS (Realrendite)", cadence: "daily" },
  { id: "T10YIE", ccy: "USD", category: "breakeven", label: "US 10Y Breakeven-Inflation", cadence: "daily" },
  { id: "T5YIE", ccy: "USD", category: "breakeven", label: "US 5Y Breakeven-Inflation", cadence: "daily" },

  // — 10Y-Renditen (US täglich, Rest OECD monatlich mit ~2M Publikationslag;
  //   DE = EUR-Proxy. DB-Check 2026-07-17: IRLTLT01* liefern bis Mai 26 →
  //   Serien leben, nur der CSV-Transport war tot) —
  { id: "DGS10", ccy: "USD", category: "yield_10y", label: "US 10Y (täglich)", cadence: "daily" },
  { id: "IRLTLT01DEM156N", ccy: "EUR", category: "yield_10y", label: "Deutschland 10Y", cadence: "monthly" },
  { id: "IRLTLT01GBM156N", ccy: "GBP", category: "yield_10y", label: "UK 10Y", cadence: "monthly" },
  { id: "IRLTLT01JPM156N", ccy: "JPY", category: "yield_10y", label: "Japan 10Y", cadence: "monthly" },
  { id: "IRLTLT01CHM156N", ccy: "CHF", category: "yield_10y", label: "Schweiz 10Y", cadence: "monthly" },
  { id: "IRLTLT01AUM156N", ccy: "AUD", category: "yield_10y", label: "Australien 10Y", cadence: "monthly" },
  { id: "IRLTLT01NZM156N", ccy: "NZD", category: "yield_10y", label: "Neuseeland 10Y", cadence: "monthly" },
  { id: "IRLTLT01CAM156N", ccy: "CAD", category: "yield_10y", label: "Kanada 10Y", cadence: "monthly" },

  // — CPI (YoY %, Quelle BIS) —
  // Audit 2026-07: OECD-CPI-Indizes auf FRED dauerhaft eingestellt (letzte
  // Werte 2021–2025) — auch über die offizielle API nicht wiederbelebbar.
  // Aktive Quelle: BIS WS_LONG_CPI (lib/jobs/updateBis.ts) schreibt
  // BIS_CPI_YOY_* in fred_series; source:"bis" ⇒ updateFred überspringt den
  // FRED-Fetch. Werte sind bereits YoY % (kein isIndex). AUD/NZD publizieren
  // quartalsweise — cadence:"quarterly" kennzeichnet das (kein Fehler).
  // Alte OECD-Zeilen (CPIAUCSL, JPNCPIALLMINMEI, …) bleiben als Historie in der DB.
  { id: "BIS_CPI_YOY_USD", ccy: "USD", category: "cpi", label: "US CPI YoY (BIS)", source: "bis", cadence: "monthly" },
  { id: "BIS_CPI_YOY_EUR", ccy: "EUR", category: "cpi", label: "Eurozone CPI YoY (BIS)", source: "bis", cadence: "monthly" },
  { id: "BIS_CPI_YOY_GBP", ccy: "GBP", category: "cpi", label: "UK CPI YoY (BIS)", source: "bis", cadence: "monthly" },
  { id: "BIS_CPI_YOY_JPY", ccy: "JPY", category: "cpi", label: "Japan CPI YoY (BIS)", source: "bis", cadence: "monthly" },
  { id: "BIS_CPI_YOY_CHF", ccy: "CHF", category: "cpi", label: "Schweiz CPI YoY (BIS)", source: "bis", cadence: "monthly" },
  { id: "BIS_CPI_YOY_AUD", ccy: "AUD", category: "cpi", label: "Australien CPI YoY (BIS, quartalsweise)", source: "bis", cadence: "quarterly" },
  { id: "BIS_CPI_YOY_NZD", ccy: "NZD", category: "cpi", label: "Neuseeland CPI YoY (BIS, quartalsweise)", source: "bis", cadence: "quarterly" },
  { id: "BIS_CPI_YOY_CAD", ccy: "CAD", category: "cpi", label: "Kanada CPI YoY (BIS)", source: "bis", cadence: "monthly" },

  // — Arbeitslosenquote —
  { id: "UNRATE", ccy: "USD", category: "unemployment", label: "US Arbeitslosenquote" },
  { id: "LRHUTTTTEZM156S", ccy: "EUR", category: "unemployment", label: "Eurozone Arbeitslosenquote" , eingestellt: "OECD-Arbeitsmarktfeed 2024 eingestellt" },
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
  { id: "CLVMNACSCAB1GQUK", ccy: "GBP", category: "gdp", label: "UK reales BIP", isIndex: true , eingestellt: "Eurostat-Altbestand, seit 2024 ohne Werte" },
  { id: "JPNRGDPEXP", ccy: "JPY", category: "gdp", label: "Japan reales BIP", isIndex: true },
  { id: "CLVMNACSCAB1GQCH", ccy: "CHF", category: "gdp", label: "Schweiz reales BIP", isIndex: true },
  { id: "AUSGDPRQDSMEI", ccy: "AUD", category: "gdp", label: "Australien reales BIP", isIndex: true , eingestellt: "OECD-BIP-Feed 2024 eingestellt" },
  { id: "NZLGDPRQDSMEI", ccy: "NZD", category: "gdp", label: "Neuseeland reales BIP", isIndex: true , eingestellt: "OECD-BIP-Feed 2024 eingestellt" },
  { id: "NGDPRSAXDCCAQ", ccy: "CAD", category: "gdp", label: "Kanada reales BIP", isIndex: true },

  // — OECD CLI (PMI-Proxy) —
  { id: "USALOLITONOSTSAM", ccy: "USD", category: "cli", label: "US Leading Indicator (CLI)" , eingestellt: "OECD hat den CLI-Feed 2024 eingestellt" },
  { id: "EA19LOLITONOSTSAM", ccy: "EUR", category: "cli", label: "Eurozone CLI" , eingestellt: "OECD hat den CLI-Feed 2024 eingestellt" },
  { id: "GBRLOLITONOSTSAM", ccy: "GBP", category: "cli", label: "UK CLI" , eingestellt: "OECD hat den CLI-Feed 2024 eingestellt" },
  { id: "JPNLOLITONOSTSAM", ccy: "JPY", category: "cli", label: "Japan CLI" , eingestellt: "OECD hat den CLI-Feed 2024 eingestellt" },
  { id: "CHELOLITONOSTSAM", ccy: "CHF", category: "cli", label: "Schweiz CLI" , eingestellt: "OECD hat den CLI-Feed 2024 eingestellt" },
  { id: "AUSLOLITONOSTSAM", ccy: "AUD", category: "cli", label: "Australien CLI" , eingestellt: "OECD hat den CLI-Feed 2024 eingestellt" },
  { id: "CANLOLITONOSTSAM", ccy: "CAD", category: "cli", label: "Kanada CLI" , eingestellt: "OECD hat den CLI-Feed 2024 eingestellt" },
  // NZ: kein OECD-CLI verfügbar

  // — Handelsbilanz (US sicher; Rest OECD, stale-tolerant) —
  { id: "BOPGSTB", ccy: "USD", category: "trade", label: "US Handelsbilanz" },
  { id: "XTNTVA01EZM667S", ccy: "EUR", category: "trade", label: "Eurozone Handelsbilanz" , eingestellt: "OECD-Handelsfeed 2024 eingestellt" },
  { id: "XTNTVA01GBM667S", ccy: "GBP", category: "trade", label: "UK Handelsbilanz" },
  { id: "XTNTVA01JPM667S", ccy: "JPY", category: "trade", label: "Japan Handelsbilanz" },
  { id: "XTNTVA01CHM667S", ccy: "CHF", category: "trade", label: "Schweiz Handelsbilanz" },
  { id: "XTNTVA01AUM667S", ccy: "AUD", category: "trade", label: "Australien Handelsbilanz" },
  { id: "XTNTVA01NZM667S", ccy: "NZD", category: "trade", label: "Neuseeland Handelsbilanz" },
  { id: "XTNTVA01CAM667S", ccy: "CAD", category: "trade", label: "Kanada Handelsbilanz" },

  // — Yield Curve (nur USA; Rezessions-Signal bei Inversion) —
  { id: "T10Y2Y", ccy: "USD", category: "yield_curve", label: "US 10-2Y Spread", cadence: "daily" },

  // — PMI (nur USA; Rest nutzt OECD CLI + BCI als Doppel-Proxy) —
  { id: "NAPM", ccy: "USD", category: "pmi", label: "ISM Manufacturing PMI" , eingestellt: "ISM erlaubt FRED die Verbreitung nicht mehr" },

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
  { id: "LOCOCIORNZQ665S", ccy: "NZD", category: "sentiment", label: "Consumer Confidence NZD (Q)" , eingestellt: "OECD-Feed 2024 eingestellt" },
  { id: "CSCICP02CHQ460S", ccy: "CHF", category: "sentiment", label: "Consumer Confidence CHF (Q)" },

  // — Retail Sales (Volume Index, alle 8) —
  { id: "RSXFS", ccy: "USD", category: "retail_sales", label: "US Retail Sales ex Food Services" },
  { id: "SLRTTO01EZM659S", ccy: "EUR", category: "retail_sales", label: "Retail Trade Volume EUR" , eingestellt: "OECD-Retail-Feed 2024 eingestellt" },
  { id: "SLRTTO01GBM659S", ccy: "GBP", category: "retail_sales", label: "Retail Trade Volume GBP" , eingestellt: "OECD-Retail-Feed 2024 eingestellt" },
  { id: "SLRTTO01JPM659S", ccy: "JPY", category: "retail_sales", label: "Retail Trade Volume JPY" , eingestellt: "OECD-Retail-Feed 2024 eingestellt" },
  { id: "SLRTTO01AUM659S", ccy: "AUD", category: "retail_sales", label: "Retail Trade Volume AUD" , eingestellt: "OECD-Retail-Feed 2024 eingestellt" },
  { id: "SLRTTO01NZM659S", ccy: "NZD", category: "retail_sales", label: "Retail Trade Volume NZD" , eingestellt: "OECD-Retail-Feed 2024 eingestellt" },
  { id: "SLRTTO01CAM659S", ccy: "CAD", category: "retail_sales", label: "Retail Trade Volume CAD" , eingestellt: "OECD-Retail-Feed 2024 eingestellt" },
  { id: "SLRTTO01CHM659S", ccy: "CHF", category: "retail_sales", label: "Retail Trade Volume CHF" , eingestellt: "OECD-Retail-Feed 2024 eingestellt" },

  // — Zentralbank-Bilanzsummen (Fed/EZB/BoJ decken >80% globaler ZB-Liquidität) —
  { id: "WALCL", ccy: "USD", category: "balance_sheet", label: "Fed Total Assets", cadence: "weekly" },
  { id: "ECBASSETSW", ccy: "EUR", category: "balance_sheet", label: "ECB Total Assets", cadence: "weekly" },
  { id: "JPNASSETS", ccy: "JPY", category: "balance_sheet", label: "BoJ Total Assets", cadence: "monthly" },

  // — Marktdaten —
  { id: "VIXCLS", ccy: null, category: "market", label: "VIX", cadence: "daily" },
  { id: "DTWEXBGS", ccy: null, category: "market", label: "Broad Dollar Index", cadence: "daily" },
  { id: "DEXSDUS", ccy: null, category: "market", label: "USD/SEK (für DXY-Formel)", cadence: "daily" },
];

export const FRED_BY_ID = new Map(FRED_CATALOG.map((s) => [s.id, s]));

export function seriesFor(ccy: string, category: FredCategory): FredSeriesDef | undefined {
  return FRED_CATALOG.find((s) => s.ccy === ccy && s.category === category);
}
