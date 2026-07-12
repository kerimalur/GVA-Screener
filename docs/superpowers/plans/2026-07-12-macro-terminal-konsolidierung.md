# Macro-Terminal-Konsolidierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Bias-Wahrheit für die 8 G8-Währungen, neues Macro Terminal (Übersicht / Detail-Modal / Vergleich), Dashboard = News-Widget, reduzierte Navigation, alte Routen redirecten.

**Architecture:** Neuer kanonischer Score `lib/calc/currencyScore.ts` (4 Sub-Scores COT · Zinsen · Saisonalität · Retail, je −1…+1, Total = Mittel der verfügbaren Sub-Scores, LONG ≥ +0.15 / SHORT ≤ −0.15). Neuer Server-Loader `lib/data/terminal.ts` (nur bestehende Loader/Queries wiederverwendet). Übersicht = Server-Komponente + Client-Shell (Modal, Vergleichsauswahl). Beide alten Score-Systeme (`currencyBias`/`currencyCockpit`, `macroScore`/altes MacroTerminal) werden gelöscht.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Supabase (Service-Client + `unstable_cache` wie bisher), Recharts über bestehende Chart-Komponenten. Kein Test-Framework im Repo → Verifikation über `npm run build` + `npm run lint` + manuelle Routen-Prüfung.

---

## Datei-Landkarte

**Neu:**
| Datei | Verantwortung |
|---|---|
| `frontend-next/lib/calc/currencyScore.ts` | Kanonischer Bias: Sub-Score-Formeln + Total + Richtung + CB-Haltung-Label |
| `frontend-next/lib/data/terminal.ts` | `loadTerminalData(db)` → serialisierbares `TerminalData` (8 Währungen komplett) |
| `frontend-next/components/terminal/TerminalOverview.tsx` | Client: 8 Boxen in Long/Neutral/Short, Vergleichs-Modus, öffnet Modal |
| `frontend-next/components/terminal/CurrencyModal.tsx` | Client: Modal-Rahmen (ESC/Backdrop schließt) um Detail-Sektionen |
| `frontend-next/components/terminal/CurrencyDetailSections.tsx` | Client: 4 Sub-Score-Sektionen + Intermarket-Panel; von Modal UND Vergleichsseite genutzt |
| `frontend-next/components/dashboard/NewsPanel.tsx` | Client: Mid+High-Events, Default „Heute", Umschalter „Ganze Woche" |
| `frontend-next/app/(app)/makro/terminal/vergleich/page.tsx` | Server: Vergleichsseite `?a=USD&b=EUR`, links/rechts, + RegionCompare + SpreadChart |

**Geändert:**
| Datei | Änderung |
|---|---|
| `app/(app)/makro/terminal/page.tsx` | Neu: lädt `loadTerminalData` (unstable_cache 300s), rendert TerminalOverview |
| `app/(app)/dashboard/page.tsx` | Nur noch News-Loader (calendar_events heute…+7d, Impact High+Medium) + NewsPanel |
| `components/layout/nav.ts` | Neue NAV_GROUPS + PAGE_TITLES |
| `next.config.ts` | Redirects: /cot, /makro, /sentiment, /saisonalitaet, /intermarket, /vergleich → /makro/terminal; /kalender → /dashboard |
| `lib/data/dashboard.ts` | Felder `currencyBias`, `cockpit`, `stances` + zugehörige Berechnung/Imports entfernen (Weekly braucht nur strength/risk/verdicts/cotFlows/cotPercentiles/sentimentAge) |
| `components/makro/RegionCompare.tsx` | Links `/makro?a=` → `/makro/terminal/vergleich?a=` |
| `components/layout/PairSearchBar.tsx` | ANALYSE_PREFIXES auf existierende Seiten kürzen (`/dashboard`, `/weekly`, `/cot`, `/makro`) |

