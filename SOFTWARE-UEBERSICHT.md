# Software-Übersicht

> Automatisch generierte Doku aller Seiten, Tabs & Features des GVA-Screener-Frontends (`frontend-next/`, Next.js App Router).
> Basis: tatsächlicher Code-Stand (nav.ts, app/-Verzeichnis, Komponenten). Keine Annahmen — nur was im Code existiert.
> Stand der Analyse: 2026-07-12

Gruppierung folgt der echten Navigation aus `components/layout/nav.ts` (`NAV_GROUPS`). Route → Seite unter `app/(app)/…/page.tsx`.

---

## Gruppe: Analyse

### Tab: Dashboard  `/dashboard`
- **Funktion:** Server-Seite (`loadDashboardData` aus Supabase). Rendert das **Währungs-Cockpit** (8 Währungen untereinander, Bias aus 4 Faktoren + COT · Zinsen · Retail · Saisonalität · High-Impact-News-Flag, aufklappbar), den **Currency Strength Index** (relative Stärke aus 28 Paaren, Ø signierter Return), ein **Risk-On/Risk-Off-Gauge** (VIX · Gold · JPY/CHF-Flows · S&P-Trend), das **CB-Spektrum** (Zentralbank-Haltung) und den **Screener-Panel**. Zeigt „Setup nötig", wenn Supabase nicht erreichbar.
- **Mehrwert:** Zentrale Tages-Übersicht — auf einen Blick sehen, welche Währung fundamental stark/schwach ist und wie das Marktregime (Risk-On/Off) steht.
- **Status:** aktiv (zuletzt umgebaut 2026-07-11, Commit 64d59aa).

### Tab: Weekly Outlook  `/weekly`
- **Funktion:** Server-Seite (`loadWeeklyData`). „Sonntagabend-Cockpit": Top-Down-Dossier je Pair, sortiert nach Signalstärke (Faktoren-Konfluenz + Smart-Money-Rotation), inkl. Streak-Anzeige „seit N Wochen · KWxx" aus `weekly_outlook_snapshots`. Eigene Karte für BTC (`WeeklyBtcCard`). Separater Block „Ohne Signal" (< 2 gleichgerichtete Faktoren = Beobachtungsliste).
- **Mehrwert:** Wöchentliche Trade-Vorbereitung — welche Pairs die stärkste fundamentale Konfluenz haben, als Ausgangsbasis fürs manuelle Backtesting/Trading.
- **Status:** aktiv.

### Tab: Vergleich  `/vergleich`
- **Funktion:** Client-Tool (`SeriesPicker` + `OverlayChart`). Legt zwei beliebige Zeitreihen übereinander — Typen: Preis, COT-Netto, 10Y-Spread, Zinsdifferenz, Retail-Sentiment, FRED-Serie. Dual-Achse oder normalisiert.
- **Mehrwert:** Freies Explorations-Tool, um Zusammenhänge zwischen Kursen und Fundamentaldaten selbst zu prüfen.
- **Status:** aktiv.

---

## Gruppe: Details  *(einklappbar; Auto-Open bei aktiver Route)*

