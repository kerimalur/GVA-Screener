# GVA-Screener — Projekt-Status & Resume-Notiz

> Notiz für Geräte-/Session-Wechsel. Der Chat-Verlauf ist NICHT im Repo —
> diese Datei ersetzt ihn als Kontext. Bei neuer Session: "lies STATUS.md".

Stand: 2026-07-17

## Backend: /health-Ping für UptimeRobot (2026-07-17)
Root "/" gab 404 → UptimeRobot meldete Render fälschlich down. Neu in
`Backend/main.py`: GET /health (+ Alias /doctor) → sofort 200 "ok",
ohne Cache/DB/Engine. /api/health bleibt der Detail-Status. ASGI-Smoke-
Test lokal: /health, /doctor, /api/health, /api/calendar alle 200.
Nach Push/Deploy: UptimeRobot auf /health zeigen.

## Real-Yield-Verlaufs-Ansicht + Verdikt (2026-07-17)
Erweiterung von /makro/real-yield, rein additiv (Q-Score unberührt):
- **RealYieldHistoryChart** (`components/makro/RealYieldHistoryChart.tsx`,
  Recharts ComposedChart): Real Yield je Monat als Balken (grün ≥ 0 / rot < 0),
  Leitzins + CPI YoY als Linien (weiß/warn), EINE Y-Achse (alles %/pp),
  Fenster-Pills 12M/18M/Max (Default 18M), 0-Referenzlinie.
- **Neues Panel «Verlauf je Währung»**: Währungs-Pills (dead → disabled,
  bewusst keine Anzeige mit totem CPI), Chart + Datenstand-Zeile (FreshBadge,
  Leitzins-/CPI-Monat, Quartals-Hinweis bei "old").
- **Paar-Ansicht ergänzt**: gleicher Chart auf der Differenz-Serie A−B
  (Balken = RY-Differenz, Linien = Zins-/CPI-Differenz) + Verdikt;
  bestehender Linien-Chart + Kennzahlen unverändert.
- **Verdikt** (`lib/calc/realYield.ts`: `realYieldVerdict`, `shortTrend`):
  Level (Band ±0.25 %) + Kurz-Trend 2M (Fallback 1M, Band ±0.1 pp,
  datums-basiert → quartals-tolerant), je −1/0/+1 → BULLISH / LEICHT BULLISH /
  NEUTRAL / LEICHT BEARISH / BEARISH. Badge + Klartext (Level, Trend,
  «dreht nach oben/unten»). Paar: BULLISH = spricht für Währung A.
  9 Kontrollwerte via tsx verifiziert, Build sauber.
- Visuell im Browser noch nicht gesichtet (Auth) — beim nächsten Login prüfen.

## Real-Yield-Valuation + BIS-Datenquelle (2026-07-16)
Neue Seite **/makro/real-yield** (Nav: Diagnose) — fundamentales Bias-Display,
fliesst NICHT in Q-Score/Baseline (rein additiv).
- **Befund Schritt 0 (CPI-Blocker):** FRED-CSV-Transport (fredgraph.csv) ist
  seit ~2026-07-03 tot — Timeouts auch lokal, 90/92 Serien heute is_stale,
  fred_series-Writes stoppten Anfang Juli. Zusätzlich sind die Nicht-US-CPI-
  Serien (OECD-Feed) dauerhaft eingestellt (JPY seit 2021!).
  calendar_events.actual ist KEIN Ersatz (nur kommende Events, actual leer).
- **Fix: BIS SDMX-API** (stats.bis.org, keyless, verifiziert): WS_LONG_CPI
  (CPI YoY, Serie 771) + WS_CBPOL (Leitzinsen) für alle 8 Währungen.
  `lib/sources/bis.ts` (Fetch+Parse, live getestet via scripts/bis-smoke.mts),
  `lib/jobs/updateBis.ts` (rollierendes 4J-Fenster, upsert fred_series unter
  BIS_CPI_YOY_*/BIS_CBPOL_*, Meta-Frische), im fundamentals-Cron als
  "cron:bis" eingehängt. Seed ab 2023-01 per SQL eingespielt (16 Serien,
  CPI-Stand: Mai 26 (USD/EUR/GBP/CHF/CAD), Apr 26 (JPY), Q1 26 (AUD/NZD)).
