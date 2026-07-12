# Macro Terminal + COT Intelligence — Claude Code Prompt

Stand: 2026-07-12

Zwei neue Module für den GVA-Screener, inspiriert von Veltrix Desk. Beides Frontend-only
(Next.js), Daten aus bestehenden Supabase-Tabellen + FRED-Serien. Kein neues Backend nötig.

---

## Claude Code Prompt

```markdown
## Kontext

GVA-Screener — privates FX-Trading-Tool für 28 Pairs.
- **Frontend:** `frontend-next/` auf Vercel (Next.js 16, Vite, React, Tailwind).
- **Backend:** `Backend/` auf Render (FastAPI), wird hier NICHT verändert.
- **Supabase:** Service-Role-Key (RLS deny-all), pagedSelect für >1000 Zeilen.

### Bestehende Datenquellen (Supabase-Tabellen)
- `fred_series` + `fred_series_meta` — ~70 FRED-Serien, bereits befüllt:
  - **Policy Rates** (8 Währungen): FEDFUNDS, ECBDFR, IRSTCI01xxM156N, IR3TIB01xxM156N
  - **10Y Yields** (8 Währungen): DGS10, IRLTLT01xxM156N
  - **CPI** (8 Währungen): CPIAUCSL, CP0000EZ19M086NEST, xxCPIALLMINMEI (teils stale)
  - **Arbeitslosenquote** (8 Währungen): UNRATE, LRHUTTTTxxM156S/Q156S
  - **BIP** (8 Währungen): A191RL1Q225SBEA, CLVMNACxxxx, xxGDPRQDSMEI
  - **OECD CLI** (7 Währungen, kein NZD): xxLOLITONOSTSAM
  - **US Realrendite:** DFII10, Breakeven: T10YIE, T5YIE
  - **Yield Curve:** T10Y2Y (fehlt noch in fredSeries.ts, muss ergänzt werden)
  - **Markt:** VIXCLS, DTWEXBGS
  - Definitionen: `lib/constants/fredSeries.ts` (FRED_CATALOG, seriesFor())
  - Datenlader: `lib/data/fred.ts` (getFredSeries(), getFredStaleness())
  - Update-Job: `lib/jobs/updateFred.ts`

- `cot_reports` — Legacy COT (Non-Commercials, Commercials, Non-Reportables)
  - 12 Contracts (8 FX + DXY + Gold + Öl + SPX), wöchentlich seit ~2006
  - Felder: noncomm_long, noncomm_short, comm_long, comm_short, nonrept_long, nonrept_short, open_interest
  - Datenlader: `lib/data/cot.ts` (getCotSeries, getCotSeriesBatch, getLatestReports)

- `cot_tff_reports` — TFF (Traders in Financial Futures)
  - Felder: dealer_long, dealer_short, asset_mgr_long, asset_mgr_short, lev_money_long, lev_money_short, open_interest
  - Datenlader: `lib/data/cot.ts` (getTffSeriesBatch, getLatestTffReports)
  - Perzentil-Berechnung: `lib/calc/percentile.ts` (rollingPercentile)
  - Flow-Berechnung: `lib/calc/cotDelta.ts` (computeCotFlow)

- `price_daily` — Tageskerzen für 28 FX-Pairs + SPX500_USD, XAU_USD etc.

- `calendar_events` — Wirtschaftskalender (für aktuelle CPI-Werte bei stale FRED-Serien)

### Bestehende relevante Calc-Module
- `lib/calc/currencyBias.ts` — 4-Faktor Währungsbewertung (COT-Flow, Leitzins-Trend, CB-Stance, 1M-Stärke)
- `lib/calc/riskGauge.ts` — Risk-On/Off Composite (0-100, aus VIX/Gold/JPY+CHF/SPX)
- `lib/calc/cotDelta.ts` — COT-Flow (delta1w, delta4w, percentile, streak)

### Styling-Referenz
- `components/ml/LaborExplorer.tsx` — Referenz für Tailwind-Klassen:
  text-up/text-down/text-muted/text-faint, bg-surface2, border-border, font-mono für Zahlen.
  Segmented-Button-Filter. "use client". Helper: makeStat(), wrCls(), wrBg(), fmtWr().

### Navigation
- `components/layout/nav.ts` — NAV_GROUPS + PAGE_TITLES.

### API-Pattern
- `app/api/ml/matrix/route.ts` — Referenz: unstable_cache, createServiceClient, maxDuration=300.

## Aufgabe

Baue zwei neue Module:

### MODUL 1: Macro Terminal (`/makro/terminal`)

Eine Seite die auf einen Blick zeigt: wie steht jede G8-Währung fundamental da?

#### 1a. G10 Dashboard (oberer Bereich)
8 Währungskarten (USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF), jede zeigt:
- **Währungsname + Flagge** (Emoji reicht: 🇺🇸 🇪🇺 🇬🇧 🇯🇵 🇦🇺 🇳🇿 🇨🇦 🇨🇭)
- **Macro Score** (-100 bis +100, berechnet aus Sub-Scores, siehe unten)
- **Regime-Badge:** Eins von: GOLDILOCKS (grün), REFLATION (gelb), STAGFLATION (rot), OVERHEATING (orange), DISINFLATION (blau), basierend auf Growth + Inflation Richtung:
  - Growth↑ + Inflation↓ = GOLDILOCKS
  - Growth↑ + Inflation↑ = OVERHEATING
  - Growth↓ + Inflation↑ = STAGFLATION
  - Growth↓ + Inflation↓ = DISINFLATION
  - Sonst = REFLATION (neutral)
  - Growth: CLI >100.2 = ↑, <99.8 = ↓ (OECD CLI normiert auf 100)
  - Inflation: CPI YoY > Zentralbank-Ziel (2% für die meisten, 0% JPY, 1-3% AUD/NZD) = ↑
- **Policy Rate** (aktueller Leitzins)
- **CPI YoY** (berechnet aus CPI-Index oder calendar_events.actual als Fallback)
- **10Y Yield** (Staatsanleihenrendite)
- **Swing Bias:** LONG/SHORT/NEUTRAL Badge — abgeleitet aus dem Score (+/-Schwelle ≥15 = LONG/SHORT)

#### 1b. Score Breakdown (Tabelle darunter)
Tabelle mit 8 Zeilen (Währungen) × 9 Sub-Score-Spalten + Total + Bias:

| Spalte | Berechnung | Normierung |
|--------|-----------|------------|
| **Growth** | CLI-Niveau: >100.5 = +100, >100.2 = +50, 99.8-100.2 = 0, <99.8 = -50, <99.5 = -100 | -100 bis +100 |
| **Inflation** | CPI YoY vs. Ziel: Δ >2pp = +100, >1pp = +50, ±1pp = 0, <-1pp = -50, <-2pp = -100 | -100 bis +100 |
| **Labour** | Arbeitslosenquote: 3M-Trend fallend = +50, stabil = 0, steigend = -50 | -100 bis +100 |
| **Rates** | Policy-Rate-Trend (3M-Änderung): >0.25 = +100 (hawkish), <-0.25 = -100 (dovish) | -100 bis +100 |
| **Real Yield** | 10Y - CPI YoY: >2% = +100, >0 = +50, <0 = -50, <-2% = -100 | -100 bis +100 |
| **Sentiment** | Consumer Confidence: 3M-Trend steigend = +50, stabil = 0, fallend = -50. Für Quartalsserien (NZD, CHF): Q/Q-Vergleich. CAD: 0 (keine Daten). | -100 bis +100 |
| **Retail** | Retail Sales Volume: 3M-Trend steigend = +50, stabil = 0, fallend = -50. | -100 bis +100 |
| **Liquidity** | Balance Sheet 3M-Trend: wachsend = +50 (QE), schrumpfend = -50 (QT). Für USD/EUR/JPY aus FRED. Für Rest: 0 (keine Daten). Zusätzlich für USD: VIX <15 = +25 Bonus, >25 = -25 Malus. | -100 bis +100 |
| **Curve/Risk** | Für USD: T10Y2Y >0 = +50, <0 = -50 (invertiert = Rezession). Für Rest: 0 (keine Yield-Curve-Serien). | -100 bis +100 |
| **TOTAL** | Gleichgewichteter Durchschnitt der Sub-Scores | -100 bis +100 |
| **BIAS** | TOTAL ≥15 = NEUTRAL(LONG-Tendenz), ≤-15 = NEUTRAL(SHORT-Tendenz), sonst NEUTRAL | Text |

Farbcodierung der Zellen: positiv = blau/grün, negativ = rot/pink, 0 = grau.

#### 1c. Central Bank Monitor (Tab oder Sektion darunter)
Tabelle: 8 Zentralbanken:

| Spalte | Quelle |
|--------|--------|
| Central Bank | Statisch (Fed, ECB, BoE, BoJ, SNB, RBA, RBNZ, BoC) |
| CCY | USD, EUR, GBP, JPY, CHF, AUD, NZD, CAD |
| Policy Rate | fred_series (policy_rate Kategorie) |
| Last Change | Aus fred_series: Vergleich letzter vs. vorletzter Wert. "↑ 25 bps · YYYY-MM-DD" oder "↓ 25 bps" |
| Real Rate | Policy Rate − CPI YoY |
| Inflation Gap | CPI YoY − Ziel (2% Default, 0% JPY, 2.5% AUD/NZD Midpoint) |
| Balance Sheet | FRED Balance Sheet Serie (WALCL/ECBASSETSW/JPNASSETS). Aktueller Wert formatiert (z.B. "$7.2T"). Für BoE/RBA/BoC/SNB/RBNZ: "n/a" |
| QE/QT | Aus Balance Sheet 3M-Trend: wachsend = "QE 🟢", schrumpfend = "QT 🔴", stabil = "HOLD 🟡". Für fehlende: "—" |
| Policy Bias | HAWKISH (Rate stieg letzte 6M oder Inflation Gap >1) / DOVISH (Rate fiel oder Gap <-1) / NEUTRAL |

#### 1d. Neue FRED-Serien ergänzen
In `fredSeries.ts` FRED_CATALOG ergänzen:

**Yield Curve:**
- `T10Y2Y` (Kategorie "yield_curve", ccy: "USD", label: "US 10-2Y Spread")

**PMI (nur USA, Rest nutzt OECD CLI als Proxy):**
- `NAPM` (Kategorie "pmi", ccy: "USD", label: "ISM Manufacturing PMI")

**Consumer Confidence (alle 8 Währungen):**
- `UMCSENT` (Kategorie "sentiment", ccy: "USD", label: "UMich Consumer Sentiment")
- `CSCICP02EZM460S` (Kategorie "sentiment", ccy: "EUR", label: "Consumer Confidence EUR")
- `CSCICP02GBM460S` (Kategorie "sentiment", ccy: "GBP", label: "Consumer Confidence GBP")
- `CSCICP02JPM460S` (Kategorie "sentiment", ccy: "JPY", label: "Consumer Confidence JPY")
- `CSCICP02AUM460S` (Kategorie "sentiment", ccy: "AUD", label: "Consumer Confidence AUD")
- `LOCOCIORNZQ665S` (Kategorie "sentiment", ccy: "NZD", label: "Consumer Confidence NZD (quarterly)")
- `CSCICP02CHQ460S` (Kategorie "sentiment", ccy: "CHF", label: "Consumer Confidence CHF (quarterly)")
- Hinweis: Kanada (CAD) hat keine aktive FRED-Serie für Consumer Confidence — Feld leer lassen mit ⚠️.

**Retail Sales (alle 8 Währungen):**
- `RSXFS` (Kategorie "retail_sales", ccy: "USD", label: "US Retail Sales ex Food Services")
- `SLRTTO01EZM659S` (Kategorie "retail_sales", ccy: "EUR", label: "Retail Trade Volume EUR")
- `SLRTTO01GBM659S` (Kategorie "retail_sales", ccy: "GBP", label: "Retail Trade Volume GBP")
- `SLRTTO01JPM659S` (Kategorie "retail_sales", ccy: "JPY", label: "Retail Trade Volume JPY")
- `SLRTTO01AUM659S` (Kategorie "retail_sales", ccy: "AUD", label: "Retail Trade Volume AUD")
- `SLRTTO01NZM659S` (Kategorie "retail_sales", ccy: "NZD", label: "Retail Trade Volume NZD")
- `SLRTTO01CAM659S` (Kategorie "retail_sales", ccy: "CAD", label: "Retail Trade Volume CAD")
- `SLRTTO01CHM659S` (Kategorie "retail_sales", ccy: "CHF", label: "Retail Trade Volume CHF")

**Central Bank Balance Sheets (3 große):**
- `WALCL` (Kategorie "balance_sheet", ccy: "USD", label: "Fed Total Assets")
- `ECBASSETSW` (Kategorie "balance_sheet", ccy: "EUR", label: "ECB Total Assets")
- `JPNASSETS` (Kategorie "balance_sheet", ccy: "JPY", label: "BoJ Total Assets")
- Hinweis: BoE/RBA/BoC/SNB/RBNZ haben keine FRED-Serien für Balance Sheets. Für diese Währungen bleibt das Feld leer. Fed+ECB+BoJ decken >80% der globalen ZB-Liquidität ab.

Neue FredCategory-Werte hinzufügen: `"yield_curve" | "sentiment" | "pmi" | "retail_sales" | "balance_sheet"`.

Dann im Update-Job sicherstellen, dass diese neuen Serien beim nächsten FRED-Cron-Run gefetcht werden.

---

### MODUL 2: COT Intelligence (`/cot/intelligence`)

Vollständige Überarbeitung der COT-Analyse-Seite mit institutioneller Positionierungs-Analyse.

#### 2a. Signal Engine (Kopfbereich)
Pro Währung (G8) eine gewichtete Bias-Berechnung basierend auf allen COT-Trader-Gruppen:

**Gewichtung:**
- Dealer/Intermediary: 40% (Smart Money, bewegen den Markt)
- Asset Manager: 25% (Real Money, Trendfolger)
- Leveraged Funds: 20% (Momentum, Hedgefonds)
- Commercials: 10% (Hedger, konträr)
- Retail/Non-Reportable: 5% (Contrarian-Signal)

**Berechnung pro Währung:**
1. Für jede Trader-Gruppe: Netto-Position → Rolling-Perzentil (260W Fenster)
2. Perzentil normieren auf -100 bis +100: (Perzentil - 50) × 2
3. Gewichteter Score = Σ (Gruppe_Score × Gewicht)
4. Confidence = |Score| / 100 als Prozent (0-100%)

**Signal-Karte pro Währung zeigt:**
- Score (-100 bis +100)
- Bias: BULLISH (>15) / BEARISH (<-15) / NEUTRAL
- Confidence: Score als %
- Farbcodierte Balken pro Trader-Gruppe (grün = long, rot = short)
- Text: "Dealer: COT-Index 0 (aggressiv Short)" etc.

#### 2b. COT Currency Strength Ranking (Tabelle)
Tabelle: 8 Zeilen (Währungen) × 5 Trader-Gruppen + Final Bias:

| CCY | Dealer | AM | LF | Retail | Final Bias |
|-----|--------|----|----|--------|------------|

Werte: normierte Scores (-100 bis +100). Farbcodiert.
Rechts daneben: "Strongest / Weakest" Sidebar (Top 3 + Bottom 3 nach Final Bias sortiert).

#### 2c. Einzelwährungs-Detailseite (`/cot/intelligence/[currency]`)
Wenn man auf eine Währung klickt → Detailansicht:

- **Signal Engine Card** (wie oben, aber größer)
- **Institutionelle Analyse** — Auto-generierter Text basierend auf den Daten:
  - "Asset Manager befinden sich auf einem der höchsten Long-Level der jüngsten Historie (COT-Index 100)."
  - "Open Interest fällt — Positionsauflösung, Bewegung eher technischer Natur."
  - Regeln für Textgenerierung:
    - Perzentil >90 → "auf einem der höchsten X-Level"
    - Perzentil <10 → "auf einem der niedrigsten X-Level"
    - OI Δ1W < -5% → "Open Interest fällt — Positionsauflösung"
    - Netto-Position Δ1W Vorzeichen wechselt → "Flip von Long auf Short (oder umgekehrt)"

- **TFF Netto-Positionen Chart** (Linien: Dealer, Asset Mgr, Lev Funds, Other Rept., Non-Rept.)
  - Zeitraumfilter: 6M, 12M, 24M, 36M, 156W (Default: 12M)
  - Recharts Line Chart, gleiche Styling wie bestehende Charts

- **Legacy Netto-Positionen Chart** (Linien: Large Specs, Commercials, Small Traders)

- **Open Interest Chart** (Balken oder Area)

- **COT Index Chart** (Rolling-Perzentil der NC-Nettoposition, 0-100 Skala)
  - Horizontale Linien bei 20 und 80 (Extremzonen)

- **Aktuelle Positionsübersicht** (Tabelle):
  | Kategorie | Long | Short | Net | % OI | Δ Long | Δ Short | Δ Net |
  - Δ = Veränderung zur Vorwoche

- **Long vs Short Verteilung** — Donut-Charts pro Trader-Gruppe (% Long)

#### 2d. Weekly Heatmap (`/cot/intelligence` Tab oder eigene Seite)
Tabelle: alle CFTC-Märkte × Trader-Gruppen, Werte = wöchentliche Netto-Änderung (Δ Net).
- Spalten: Market | Dealer | AM | Lev Funds | Commercials | Large Specs | Small Traders | Retail
- Zeilen: 8 FX-Währungen (+ DXY, SPX, Gold falls in cot_tff_reports vorhanden)
- Farbcodierung: grün (großer Zukauf), rot (großer Abbau), grau (wenig Änderung)
- Filter: Market Group (Currencies/All), Direction (Long/Short/All), Min |Δ| Slider

#### 2e. Flips & Extremes Scanner
Tabelle die automatisch anzeigt:
- **Flips:** Märkte wo eine Trader-Gruppe diese Woche das Vorzeichen gewechselt hat (Long→Short oder umgekehrt)
- **Extremes:** Märkte wo eine Trader-Gruppe im 90. oder 10. Perzentil steht (260W Rolling)
- Sortiert nach Relevanz (Extremes mit großem OI zuerst)

---

### Navigation

In `components/layout/nav.ts`:

1. Bestehenden "Makro & Zinsen"-Link (`/makro`) in der Details-Sektion belassen.
2. Neue Einträge in der **Details**-Sektion ergänzen:
   - `{ href: "/makro/terminal", label: "Macro Terminal", icon: "ph-globe-hemisphere-west" }`
3. Den bestehenden COT-Link (`/cot`) beibehalten, aber erweitern:
   - `{ href: "/cot/intelligence", label: "COT Intelligence", icon: "ph-chart-bar" }`

PAGE_TITLES ergänzen:
- `"/makro/terminal": "Macro Terminal — G10 Currency Bias"`
- `"/cot/intelligence": "COT Intelligence — Institutionelle Positionierung"`

---

## Anforderungen

- **Keine neuen APIs/externe Dienste:** Alles aus bestehenden Supabase-Tabellen (fred_series, cot_reports, cot_tff_reports, price_daily, calendar_events). Die ~25 neuen FRED-Serien (Sentiment, Retail Sales, Balance Sheets, Yield Curve, PMI) werden über den bestehenden FRED-Update-Job automatisch befüllt — FRED ist kostenlos und braucht keinen neuen API-Key.
- **Berechnungen im Frontend:** Alle Scores, Regime-Klassifikationen und Textgenerierung sind deterministische Berechnungen auf den Rohdaten — kein LLM, kein Backend-Aufruf.
- **API-Routes mit Caching:** Wie `/api/ml/matrix` — `unstable_cache` mit 1h Revalidate, `maxDuration: 300`.
- **Styling:** Identisch zu `LaborExplorer.tsx` — dunkles Theme, gleiche Tailwind-Klassen, `font-mono` für Zahlen, Farbcodierung für positive/negative Werte.
- **Charts:** Recharts (bereits als Dependency vorhanden). Konsistent mit bestehenden Chart-Komponenten.
- **Stale-Data-Handling:** Wenn eine FRED-Serie als stale markiert ist (`fred_series_meta.is_stale`), den letzten bekannten Wert verwenden und ein kleines ⚠️ Badge anzeigen. Nie crashen wegen fehlender Daten.
- **Bestehende Dateien NICHT verändern** außer:
  - `lib/constants/fredSeries.ts`: Neue Serien + Kategorien ergänzen
  - `components/layout/nav.ts`: Neue Nav-Einträge + PAGE_TITLES
  - Alles andere: neue Dateien erstellen.
- **Responsive:** Währungskarten als Grid (4 Spalten Desktop, 2 Tablet, 1 Mobile).
- `npm run build` muss fehlerfrei durchlaufen.

### Datei-Struktur (neue Dateien)

```
frontend-next/
├── lib/
│   ├── calc/
│   │   ├── macroScore.ts          # Score-Berechnung, Regime-Klassifikation
│   │   └── cotIntelligence.ts     # Signal Engine, gewichteter Bias, Textgenerierung
│   └── data/
│       └── macroTerminal.ts       # Datenloader (kombiniert fred + cot für Terminal)
├── app/
│   ├── api/
│   │   ├── macro/terminal/route.ts
│   │   └── cot/intelligence/route.ts
│   └── (app)/
│       ├── makro/terminal/page.tsx
│       └── cot/
│           └── intelligence/
│               ├── page.tsx
│               └── [currency]/page.tsx
└── components/
    ├── macro/
    │   ├── CurrencyCard.tsx        # G10 Karte
    │   ├── ScoreBreakdown.tsx      # Score-Tabelle
    │   └── CentralBankMonitor.tsx  # ZB-Tabelle
    └── cot/
        ├── SignalEngine.tsx         # Gewichteter Bias pro Währung
        ├── CotStrengthRanking.tsx   # Ranking-Tabelle
        ├── CotDetailView.tsx        # Einzelwährungs-Detail (Charts + Tabellen)
        ├── WeeklyHeatmap.tsx        # Wöchentliche Netto-Änderungen
        └── FlipsExtremes.tsx        # Scanner