**Gelöscht:**
- Seiten: `app/(app)/vergleich/`, `app/(app)/kalender/`, `app/(app)/cot/page.tsx` (Ordner bleibt wg. `intelligence/`), `app/(app)/makro/page.tsx` (Ordner bleibt wg. `terminal/`), `app/(app)/sentiment/`, `app/(app)/saisonalitaet/`, `app/(app)/intermarket/`
- Komponenten: `dashboard/CurrencyBiasPanel.tsx`, `dashboard/CurrencyCockpit.tsx`, `dashboard/StrengthPanel.tsx`, `dashboard/RiskGaugePanel.tsx`, `dashboard/ScreenerPanel.tsx`, `dashboard/CbSpectrumPanel.tsx`, `makro/MacroTerminal.tsx`, `cot/ContractSelector.tsx`, `cot/MultiCompare.tsx`, `cot/BacktestPanel.tsx`, `cot/ConditionalOutcomePanel.tsx`, `vergleich/SeriesPicker.tsx`, `saisonalitaet/SeasonalityHeatmap.tsx`, `kalender/EventList.tsx`
- Libs: `lib/calc/currencyBias.ts`, `lib/calc/currencyCockpit.ts`, `lib/calc/macroScore.ts`, `lib/calc/cotBacktest.ts`, `lib/calc/conditionalOutcome.ts`, `lib/data/macroTerminal.ts`
- API-Routen: `app/api/makro/terminal/`, `app/api/data/cot/backtest/`, `app/api/data/cot/conditional/`

**Bleibt (wird wiederverwendet):** `CotSnapshotTable`, `CotHistoryChart` (self-fetch `/api/data/cot`), `SentimentGrid`, `SentimentHistory`, `SeasonalityDetail` (bekommt aggregierte Währungs-Monate), `OverlayChart`, `CorrelationMatrix` bleibt ungenutzt? → **löschen nein**: wird NICHT mehr gebraucht → prüfen; `CompareStatsTable` (Import von OverlayChart!), `RegionCompare`, `SpreadChart`, `ExpectationsPanel` (Zinsen-Detail nutzt eigene kompakte Darstellung; ExpectationsPanel wird gelöscht wenn ungenutzt — Entscheidung: Meeting-Erwartung wandert in Zinsen-Sektion, `ExpectationsPanel` löschen), `riskGauge`/`strength`/`screenerReasoning` (Weekly), `cbStance` (Zinsen-Sub-Score), `cotDelta`, `seasonality`, alle `lib/data/*` Loader.

---

## Kanonische Score-Formeln (`lib/calc/currencyScore.ts`)

Alle Sub-Scores −1…+1, `null` wenn Datenquelle fehlt. Total = Mittelwert der non-null Sub-Scores. Richtung: `LONG` ≥ +0.15, `SHORT` ≤ −0.15, sonst `NEUTRAL`.

```ts
// COT: Smart-Money-Flow 4W in % OI (TFF Leveraged Funds, Fallback Legacy NonComm)
cot = clamp(delta4wPctOi / 5, -1, 1)            // ±2 %OI (alte Richtungsschwelle) → ±0.4
// Zinsen: 50% CB-Stance (combineStance: 60% manuell + 40% 6M-Trajektorie, −10…+10)
//         50% Leitzins-Differenz zum G8-Durchschnitt der anderen 7
zinsen = 0.5 * (stance.score / 10) + 0.5 * clamp((rate - avgOtherRates) / 2, -1, 1)
// Saisonalität: Ø ccy-relativer Monats-Return über die 7 Pairs (Quote invertiert),
//               nur Pairs mit years >= 8 (konsistente Muster)
saison = clamp(avgCcyReturnCurrentMonth / 0.5, -1, 1)   // ±0.3% (alte Schwelle) → ±0.6
// Retail (konträr): Ø Retail-Long-% aus Sicht der Währung über ihre Pairs
retail = clamp((50 - avgRetailLongPct) / 20, -1, 1)     // 60% long (alte Schwelle) → −0.5
```

CB-Haltung (explizit im Zinsen-Sub-Score angezeigt): `stance.score >= 2 → HAWKISH`, `<= -2 → DOVISH`, sonst `NEUTRAL` (gleiche Schwellen wie bisheriges 4-Faktoren-Modell).

COT-Divergenz-Feature: Niveau-Perzentil ≥ 80 bei negativem 4W-Flow → „Distribution im Extrem (bearishe Divergenz)"; Perzentil ≤ 20 bei positivem Flow → bullishe Divergenz; sonst keine.

## TerminalData-Shape (`lib/data/terminal.ts`, JSON-serialisierbar)