- **View:** Ranking stark→schwach (Leitzins, CPI YoY, Real Yield, Trend
  6M/12M, Frische-Badge: aktuell / älterer Stand / keine aktuellen Daten —
  bei "dead" wird bewusst NICHT gerechnet). Paar-Ansicht: 2 Währungen wählbar,
  RY-Differenz + 6M-Trend + Carry (Zinsdifferenz) + Risk-Regime-Badge
  (bestehender riskGauge; VIX-Datum wird angezeigt, da FRED-VIX aktuell nur
  bis 01.07.). Kennzeichnung "Bias/Kontext, realized CPI läuft nach".
  `lib/calc/realYield.ts` (deterministisch, Kontrollwerte verifiziert).
- **OFFEN:** FRED-Transport generell (10Y-Renditen, VIX etc. altern weiter) —
  Fix wäre offizielle FRED-API mit FRED_API_KEY (kostenlos registrieren,
  Vercel-Env) + Umbau lib/sources/fred.ts. Separates Thema, nicht Teil
  dieser Aufgabe.

## Engine-Log: Nacht-Historie + Erklärung + Zeitfilter (2026-07-16)
Problem: `loadEngineLog` lud Rohzeilen aus `ml_experiments` (limit 5000) —
PostgREST cappt bei 1000/Request, eine Nacht hat ~1200 Experimente → es war
faktisch nur die letzte Nacht sichtbar, Zeitraum-Pills wirkten tot.
- **DB** (Migration `ml_engine_nights`, angewandt): Tabelle `ml_engine_nights`
  (PK night, done/failed, best_hall, best_config jsonb, runtime_min) +
  View `ml_engine_nights_live` (security_invoker, aggregiert ml_experiments
  pro UTC-Nacht inkl. pending). 4 bestehende Nächte (13.–16.07.) backfilled.
- **Backend**: `run_experiments.py` → `_write_night_summary()` am Lauf-Ende:
  upsert NUR der eigenen Nacht (idempotent, alte Nächte unberührt); Fehler
  dort bricht den Lauf nicht ab (View deckt notfalls ab).
- **Frontend** `lib/ml/engineLog.ts`: liest View (live) + Tabelle (Archiv,
  überlebt späteres Aufräumen von ml_experiments) + failed-Details separat.
  Neue Spalte «Bestes Modell» (algo · Horizont · Features).
- **UI**: Explainer «Was bedeutet bester Holdout-Score?» (einfaches Deutsch,
  OOS-Testfenster, 0.500 = Münzwurf, Konsistenz zählt). TimeSeriesChart zeigt
  jetzt «X von Y Punkten» neben den Zeitraum-Pills + Hinweis bei leerem
  Zeitraum; Engine-Log-Chart default «Max». Hinweis: mit erst 4 Nächten sehen
  1M–Max noch identisch aus — ab >1 Monat Historie filtern sie sichtbar.

## Disziplin-System im Journal (2026-07-16)
Spec: `docs/superpowers/specs/2026-07-15-disziplin-system-design.md`
- **DB:** `trades` + 4 Nullable-Spalten (Migration `trades_discipline_columns`
  angewandt): aplus_criteria/aplus_verdict/adherence_answers/adherence_score.
  Alte Trades = NULL → zählen nicht in die A+-Auswertung.
- **A+-Checkliste** (`lib/journal/discipline.ts` + TradeFormModal): Pflicht bei
  neuen Trades (jedes Kriterium Ja/Nein), Verdikt-Banner live (A+ nur wenn ALLE
  ja; Nicht-A+ trotzdem loggbar). Kriterien editierbar (Settings,
  user_preferences.aplus_criteria), Seeds: GVA-Hit, BOS, Session, Q5/Q1.