### Tab: COT-Analyse  `/cot`
- **Funktion:** Server-Seite (`getLatestReports`, `getCotSeriesBatch`). Enthält mehrere Panels: aktueller Report je Contract (Positionen/Netto/Δ), Extrem-Übersicht aller Contracts (Positionierungs-Perzentil Non-Commercials, 5J-Fenster), Historie-Chart (NC & Commercials netto + Preis-Overlay + Perzentil, Zoom-Brush), **Backtest** (Ø-Forward-Returns nach COT-Extremen mit Basisrate + Klartext-Fazit), **Conditional-Outcome** (Konfluenz Flow × Zins-Drehung) und **Contract-Vergleich** (Perzentil-Linien). Contract-Auswahl via `ContractSelector`.
- **Mehrwert:** Institutionelle Positionierung („Smart Money") lesen und historisch backtesten — wohin ein Pair nach Extrempositionierungen typischerweise lief.
- **Status:** aktiv.

### Tab: COT Intelligence  `/cot/intelligence`
- **Funktion:** Client-Komponente `CotIntelligence` mit **4 internen Tabs**: `Signale`, `Ranking`, `Heatmap`, `Scanner`. Zeigt aufbereitete Currency-Signale (BULLISH/BEARISH/Score), Ranking und Heatmap der G8-Währungen. Detailseite je Währung unter `/cot/intelligence/[currency]` (`CotCurrencyDetail`: Verlauf, Pie, Perzentil-Index).
- **Mehrwert:** COT nicht pro Contract, sondern pro Währung aggregiert & bewertet — schnelleres Bias-Lesen als die Roh-COT-Seite.
- **Status:** aktiv.

### Tab: Makro & Zinsen  `/makro`
- **Funktion:** Server-Seite (FRED-Daten via `getFredSeries`/`getCategoryValue`, Stale-Flags). Panels: **Regionen-Vergleich** (2 Währungsräume: Zinsen, Inflation, Arbeitsmarkt, BIP, Leading Indicator, Handelsbilanz), **Zins- & Renditedifferenzen** (Leitzinsen + 10Y aller G8), **Markterwartungen Zinsentscheide** (2Y-Proxy + Meeting-Pricing), **Spread-Historie** (10Y-/Leitzins-Differenz je Pair), **Commodity-Korrelationen** (Rohstoff vs. Pair, rollierende 60T-Korrelation).
- **Mehrwert:** Fundamentaler Kern des Currency-Bias — Zinsdifferenzen als einer der stärksten FX-Treiber, plus Makro-Kontext je Region.
- **Status:** aktiv.

### Tab: Macro Terminal  `/makro/terminal`
- **Funktion:** Client-Komponente `MacroTerminal` mit **3 internen Tabs**: `Cards`, `Breakdown`, `CB`. Berechnet einen G10-Currency-Bias-Score (`macroScore`, Sub-Scores nach Kategorie) mit Regime-Styling und LONG/SHORT/NEUTRAL-Badges. Daten via `/api/makro/terminal`.
- **Mehrwert:** Verdichteter, quantifizierter Makro-Score je Währung (statt Rohdaten-Lesen) — schnelle G10-Rangfolge.
- **Status:** aktiv (Prompt/Design in `MACRO-TERMINAL-COT-INTELLIGENCE-PROMPT.md`).

### Tab: Retail Sentiment  `/sentiment`
- **Funktion:** Server-Seite (Supabase Sentiment-Latest). **Retail-Positionierung je Pair** (Konträr-Indikator, überfüllte Seite rot), **Konträr-Signale** (Pairs mit ≥ Schwellwert einseitiger Positionierung — Schwelle in Einstellungen), **Historischer Verlauf** (Retail Long-% vs. Preis, wächst täglich per Cron).
- **Mehrwert:** Kleinanleger-Positionierung (Myfxbook) konträr genutzt — überfüllte Seiten als Warnsignal.
- **Status:** aktiv, aber **Datenbasis jung** — Historie beginnt erst 2026-07-03 (laut STATUS.md), Backtest über 2 Jahre kann den Faktor noch nicht voll nutzen.

### Tab: Intermarket  `/intermarket`
- **Funktion:** Server-Seite (`loadIntermarketData`). **Korrelationsmatrix** (Pearson auf Tages-Log-Returns, Fenster 20/60/200), **Intermarket-Overlay** (zwei Instrumente, Dual-Achse/normalisiert, rollierende Korrelation), **DXY-Dashboard** (Dollar-Index aus offizieller Formel + FRED Broad Dollar), **USD-Paare (1M)**.
- **Mehrwert:** Reiner Kontext — Korrelationen & Dollar-Stärke einordnen, keine eigenen Richtungssignale (so auch im Leitfaden deklariert).
- **Status:** aktiv.

### Tab: Saisonalität  `/saisonalitaet`
- **Funktion:** Server-Seite (`getSeasonalityStats`). **Monats-Heatmap** (alle Instrumente × 12 Monate, Ø-Return %, aktueller Monat hervorgehoben, Klick öffnet Detail) + **Detail-Panel** je Instrument (Ø-Monatsreturn + Trefferquote = Anteil positiver Jahre).
- **Mehrwert:** Historische Monats-Tendenz je Pair als zusätzlicher Konfluenz-Faktor.
- **Status:** aktiv. (Hinweis: die tiefere, statistisch geprüfte Variante liegt unter *ML → Season 2.0*.)

### Tab: Kalender  `/kalender`
- **Funktion:** Server-Seite. **Zentralbank-Kalender** (anstehende Zinsentscheide + erwartete Änderung, gepflegt in Supabase `cb_meetings`) und **Wirtschaftskalender** (High-Impact-Events diese + nächste Woche, filterbar) via `EventList`.
- **Mehrwert:** Timing-Warnung — wann wichtige Termine anstehen, um Trades drumherum zu planen (kein Richtungsfaktor).
- **Status:** aktiv (setzt gepflegte Meeting-Daten / seed.sql voraus).

---

## Gruppe: Markt-Scanner  *(Admin-only — `requiresAdmin`)*

### Tab: Visuelles Radar  `/scanner/radar`
- **Funktion:** Client (`ScannerShell` mode=radar → `RadarView`). Pollt den Live-Screener des FastAPI-Backends (`fetchScreener`). Zeigt je Pair einen Marker auf einer Long↔Short-Bar nach Distanz zur GVA-Linie; HIT-Zustände pulsieren. Filterbar nach Währung. `DetailsModal` je Pair, `markPair`-Aktion.
- **Mehrwert:** Live-Überblick, welche der 28 Pairs kurz vor einem GVA-Linien-Hit stehen.
- **Status:** aktiv (Admin-only).

### Tab: Signale  `/scanner/signale`
- **Funktion:** Client `SignalsInbox`. Signal-Inbox mit Filtern (neu / journaled / dismissed / alle), Statuswechsel (`setSignalStatus`), Fundamentals-Notiz je Signal, Verknüpfung ins Journal.
- **Mehrwert:** Eingegangene GVA-Alerts abarbeiten und direkt ins Trade-Journal überführen.
- **Status:** aktiv (Admin-only).

### Tab: Heatmap 28  `/scanner/heatmap`
- **Funktion:** Client (`ScannerShell` mode=heatmap → `HeatmapView`). Alle 28 Pairs als farbige Kacheln (Long grün / Short rot / HIT hervorgehoben) nach Screener-Zustand.
- **Mehrwert:** Gesamtmarkt-Zustand aller Pairs auf einen Blick.
- **Status:** aktiv (Admin-only).

---

## Gruppe: Journal

### Tab: Dashboard  `/journal/dashboard`
- **Funktion:** Client `DashboardView`. Aggregiert Trades (`loadTrades`) + Konten (`loadAccountConfigs`); Statistiken (`calculateTradeStatistics`, Drawdown, Streaks), Equity-Chart, StatCards, Fortschrittsringe. Konto-Filter (Segmented).
- **Mehrwert:** Performance-Überblick des eigenen Tradings — Winrate, Drawdown, Serien.
- **Status:** aktiv.

### Tab: Trades  `/journal`
- **Funktion:** Client `JournalView` (419 Z.). Vollständige Trade-Verwaltung: Anlegen/Bearbeiten (`TradeFormModal`), Detailansicht (`TradeDetailModal`), Screenshots (`saveScreenshot`), Konten-Setup/-Verwaltung (`AccountModals`), Transaktionen, Filter, Setup-Definitionen.
- **Mehrwert:** Kern-Trade-Journal — jeder Trade dokumentiert mit Setup, Screenshot, Ergebnis.
- **Status:** aktiv.

### Tab: Equity  `/journal/equity`
- **Funktion:** Client `EquityView`. Equity-Kurve, R-Multiple-Chart, Winrate-Chart, Streak-Dots; Zeitfilter (all/Monat/Quartal/Jahr), Konto-Filter.
- **Mehrwert:** Kapitalentwicklung und R-Verteilung visuell auswerten.
- **Status:** aktiv.

### Tab: Outlook  `/journal/outlook`
- **Funktion:** Client `OutlookView` (+ `OutlookWizardModal`). Eigene Trading-Thesen erfassen/verwalten (`loadOutlooks`/`saveOutlook`, Status-Workflow `OUTLOOK_STATUS_CONFIG`). Prefill-Button aus Weekly-Outlook-Daten (`OutlookPrefillButton`).
- **Mehrwert:** Vorab-Thesen dokumentieren und später gegen das reale Ergebnis prüfen (Bindeglied Analyse → Trade).
- **Status:** aktiv.

### Tab: Trade-Kalender  `/journal/kalender`
- **Funktion:** Client `CalendarView` (265 Z.). Monats-/Jahresansicht der eigenen Trades, farbcodiert nach Ergebnis; Konto-Filter (alle/EK/funded), Wochentags-Raster.
- **Mehrwert:** Zeitliche Muster im eigenen Trading erkennen (welche Tage/Wochen laufen gut/schlecht).
- **Status:** aktiv.

### Tab: Strategien  `/journal/strategie`
- **Funktion:** Client `StrategyView` (503 Z.). Strategie-Builder: Regeln (Entry/Exit/Filter/Risk) je Strategie definieren, speichern (`loadStrategies`/`saveStrategy`), Pairs zuordnen.
- **Mehrwert:** Handelsstrategien formalisieren, damit sie backtestbar und konsistent umsetzbar sind.
- **Status:** aktiv.

### Tab: Backtest  `/journal/backtest`
- **Funktion:** Client `BacktestView` (+ `BacktestRoom`, `BacktestAnalysis`). Manuelles Backtesting-Lab: Sessions je Strategie/Pair, Trade-für-Trade-Erfassung (`BacktestRoom`, mit Screenshot-Downscale, Problem-Tagging, Notiz-Snippets), Auswertung (`BacktestAnalysis`: Equity-Area-Chart, Stats, Setup-Verteilung).
- **Mehrwert:** Strategien manuell historisch durchtesten, bevor echtes/Funded-Kapital riskiert wird (Kern der Trading-Roadmap).
- **Status:** aktiv.

---

## Gruppe: Machine Learning

### Tab: Training  `/ml/training`
- **Funktion:** Client `TrainingPanel` (377 Z.). Steuert das echte LightGBM-Modell im FastAPI-Backend (`NEXT_PUBLIC_GVA_API_URL`): Training starten (Poll-Loop), Live-Status, Walk-Forward-Report (Fold-Balken, OOS-AUC/Acc), Predictions für 28 Pairs (LONG/SHORT + Confidence), Feature-Importance.
- **Mehrwert:** Gelernte Richtungs-Prognosen 1–4W statt starrer Regel-Schwellen — der eigentliche ML-Endpunkt der Roadmap.
- **Status:** aktiv im Frontend; **erstes echtes Training auf Render noch offen** (laut STATUS.md — Modell muss einmal live trainiert werden).

### Tab: Labor  `/ml/labor`
- **Funktion:** Client `LaborExplorer` (819 Z.). Interaktiver Faktor-Explorer über die Faktor-Matrix (`/api/ml/matrix`, 1h-Cache), Aggregation komplett im Browser. Faktoren: Zins, COT-NC, COT-C, Saison, Yield + Forward-Returns 1–4W, zusätzlich rollierende z-Scores. Filter: Horizont, Zeitraum 2/4/8J, Faktor-Checkboxen, Min-n, Match-Modus (unanimous/majority), IS/OOS-Split, Gewichtung (equal/edge). **Interne Tabs:** Übersicht, Heatmap, Bestenliste, Pair. Signifikanz (95%) markiert.
- **Mehrwert:** Selbst herausfinden, welche Faktor-Kombination echte Edge hat (Erkenntnis lt. STATUS: Zins+Saison ~57,9 % @4W; Edge lebt v. a. im oberen Konfidenz-Quintil).
- **Status:** aktiv (v2 mit z-Scores + Walk-Forward, Commit 968a164).

### Tab: Replay  `/ml/replay`
- **Funktion:** Client `ReplayExplorer` (569 Z.). Historische GVA-Hits durchblättern, Fundamental-Snapshot der Hit-Woche prüfen, Trade manuell bewerten (genommen/Skip); Backend simuliert bei „genommen" das 1:3-Ergebnis gegen `price_daily`. Ehrliche Winrate nur über genommene Trades. Ruft FastAPI-Backend.
- **Mehrwert:** GVA-Muster mit Fundamental-Kontext manuell nachhandeln und eine realistische, verzerrungsarme Trefferquote aufbauen.
- **Status:** aktiv (Prompt in `BACKTEST-REPLAY-PROMPT.md`).

### Tab: Season 2.0  `/ml/season`
- **Funktion:** Client `SeasonExplorer` (501 Z.) + `SeasonVerdict` (334 Z.). Interaktiver Saison-Browser über die Season-Matrix (`/api/ml/season`): Sub-Patterns nach Monat, Woche-des-Monats, Quartalsende, Regime-konditioniert, Special. **SeasonVerdict** filtert automatisch auf statistisch signifikante UND in erster/zweiter Historien-Hälfte konsistente Muster (Out-of-Sample-Persistenz, Mehrfachtest-Korrektur).
- **Mehrwert:** Ehrliche Saisonalität — trennt echte, persistente Muster von Zufallstreffern (harter Filter gegen Overfitting).
- **Status:** aktiv.

### Tab: ML-Modell (Anleitung)  `/ml/modell`
- **Funktion:** Statische Erklär-Seite (192 Z.). Panels: „Was es ist", „Alt vs. neu" (Regeln vs. gelerntes Modell), „Was es kann", „Wie man es trainiert" (4 Schritte), „Wie es besser wird", „Ehrlich bleiben". Verlinkt auf `/ml/training`.
- **Mehrwert:** Bedienungs-/Konzept-Doku für das ML-Modul.
- **Status:** aktiv (reine Dokumentation, keine Live-Daten).

### Tab: Daten-Check  `/ml`
- **Funktion:** Server-Seite (`loadMlHealth`, `loadBacktest`). **Backtest-Bereitschaft** (Frische aller Quellen, Snapshot-Abdeckung, fehlende Wochen, Signal-Quote), **Backtest-Panel** (Weekly-Outlook-Signale × echte Kurse über ~8 Jahre, Trefferquote + Ø Rendite nach Horizont/Konfluenz/Währung/Pair), **Datenquellen**-Vollständigkeit, **Snapshot-Qualität** (`weekly_outlook_snapshots`).
- **Mehrwert:** Qualitäts-Cockpit — prüft, ob die Datenbasis für belastbares Backtesting/ML ausreicht.
- **Status:** aktiv; laut STATUS.md Rendering hinter Auth noch nicht visuell gesichtet, DB-Backfill füllt sich auf 416 Wochen (8 J.) per Cron.

---

## Gruppe: System

### Tab: Analyse-Leitfaden  `/leitfaden`
- **Funktion:** Statische Erklär-Seite (281 Z.). Erklärt pro Datenquelle (COT, Makro/Zinsen, Retail, Saisonalität, Intermarket, Kalender) die echten Code-Schwellenwerte + „So liest du das" / „So handelst du danach". Oben: welche Daten Signale erzeugen (Pair-Screener 5 Faktoren + Währungs-Bias 4) vs. reiner Kontext.
- **Mehrwert:** Nachschlagewerk, wie das Tool entscheidet — damit die Signale nachvollziehbar bleiben.
- **Status:** aktiv (statisch, Commit f2ee336).

### Tab: Einstellungen  `/einstellungen`
- **Funktion:** Client-Seite (165 Z.). Zeigt Konto (`/api/auth/me`, Admin-Flag), Daten-Jobs-Status + nächster Cron-Lauf (`/api/data/status`), app-weite Schwellwerte (u. a. Sentiment-Konträr-Schwelle, COT-Quelle).
- **Mehrwert:** Zentrale Konfiguration + Kontrolle, ob die Daten-Pipeline (Crons) frisch läuft.
- **Status:** aktiv (Abo-/Upgrade-Karte am 2026-07-11 entfernt).

---

## Nicht in der Navigation (System-/Auth-/Infrastruktur-Seiten)

### Seite: Root-Redirect  `/` (`app/(app)/page.tsx`)
- **Funktion:** Leitet auf `/dashboard` weiter (alte Links nicht brechen).
- **Status:** aktiv (nur Redirect).

### Seite: Login  `/login`
- **Funktion:** Login-Seite (Supabase Auth).
- **Mehrwert:** Zugang; eingeloggt = voller Zugriff (Scanner bleibt Admin-only).
- **Status:** aktiv; laut STATUS.md Login-Flow nach Marketing-Umbau nur per Redirect-Codes getestet, echtes Durchklicken noch offen.

### Seite: Journal-Einstellungen (Legacy)  `/journal/einstellungen`
- **Funktion:** Reiner Redirect → `/einstellungen` (Einstellungen sind jetzt app-weit).
- **Status:** veraltet/Legacy (nur Weiterleitung, kein Inhalt mehr).

### Auth-Routes  `/auth/callback`, `/auth/signout`
- **Funktion:** OAuth-Callback bzw. Logout-Handler (kein UI).
- **Status:** aktiv (Infrastruktur).

### API-Routen (`app/api/…`, kein UI)
- **Funktion:** `auth/me`, `data/status`, `data/series`, `data/correlations`, `data/cot` (+ `/backtest`, `/conditional`), `cot/intelligence`, `makro/terminal`, `ml/matrix`, `ml/season`, `prices/live`, `health`, `admin/backfill`, sowie Crons `cron/daily` (05:30 UTC Preise) und `cron/fundamentals` (06:00 UTC FRED/Kalender/Sentiment/COT/Outlook-Snapshot).
- **Mehrwert:** Datenversorgung des Frontends + geplante Aktualisierung.
- **Status:** aktiv (Backend-Endpunkte).

---

## Veraltet / ausgelagert

### `CurrencyBiasPanel`  (`components/dashboard/CurrencyBiasPanel.tsx`)
- **Funktion:** Früheres Dashboard-Panel für Währungs-Bias.
- **Status:** **verwaist** — laut STATUS.md seit 2026-07-11 nicht mehr im Dashboard (ersetzt durch `CurrencyCockpit`); Datei existiert noch, wird aktuell nirgends importiert.

### Ordner `marketing-verkauf-backup/` (gitignored, außerhalb der App)
- **Funktion:** Ehemalige Verkaufs-/Marketing-Seiten & -Routen: `LandingPage`, `/upgrade`, `/agb`, `/datenschutz`, `/impressum`, Stripe-Routen (`checkout`/`portal`/`webhook`), Scanner-Zugangscode (`scanner-unlock`/`-status`, `ScannerGate`), `OnboardingTour`, `feedback`-API, `plans.ts`.
- **Mehrwert (historisch):** Als das Tool noch Verkaufsprodukt war.
- **Status:** **veraltet/ausgelagert** — am 2026-07-11 bewusst aus der App entfernt (Projekt ist jetzt privates Trading-Tool). Nicht Teil der aktiven Software; nur als Backup aufbewahrt.

---

### Kurz-Legende Status
- **aktiv** — im Code vorhanden, in der Navigation verlinkt, funktional aufgebaut.
- **Legacy/Redirect** — existiert nur noch als Weiterleitung.
- **verwaist** — Datei existiert, wird aber nicht mehr eingebunden.
- **veraltet/ausgelagert** — bewusst aus der App entfernt, nur als Backup vorhanden.

> Offene Punkte laut `STATUS.md` (nicht Seiten-, sondern Reifegrad-Ebene): echtes ML-Training auf Render noch nicht gelaufen · `/ml`-Rendering hinter Auth noch nicht visuell gesichtet · Sentiment-Historie erst ab 2026-07-03 · Login-Flow nach Umbau nur via Redirect-Codes getestet · 416-Wochen-Backfill füllt sich per Cron.