```ts
interface TerminalCurrency {
  ccy: string; flag: string; bank: string;
  score: CurrencyScore; // { total, direction, subs: { cot, zinsen, saison, retail } je {score|null, text} }
  cot: {
    legacyLatest: CotReportRow | null; legacyPrev: CotReportRow | null;
    tffLatest: CotTffRow | null; tffPrev: CotTffRow | null;
    percentile: number | null; flow: CotFlowSummary | null;
    divergence: { dir: -1 | 1; text: string } | null;
    contractCode: string | null;
  };
  rates: {
    policyRate: number | null; y10: number | null;
    lastChangeBps: number | null; lastChangeDate: string | null; delta6mBps: number | null;
    diffs: Array<{ ccy: string; rateDiff: number | null; y10Diff: number | null }>;
    stance: { score: number; label: "HAWKISH" | "DOVISH" | "NEUTRAL"; rationale: string };
    nextMeeting: { date: string; expectedBps: number | null } | null;
  };
  season: {
    months: Array<{ month: number; avgReturn: number; hitRate: number; years: number }>; // ccy-aggregiert
    longPairs: string[]; shortPairs: string[]; monthLabel: string;
  };
  retail: { avgLongPct: number | null; pairs: Array<{ pair: string; longPct: number; shortPct: number }> };
  intermarket: {
    commodity: { label: string; instrument: string; pairInstrument: string } | null; // AUD→Gold, CAD→WTI, NZD→Kupfer
    usdImpact: Array<{ pair: string; ret1M: number | null }> | null; // nur USD (aus loadIntermarketData)
  };
}
```

Queries (alle bestehend): `getFredBatch` (policy+y10, 10J), `getCotSeriesBatch`/`getTffSeriesBatch` (G8-Codes), `getLatestReports`/`getLatestTffReports`, `getSeasonalityStats`, sentiment_snapshots (limit 120), `cb_stance`, `cb_meetings` (nur zukünftige), `loadIntermarketData` nur für USD-Impact (kein DXY-Serien-Transfer ins Modal). Charts im Modal laden client-seitig über bestehende APIs (`/api/data/cot?code=`, `/api/data/series`).

## Navigation (Ziel)

```ts
Analyse:  /weekly (Weekly Outlook) · /makro/terminal (Macro Terminal) · /cot/intelligence (COT Intelligence)
Markt-Scanner: unverändert
Journal:  unverändert
Machine Learning: unverändert
System:   /einstellungen (Einstellungen) · /leitfaden (Leitfaden)
```

`/dashboard` bleibt als Startseite erreichbar (Root `/` redirectet dorthin), taucht laut Zielstruktur nicht in der Nav auf.

## Redirects (`next.config.ts`)

```ts
async redirects() {
  return [
    { source: "/cot", destination: "/makro/terminal", permanent: false },
    { source: "/makro", destination: "/makro/terminal", permanent: false },
    { source: "/sentiment", destination: "/makro/terminal", permanent: false },
    { source: "/saisonalitaet", destination: "/makro/terminal", permanent: false },
    { source: "/intermarket", destination: "/makro/terminal", permanent: false },
    { source: "/vergleich", destination: "/makro/terminal", permanent: false },
    { source: "/kalender", destination: "/dashboard", permanent: false },
  ];
}
```

(`/cot` exakt matcht nicht `/cot/intelligence` — Intelligence bleibt erreichbar.)

---

## Tasks (Reihenfolge = Ausführung)

### Task 1: Kanonischer Score
- [ ] `lib/calc/currencyScore.ts` schreiben (Formeln oben; reine Funktionen, Inputs als primitive Werte/Maps)
- [ ] `npx tsc --noEmit` grün

### Task 2: Terminal-Loader
- [ ] `lib/data/terminal.ts` schreiben (Shape oben, alles parallel via Promise.all, keine Maps im Rückgabewert)
- [ ] `npx tsc --noEmit` grün