```

## Akzeptanzkriterien

1. `/makro/terminal` zeigt 8 Währungskarten mit Score, Regime-Badge, Policy Rate, CPI, 10Y, Swing Bias.
2. Score Breakdown Tabelle zeigt 9 Sub-Scores (Growth, Inflation, Labour, Rates, Real Yield, Sentiment, Retail, Liquidity, Curve/Risk) + Total + Bias für alle 8 Währungen.
3. Central Bank Monitor zeigt Policy Rate, Last Change, Real Rate, Inflation Gap, Balance Sheet, QE/QT, Policy Bias.
4. `/cot/intelligence` zeigt Signal Engine mit gewichtetem Bias und Confidence für alle G8-Währungen.
5. COT Strength Ranking Tabelle mit Dealer/AM/LF/Retail Scores + Strongest/Weakest Sidebar.
6. Klick auf Währung → Detailseite mit Charts (TFF Netto, Legacy Netto, OI, COT Index) und Positionstabelle.
7. Weekly Heatmap zeigt Δ Net pro Markt × Trader-Gruppe, farbcodiert.
8. Flips & Extremes Scanner zeigt automatisch relevante Positionswechsel und Extrempositionen.
9. ~25 neue FRED-Serien (Sentiment 7×, Retail Sales 8×, Balance Sheets 3×, T10Y2Y, UMCSENT, NAPM, RSXFS) in fredSeries.ts ergänzt mit 5 neuen Kategorien.
10. Navigation korrekt: Macro Terminal + COT Intelligence erreichbar.
11. Alle Daten aus bestehenden Supabase-Tabellen, keine neuen externen APIs.
12. `npm run build` fehlerfrei.
13. Stale FRED-Serien werden graceful behandelt (⚠️ Badge, kein Crash).
```