- **Adherence:** Nach Save eines neuen Trades öffnet JournalView das
  AdherenceModal („Plan befolgt?", Fragen editierbar) → Score % auf den Trade.
  Überspringen erlaubt.
- **ExpectancyCard** (Journal, Journal-Dashboard, Equity): Monats-Expectancy
  aus WR×RR×Risiko%×Trades/Mt; Live-Winrate ab 20 Trades, sonst Fallback
  („manuell" gekennzeichnet). Parameter in Settings. Kontrollwerte verifiziert
  (1 %/RR4/4: WR25→+1 %, WR50→+6 %).
- **Payoff-Panel** (Journal-Dashboard): A+ vs. Nicht-A+ — n, Winrate,
  Ø-Adherence (nur Trades mit Verdikt).
- Rein additiv, Balance-/Statistik-Logik unverändert. Build sauber.

## Performance-Paket + Track-Zeiträume + Q-Score an GVA-Linien (2026-07-15)
Spec: `docs/superpowers/specs/2026-07-15-performance-fundamental-track-qscore-design.md`
- **Keep-Alive:** `.github/workflows/keepalive.yml` pingt alle 10 min
  `/api/health` → Render (Free) schläft nicht mehr ein. Zusätzlich Panel-Warmup
  als Startup-Thread in `Backend/main.py` (baut das 25J-Panel beim Boot vor).
- **Backend-Cache:** `fundamental_track` Ergebnis-TTL-Cache 1 h pro
  (pair, weeks, from, to). Endpoint nimmt neu `from`/`to` (ISO) ODER
  `weeks` (Limit 4…520 = 10 J).
- **Frontend flüssig:** `loadRankingData` in `unstable_cache` (5 min, geteilt
  von /ml/ranking + Dashboard-WeekPlan). Neuer `Prefetcher` im (app)-Layout:
  weckt Render sofort nach Login + wärmt `/api/cot/intelligence`, `/api/ml/season`
  und EURUSD-Track, prefetcht Analyse-Routen (1× pro Session). Stale-first-Hook
  `lib/hooks/useCachedFetch.ts` (localStorage, quota-sicher) in COT Intelligence
  + Fundamental-Track — letzter Stand erscheint sofort, Refresh im Hintergrund.
  Season-Matrix bleibt ohne localStorage (zu gross), profitiert vom Warmup.
- **Fundamental-Track Zeiträume:** UI-Presets 52 W / 2 J / 5 J / 10 J + eigener
  Von–Bis-Zeitraum; funktioniert für alle 28 Pairs (Selector gab es schon,
  Pair-Wechsel ist jetzt gecacht statt Timeout).
- **Q-Score an GVA-Linien (Dashboard):** `lib/ml/pairBias.ts` (strikte
  Q5/Q1-Regel, identisch Backend `_pair_bias`). NearGva-Boxen zeigen Badge:
  ✓ grün „CHF Q1" wenn Ranking die Linien-Richtung bestätigt, ✗ „gegen Ranking"
  bei Widerspruch, Q2–Q4 → kein Badge. Quintile kommen via WeekPlan (gecacht).
- **OFFEN (manuell):** Workflow „Render Keep-Alive" erscheint nach Push;
  einmal manuell dispatchen zum Test. GH-Cron kann sich um Minuten verzögern —
  Login-Warmup fängt das ab.

## Replay — Fundamentale Konfluenz + Kalibrierung (2026-07-14)
Der GVA-Replay ist nicht mehr rein technisch — er trägt jetzt die fundamentale
Lage pro Hit und ist gegen TradingView kalibrierbar.

- **Fundamentale Konfluenz (as-of, HIT-Datum):** `/replay/hits` hängt je Hit den
  Bias an (`fundamentals.ranking_snapshot` → Baseline Zins+Saison + Quintil beider
  Pair-Währungen, Datum = HIT-Tag, nicht Linien-Bildung). Replay-Hits nutzen die
  **weite** Bias-Regel `_pair_bias_wide` (Q2/Q4 zählen als Richtung, nur Q3 neutral,
  relativer Quintil-Vergleich) — Währungs-Ranking + Fundamental-Track bleiben strikt
  (Q5/Q1). `/replay/evaluate`
  speichert `ranking_bias` + `ranking_detail` (jsonb, bestehende Spalten in
  backtest_replay). `/replay/stats` → `by_ranking` (Rückenwind/Gegenwind/Neutral,
  reine Zählung — Winrate-Split kommt zurück, sobald GVA-Ergebnisse wieder erfasst
  werden). Frontend-Raum: Badge ↑Rückenwind/↓Gegenwind + Inline „EUR Q5 / USD Q1".
- **Session-Wahl mit/ohne Fundamentals:** Wizard-Checkbox; `replay_sessions.
  with_fundamentals` (Migration). Aus = `with_bias=0` (kein Panel-Lookup, schneller).
- **GVA-Toleranz kalibrierbar:** `collect_hits`/`reconstruct_hits`/`find_hit` +
  `collect_lines`/`reconstruct_lines` nehmen `size_factor`/`tol_pct` (Default =
  Scanner-Konstanten). Kalibrier-Panel auf der Replay-Landing: EURUSD letzte 12
  Monate, zeigt **gebildete Linien** (`/replay/lines`, nicht nur gehittete) in
  Raum-Darstellung (Raster+Karte), tol/size verstellen + neu laden. Button „Für
  neue Sessions übernehmen" → globaler Default (localStorage). Jede Session friert
  ihre Toleranz ein (`replay_sessions.tol_pct/size_factor`, Migration).
- **Perf:** `data_pipeline.fetch_daily_oanda` hat 5-min In-Prozess-TTL-Cache pro
  (instrument, count) — Replay fragt dasselbe Pair mehrfach ab. Skip→rot,
  Speichern→Auto-Weiter im Raum.
- **Neue Seite `/ml/fundamental-track`** (Nav: Analyse): pro Pair die letzten 52
  Wochen-Q-Scores beider Währungen (Baseline, as-of) + ob der Markt danach 1W/4W
  in Bias-Richtung lief. Trefferquote 1W/4W (neutrale Wochen zählen nicht) +
  Timeline. Backend: `fundamentals.fundamental_track` + `/replay/fundamental-track`.
  Reine Inspektion der Score-Kalibrierung — NICHT der ML-Backtest (den macht die Engine).
- **Migrationen** (Supabase `bpggwelpuvbkeudrqoiv`, angewandt): replay_sessions_gva_tuning
  (tol_pct/size_factor), replay_sessions_with_fundamentals. Lokal in
  `Backend/replay/migrations_sessions.sql` dokumentiert.
- **OFFEN:** entfernte Win/Loss/RR-Simulation zurück → dann wird aus by_ranking ein
  echter Winrate-Split (Rückenwind vs. Gegenwind = die messbare Edge).

## Ausrichtung (WICHTIG, seit 2026-07-11)
**Privates Trading-Tool. Kein Verkaufsprodukt mehr.** Fokus: Funktion, Effizienz,
Mehrwert für Kerims eigenes Trading — Endziel ML-/Backtesting über die Weekly Outlooks.
Alles Marketing/Verkauf (Landing, Stripe, Upgrade, Onboarding-Tour, AGB/Impressum,
Scanner-Zugangscode, Feedback-API) liegt in `marketing-verkauf-backup/` (gitignored,
README mit Original-Pfaden drin). Eingeloggt = voller Zugriff; Scanner bleibt Admin-only.

Masterplan der laufenden Umbauten: `docs/refactor-prompt.md`.

## ML-Engine — Experiment-Maschine + Währungs-Ranking (2026-07-13)
Spec: `docs/superpowers/specs/2026-07-13-ml-engine-design.md`,
Plan: `docs/superpowers/plans/2026-07-13-ml-engine.md`
- **Backend/macro_features/panel.py**: vektorisiertes Wochen-Panel 25J × 8 Währungen
  (11'320 Zeilen, 36 Spalten, ~1 s Aufbau), as-of-sauber — Leak-Tests beweisen
  Gleichheit mit dem Punkt-Build an 3 Stichtagen. Korb-Targets 1/2/4W (demeaned).
- **Backend/ml_engine/**: nächtliche Random-Search (GitHub Actions 02:00 UTC,
  50 min Budget) mit Purged-Walk-Forward (5 Folds à 52W, Embargo=Horizont).
  Holdout = letzte 104 Wochen, NUR promote.py fasst es an (jeder Zugriff in
  ml_holdout_access protokolliert). Baseline #0 = Zins+Saison-Composite (beste
  Labor-Kombi) — jedes ML muss sie schlagen. Synthetik-Tests: geplantete Edge
  wird gefunden (AUC>0.62), Rauschen bleibt bei 0.5.
- **Wochen-Job** (Sa 08:00 UTC): Champion+Baseline → ml_weekly_rankings
  (insert-only, PK week_start+ccy+model), Paper-Track-Reifung automatisch.
  Promotion manuell: `python -m ml_engine.promote --list|--evaluate ID|--promote ID`.
- **Supabase**: ml_experiments, ml_champion, ml_weekly_rankings, ml_holdout_access
  (Migration `ml_engine_tables` angewandt, RLS an ohne Policies).
- **Frontend**: /ml/labor → Redirect auf /ml/ranking (neue Seite: Ranking-Tabelle
  mit Q5-Badge, Paper-Track Champion vs. Baseline, Engine-Status inkl.
  Holdout-Zähler). LaborExplorer/factorMatrix/api/ml/matrix entfernt —
  Labor-Erkenntnisse leben als Baseline-Gewichte weiter.
- **Tests**: 24 pytest grün (`Backend/tests/`), Build sauber.
- **OFFEN (manuell durch Kerim)**:
  1. GitHub-Repo-Secrets setzen: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
     (GitHub → Settings → Secrets and variables → Actions; gh CLI ist lokal
     nicht installiert).
  2. Danach einmal "ML Nightly Search" + "ML Weekly Ranking" manuell dispatchen
     (Actions-Tab) → ml_experiments füllt sich, /ml/ranking zeigt erste Woche.
  3. Nach ~4 Wochen Paper-Track: ersten Promotion-Kandidaten prüfen
     (`--list`, dann bewusst `--evaluate`; Holdout-Zähler bleibt sonst 0).

## Architektur
- **Backend (Render):** `Backend/`, FastAPI → https://gva-screener.onrender.com
  GVA-Kerzenmuster-Scanner für 28 FX-Pairs, Live-Preis-HIT-Check, Telegram-Alerts.
  (Details/Sticky-HIT-Logik: siehe Git-History dieser Datei, unverändert seit Juni.)
- **Frontend (Vercel):** `frontend-next/` (Next.js 16), Projekt `gva-screener`,
  https://gva-screener.vercel.app — Analyse-Suite + Journal + Markt-Scanner-UI.
- **Supabase** (Projekt `bpggwelpuvbkeudrqoiv`): Marktdaten + Journal + Snapshots.
  Alle Daten-Tabellen: RLS an, KEINE Policies → nur Service-Role-Key (liegt nur in
  Vercel-Env, nicht lokal!). Lokal fehlt `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
  → Daten-Seiten laufen lokal nur eingeschränkt; URL + Anon-Key sind eingetragen.
- **Crons (Vercel):** `/api/cron/daily` 05:30 UTC (Preise), `/api/cron/fundamentals`
  06:00 UTC (FRED, Kalender, Sentiment, COT-wenn-fällig, Outlook-Backfill+Snapshot).
  Manuelle Ausführung: Vercel Dashboard → Settings → Cron Jobs → Run.
  Backfill einzeln: `/api/admin/backfill?task=outlooks` (Bearer CRON_SECRET).

## Was am 2026-07-11 geändert wurde
1. **Marketing raus** (Commit `446899b`): Dateien in Backup-Ordner verschoben,
   proxy.ts ohne Abo-/Tier-Checks, `/` redirectet direkt Dashboard/Login,
   Einstellungen ohne Abo-Karte, `stripe`-Dependency entfernt.
2. **Nav aufgeräumt** (`141dd5c`): Analyse zeigt nur Dashboard, Weekly Outlook,
   Vergleich. Rest (COT, Makro, Sentiment, Intermarket, Saisonalität, Kalender)
   in einklappbarer "Details"-Gruppe (localStorage, Auto-Open bei aktiver Route).
3. **ML-Fundament** (`680204d`, `86e3b6d`):
   - Tabelle `weekly_outlook_snapshots` (PK week_start+instrument): eingefrorene
     Wochen-Verdicts des 5-Faktoren-Screeners als Backtest-Datenbasis.
   - `lib/ml/outlookSnapshots.ts`: as-of-Rekonstruktion (Rolling-Perzentile/Flows
     enden am Stichtag, kein Lookahead), `ensureOutlookBackfill` (selbstheilend im
     Cron), `snapshotCurrentWeek` (Insert-only, erster Lauf der Woche gewinnt).
   - Seite **/ml "Machine Learning → Daten-Check"**: Frische aller Quellen,
     Snapshot-Abdeckung, fehlende/unvollständige Wochen, Signal-Quote.

## Was FUNKTIONIERT (verifiziert 2026-07-11)
- Deployment READY, `/` → Login, `/upgrade` & Co. weg, Build fehlerfrei.
- Backfill gelaufen: **2912 Backfill-Zeilen** (104 Wochen × 28 Pairs,
  2024-07-08 … 2026-06-29, Ø 4.0 Faktoren — ohne Sentiment, korrekt) +
  **28 Live-Zeilen** (Woche 2026-07-06, Ø 5.0 Faktoren). Signal-Quote 66 %.
- Wöchentlicher Live-Snapshot läuft ab jetzt automatisch im 06:00-Cron.

## Was NOCH NICHT geht / offen
- **Login-Flow nach Marketing-Umbau nur per Redirect-Codes getestet**, nicht mit
  echtem Login durchgeklickt (kein Credential lokal). Kurz manuell prüfen.
- **/ml-Seite noch nicht im Browser gesichtet** (liegt hinter Auth) — Daten dahinter
  stimmen (SQL-geprüft), Rendering einmal anschauen.
- **Sentiment-Historie beginnt erst 2026-07-03** → Backtest über 2 Jahre kann den
  Retail-Faktor nicht nutzen; per `source`/`factor_count` unterscheidbar.
- Signal-Quote 66 % ist hoch (≥2 gleichgerichtete von 4 Faktoren ist leicht erfüllt)
  → Backtest sollte nach `aligned_count` (2 vs. 3 vs. 4) getrennt auswerten.
- Saisonalität im Backfill nutzt die heutige `seasonality_stats`-View
  (minimales Lookahead, bewusst akzeptiert — Kommentar in outlookSnapshots.ts).

## Aufgabe 3 — ERLEDIGT (2026-07-11, Commit 64d59aa)
- **Dashboard = Währungs-Cockpit:** 8 Währungen untereinander (Commit oben).
  `lib/calc/currencyCockpit.ts` reichert currencyBias an (nicht neu gebaut) um
  Retail-Aggregat (Ø über die 7 Pairs je Währung, konträr), Saisonalität (pro/contra
  Pairs des Monats) und High-Impact-News-Flag (7 Tage). Retail/Saison/News sind reine
  Anzeige, ändern die Bias-Richtung NICHT. Zeile aufklappbar → Faktor-Details.
  `components/dashboard/CurrencyCockpit.tsx`; loadDashboardData lädt zusätzlich
  High-Impact-Events + Sentiment-Latest (limit 120). Alter `CurrencyBiasPanel`
  nicht mehr im Dashboard (Datei bleibt, evtl. woanders genutzt).
- **Weekly Outlook:** "seit N Wochen · KWxx" je Signal aus weekly_outlook_snapshots
  (Streak = gleiche Richtung rückwärts). News waren schon auf den Karten.
- Verifiziert: Build sauber, Deploy READY, Routen 307→Login. Rendering hinter Auth
  noch nicht visuell gesichtet (kein Login lokal) — bei nächstem Login prüfen.

## Aufgabe 2 — ERLEDIGT (2026-07-11, Commit f2ee336)
- **/leitfaden** (Nav: System) — statische Erklär-Seite. Pro Datenquelle (COT,
  Makro/Zinsen, Retail, Saisonalität, Intermarket, Kalender) konkrete Lese-Regeln
  mit den echten Code-Schwellenwerten + "So liest du das" / "So handelst du danach".
  Oben Übersicht: Signale = Pair-Screener (5 Faktoren) + Währungs-Bias (4);
  nur Anzeige = Intermarket, Kalender, Makro-Detail, Cockpit-Zusätze.

## Backtest-Modul + 8 Jahre — ERLEDIGT (2026-07-11, Commit 514f1b3)
- `lib/ml/backtest.ts`: Weekly-Outlook-Signale × `price_daily` über 1–4 Wochen.
  Trefferquote (Close in Signalrichtung) + Ø gerichtete Rendite, aufgeschlüsselt
  nach Horizont, Faktor-Konfluenz (`aligned_count`), Basiswährung, Pair. Ohne Kosten.
- `BacktestPanel` auf /ml (unstable_cache 30 min, key `ml-backtest-v1`).
- **BACKTEST_WEEKS = 416 (8 J.)** zentral in outlookSnapshots.ts — Backfill,
  Cron-Selbstheilung (ensureOutlookBackfill), Health-Coverage, Script, Admin-Route.

### OFFEN / zu prüfen
- **DB hat noch 104 Wochen** — der 416-Backfill füllt sich beim nächsten
  `fundamentals`-Cron (06:00 UTC) ODER manuell: Vercel → Cron Jobs → „fundamentals“
  → Run. Danach zeigt /ml 416/416; Backtest-Tabelle refresht in ≤ 30 min (Cache).
- Backtest-Seite lädt beim ersten (uncached) Aufruf ~8 J. FX-Kurse (≈ 56k Zeilen,
  paginiert) → kann 15–30 s dauern; danach gecacht.
- MCP-Supabase-Server war zeitweise disconnected (nur Info; kein Code-Problem).
- Signal-Quote historisch hoch → Backtest nach aligned_count getrennt auswerten
  (Panel „Nach Faktor-Konfluenz“ zeigt genau das).

## ML-Labor — ERLEDIGT (2026-07-11, Commit 10290fa)
- **/ml/labor** (Nav: Machine Learning → Labor): interaktiver Faktor-Explorer.
  `lib/ml/factorMatrix.ts` rechnet pro Woche × Pair alle Faktor-Varianten direkt
  aus Rohdaten (as-of): Zins, COT-NC (Non-Comm), **COT-C (Commercials)**, Saison,
  Yield + Forward-Returns 1–4W. `/api/ml/matrix` (1h-Cache) → Client aggregiert
  alles im Browser (Filter ohne Roundtrip).
- Filter: Horizont 1–4W (Default 2), Zeitraum 2/4/8J, Faktor-Checkboxen
  (einstimmige Kombination), Min-n 10/30/100. Ansichten: Kennzahlen der Auswahl,
  Währung×Faktor-Heatmap, Kombi-Bestenliste (alle 31 Teilmengen), Pair-Tabelle.
  Signifikanz (95%-Konfidenz) markiert, kleine n ausgegraut.
- **Backtest-Erkenntnisse (8J, SQL-verifiziert):** Outlook-Verdict gesamt ~50 %
  (keine Edge). Einzeln: Saison 53,5→55,7 % (1→4W, bester Faktor), Zins ~51,5 %,
  Yield ~49 %, COT-NC 48,9→46,7 % (schädlich). Beste Kombi: **Zins+Saison 57,9 %**
  (4W, n=1499). Alle-4-Kombi 47,4 % → mehr Konfluenz ≠ besser. COT je Währung:
  NZD/CAD → Commercials besser (53,5/52,8 %), CHF → Non-Comm (51,6 %) — Tendenz,
  einzeln knapp unter 95%-Signifikanz.
- Nächster logischer Schritt: Weekly-Outlook-Verdict-Logik auf die Labor-
  Erkenntnisse umbauen (Kern Zins+Saison, COT-Variante je Währung) — erst nach
  Kerims Review der Labor-Zahlen.

## ML-Labor v2 — z-Scores + Walk-Forward (2026-07-11, Commit 968a164)
Adressiert die bewiesenen Kernprobleme der Faktor-Logik:
- **#1 starre Schwellen** → jeder Faktor zusätzlich als rollierender z-Score
  (156W, as-of, per Pair) in factorMatrix.ts. Row v3: [wi,pi, d0-4, z0-4, r0-3].
- **#2 Gleichgewichtung** → Edge-Gewichte 2·(WR−0.5) aus In-Sample; konträre
  Faktoren → negatives Gewicht (Auto-Invert). COT-NC bekam −0.05, COT-C +0.04.
- **#5 kein OOS** → Walk-Forward-Split (50/60/70) im Labor, IS vs OOS getrennt.
- **#6 binär** → kontinuierlicher Composite Σ(w·z) + Konfidenz-Quintile (OOS).

### Validiertes Ergebnis (live-Daten, out-of-sample)
- Zins+Saison edge: IS 51.9 / OOS 51.8 % (2W), IS 52.7 / OOS 52.0 % (4W) →
  **kein Overfit** (IS≈OOS), aber breit angewandt nur schwache Edge.
- **Konfidenz-Quintile OOS (alle 5, 4W): Q1 49.5 → Q5 57.6 %** → Edge lebt NUR
  im oberen Konfidenz-Fünftel. Design-Regel für Weekly-Outlook-Umbau: nur die
  Top-~20%-Konfidenz-Signale flaggen, nicht jedes Pair.

### Noch offen (nicht bewiesen / größer)
- **#3 Regime-Filter**: Risk-Gauge existiert (riskGauge.ts, nur für BTC genutzt).
  Erst im Labor testen ob Zins in Risk-On besser läuft, DANN bauen.
- **#4 COT-pro-Währung** feiner: aktuell global via Edge-Gewicht; per-Währungs-
  Auswahl (NZD/CAD→Commercials, CHF→NonComm) braucht currency-level Umbau.
- **Produktiv-Umbau Weekly Outlook** auf Composite+Konfidenz — erst nach Kerims
  Review, wenn Filter-Regel steht.

## ML-Modul (LightGBM) — Backend/ml/ (2026-07-11, Commit 94f30d1)
Echtes ML statt Regel-Schwellen: lernt Direction 1–4W aus COT-Rohdaten + Saison.
- **Backend/ml/**: db.py (Supabase REST wie supabase_signals.py), features.py
  (~40 Features je Woche×Pair, strikt as-of: COT Legacy+TFF Perzentile/Flows/
  Divergenz/OI, Saison rolling nur Jahre < aktuellem Jahr), train.py (LightGBM,
  Walk-Forward 156/52/26, Grid auf Ø OOS-AUC, Modelle als BYTEA in ml_models),
  predict.py (Cache, Confidence ≥0.58 high / ≥0.54 medium), routes.py.
- **Endpoints** (Render): POST /ml/train (Background; optional Env ML_TRAIN_KEY
  → Header X-ML-KEY), GET /ml/status|/ml/predict?pair=&horizon=|/ml/predict-all|
  /ml/report|/ml/feature-importance.
- **Supabase**: ml_models + ml_predictions NEU (Migration angewandt; Legacy
  ml_predictions aus FX-Terminal ersetzt — war 0 Zeilen). migrations.sql im Repo.
- **Frontend /ml**: Panel "ML-Modell" — Predictions 28 Pairs, OOS-Kacheln,
  Fold-Balken, Feature-Importance. Nutzt NEXT_PUBLIC_GVA_API_URL (Fallback Render).
- **Getestet lokal**: as-of-Sicherheit, Fold-Temporalität, Pipeline lernt
  synthetisches Signal (AUC 0.74) und lässt Rauschen bei 0.5, Blob-Roundtrip.
- **OFFEN**: erstes echtes Training auf Render ausführen (POST /ml/train,
  ~5–15 min) → /ml/report zeigt ob echte OOS-Edge da ist. Free-Tier-Hinweis:
  Render schläft nach Inaktivität; Training nur bei wachem Service starten.

## Arbeitsweise
- Lokal arbeiten, Commits je Aufgabe, Push = Deploy auf Vercel (main → Production).
- Nach jeder Aufgabe `npm run build` + Smoke-Test.
- Trading-Roadmap-Kontext: Backtest GVA/BOS (manuell) läuft parallel; FTMO erst
  wenn Backtest positiv; ML erst mit genug Daten.