### Task 3: Terminal-UI
- [ ] `components/terminal/TerminalOverview.tsx`: Gruppierung Long/Neutral/Short (sortiert nach |total|), Box = ccy/flag/total/4 Sub-Score-Indikatoren (C·Z·S·R mit ▲▼•), „Vergleichen"-Button, Auswahl-Feedback („Pair 1"/„Pair 2"), 2. Klick → `router.push("/makro/terminal/vergleich?a=..&b=..")`, normaler Klick → Modal
- [ ] `components/terminal/CurrencyDetailSections.tsx`: Sektionen COT (Sub-Score, Flow, Perzentil+Extrem, Divergenz, CotSnapshotTable legacy, TFF-Mini-Tabelle Dealer/AssetMgr/LevFunds, CotHistoryChart aufklappbar, Link COT Intelligence), Zinsen (Leitzins, Momentum hiking/cutting, CB-Haltung-Badge, Differenz-Tabelle zu 7 anderen [Rate + 10Y], nächster Zinsentscheid mit erwarteten bps), Saisonalität (SeasonalityDetail mit aggregierten Monaten, Long/Short-Pairs des Monats), Retail (Ø-Long%, konträre Deutung, SentimentGrid der 7 Pairs, SentimentHistory aufklappbar), Intermarket (Commodity-OverlayChart für AUD/CAD/NZD, USD-Impact-Balken für USD, sonst Hinweis + Korrelationshinweis via Pairs)
- [ ] `components/terminal/CurrencyModal.tsx`: Overlay + ESC/Backdrop, scrollbarer Inhalt, nutzt CurrencyDetailSections
- [ ] `app/(app)/makro/terminal/page.tsx` neu schreiben (unstable_cache 300s, Setup-Hinweis-Fallback wie bisher)
- [ ] `app/(app)/makro/terminal/vergleich/page.tsx`: Params validieren (Default USD/EUR), Header mit „← Zurück zur Übersicht", zwei Spalten CurrencyDetailSections, darunter RegionCompare (loadRegion-Logik aus alter /makro-Seite hierher) + SpreadChart (Pair aus a/b wenn existent, sonst EUR_USD)
- [ ] Build grün

### Task 4: Dashboard
- [ ] `components/dashboard/NewsPanel.tsx` (Client): Props `events: CalendarEventRow[]`; strikt Impact High+Medium (Loader filtert schon); Toggle „Heute" (Default) / „Ganze Woche"; Tages-Gruppierung + Zeilen-Layout wie EventList (Zeit · Impact-Badge · CCY · Titel · Actual/Forecast/Previous)
- [ ] `app/(app)/dashboard/page.tsx` neu: Loader `calendar_events` von heute 00:00 bis +7 Tage, `.in("impact", ["High","Medium"])`, unstable_cache 300s; rendert nur News-Panel (+ Setup-Fallback)
- [ ] `lib/data/dashboard.ts`: `currencyBias`, `cockpit`, `stances` entfernen (inkl. Imports/Berechnung); Weekly-Kompilierung prüfen
- [ ] Build grün

### Task 5: Navigation, Redirects, Löschungen
- [ ] `nav.ts`: NAV_GROUPS + PAGE_TITLES (neu: `/makro/terminal/vergleich`; raus: alle gelöschten Routen)
- [ ] `next.config.ts`: Redirects (oben)
- [ ] Alle „Gelöscht"-Dateien entfernen; `RegionCompare`-Links + `PairSearchBar`-Prefixes fixen
- [ ] `grep` auf verwaiste Imports (`CurrencyCockpit|currencyBias|macroScore|MacroTerminal|EventList|SeriesPicker|BacktestPanel|ConditionalOutcome|MultiCompare|ContractSelector|SeasonalityHeatmap|ExpectationsPanel|CorrelationMatrix|OverlayTool|DxyChart`) → Reste fixen (OverlayTool/DxyChart/CorrelationMatrix löschen falls ungenutzt, `loadIntermarketData` bleibt für USD-Impact)
- [ ] Build grün

### Task 6: Verifikation
- [ ] `npm run build` (alle Routen kompilieren, Redirects registriert)
- [ ] `npm run lint`
- [ ] Route-Inventar gegen Akzeptanzkriterien prüfen (Terminal-Übersicht/Modal/Vergleich, Dashboard nur News, Nav exakt, COT Intelligence unberührt, Scanner/Journal/ML unberührt via `git diff --stat`)
- [ ] Commit

## Selbst-Review (gegen Spec)
- Eine Bias-Logik: currencyBias/currencyCockpit/macroScore gelöscht, nur currencyScore ✓
- CB-Haltung explizit im Zinsen-Sub-Score ✓ (Badge HAWKISH/DOVISH/NEUTRAL)
- News-Widget Mid+High, heute/Woche ✓
- Redirects statt 404 ✓ · CurrencyBiasPanel gelöscht ✓ · Scanner/Journal/ML unberührt ✓
- Look-ahead: keine Zeitreihen-Logik geändert (nur bestehende Loader/Formel-Schwellen wiederverwendet) ✓