---

## Was Veltrix hat, was wir NICHT nachbauen (und warum)

| Veltrix-Feature | Warum nicht | Alternative im GVA-Screener |
|---|---|---|
| Top Setups Scorecard (20 Makro-Indikatoren) | Braucht ADP/JOLTS/NFP-Detail/ISM für alle Länder — FRED hat das nur für USA | Macro Terminal 9-Faktor Score (Growth/Inflation/Labour/Rates/RealYield/Sentiment/Retail/Liquidity/Curve) |
| Bias Engine (4 Engines) | Existiert bereits als Weekly Outlook + screenerReasoning.ts (5 Faktoren) | Bestehender 5-Faktor-Screener + ML-Modell |
| Retail Sentiment Detail | Existiert bereits unter `/sentiment` | Bestehende Sentiment-Seite |
| Quant Models / Market Scanner | Eigenes System, proprietär | GVA-Scanner ist unser Quant-Ansatz |
| Balance Sheet für BoE/RBA/BoC/SNB/RBNZ | Nicht auf FRED, bräuchte Scraping der jeweiligen ZB-Websites | Fed+ECB+BoJ decken >80% der globalen Liquidität ab |
| Echte PMI-Daten für Nicht-USA | S&P Global lizenziert, ~$50/Mo via Trading Economics | OECD CLI als Proxy (Korrelation ~0.85 mit PMI) |

## Was jetzt NEU abgedeckt ist (vs. erste Version des Prompts)

| Feature | Vorher | Jetzt |
|---|---|---|
| Consumer Confidence | nur USA (UMCSENT) | 7/8 Währungen (alle außer CAD) via FRED OECD-Serien |
| Retail Sales | nur USA (RSXFS) | alle 8 Währungen via FRED OECD Retail Trade Volume |
| Central Bank Balance Sheets | gar nicht | Fed + ECB + BoJ (WALCL, ECBASSETSW, JPNASSETS) |
| QE/QT Tracking | gar nicht | 3M-Trend aus Balance Sheet Daten |
| Score Sub-Faktoren | 7 (davon 2 nur USD) | 9 (davon 2 nur USD: Curve/Risk, teilweise Liquidity) |
