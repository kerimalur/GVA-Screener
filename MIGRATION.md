# MIGRATION.md — Trading Journal → GVA-Screener Kombi-App

Stand: 2026-07-03. Quelle: `c:\Projekte\Claude Cowork\TRADING-JOURNAL\desktop-app` (eingefroren nach Abschluss).
Ziel: `frontend-next/` (Next.js 16 App Router, Vercel) + `Backend/` (FastAPI, Render).

## Abweichung vom ursprünglichen Auftrag (mit User abgestimmt, 2026-07-03)

Der Auftrag ging vom alten Vite-Frontend (`Frontend/`) aus. Das wurde im Terminal-Rebuild
(Commit `c1be8e9`, P10) gelöscht und durch `frontend-next` (Next.js 16) ersetzt. Entscheidung:

- **Ziel-App ist `frontend-next`** — Terminal-Seiten (COT, Makro, Sentiment, Intermarket,
  Saisonalität, Econ-Kalender, Vergleich) bleiben vollständig erhalten, Journal-Features kommen additiv dazu.
- React-Router entfällt → **Next.js App Router** übernimmt das Routing.
- „Tech-Stack bleibt Vite" → sinngemäß: bleibt **Web/React/Tailwind auf Vercel, kein Electron**.
- Supabase: **bestehendes Journal-Projekt wird wiederverwendet** (Bestandsdaten bleiben).
  Das Terminal-Schema (`frontend-next/supabase/schema.sql`, bisher für eigenes Projekt gedacht)
  wird in dasselbe Projekt eingespielt.

## Architektur-Grundsatz Supabase (zwei Datenwelten, ein Projekt)

| | Terminal-Tabellen (instruments, price_daily, cot_reports, fred_series, …) | Journal-Tabellen (trades, accounts, …) + `signals` |
|---|---|---|
| Zugriff | nur server-seitig (Service-Role-Key, `lib/supabase/server.ts`) | Browser-Client (Anon-Key) + Google-Session |
| RLS | aktiv, **keine** Policies (anon sieht nichts) | aktiv, Policy `auth.uid() = user_id` |

## Feature-Inventar (Quelle: Journal `src/`)

Status-Legende: ⬜ offen · 🟨 in Arbeit · ✅ migriert · ⛔ bewusst nicht migriert

### a) journal
| | |
|---|---|
| Dateien | `features/journal/JournalPage.tsx` (945), `EKJournal.tsx`, `FundedJournal.tsx`, `TradeForm.tsx` (657), `TradeCard.tsx`, `TradeDetailModal.tsx`, `AccountSettings.tsx` |
| Services/Stores | `tradeService` (Supabase-CRUD + Feld-Mapping symbol/side↔pair/direction), `accountConfigService` (accounts + transactions), `tradeStore`, `accountStore` |
| UI | Modal, Button, Card, TradeRow, Toaster, Pagination |
| Supabase | `trades`, `accounts`, `transactions`, `trade_screenshots` (siehe Hinweis Screenshots) |
| Status | ✅ — Route `/journal` (EK/Funded per Umschalter statt zwei Routen), Trade-CRUD + Screenshots (jetzt in `trade_screenshots` statt localStorage) + Balance-Neuberechnung (#11) + Konto-Setup/-Verwaltung/-Wechsler + Filter + Karten-/Tabellenansicht. Ziel: `lib/journal/*` + `components/journal/*`. Bewusst weggelassen: separates EK-„Kapitalziel" aus localStorage (redundant zum Konto-Ziel `profitTarget` — eine Quelle statt zwei). |

### b) dashboard + equity
| | |
|---|---|
| Dateien | `features/dashboard/Dashboard.tsx` (758), `features/equity/EquityCurve.tsx` |
| Services/Stores | `tradeStore` (Metrics via `utils/calculations.ts`, 447 Z.), `accountStore`, `analyticsStore`, `widgetSettingsStore` |
| UI | BentoGrid, StatCard, MetricDisplay, SparklineChart, AnimatedNumber, ProgressRing, TradeStreak, charts/EquityChart+WinRateChart+RMultipleChart |
| Supabase | `trades`, `accounts`, `user_widget_settings` |
| Status | ✅ — Routen `/journal/dashboard` + `/journal/equity`. KPI-StatCards (Balance, P&L, Total R, Win Rate, PF+Expectancy, Max DD), Equity-Chart (Währung, DD-Fläche, Recharts), R-Histogramm, Win/Loss-Donut, Streak-Dots, Zeitraum-/Kontofilter, Kontoziel-Ring, Letzte Trades. Bewusst weggelassen: Widget-Customizer (`user_widget_settings`) und PDF-/HTML-Export — Single-User-Nutzen gering vs. Komplexität; Layout ist kuratiert statt konfigurierbar. Bei Bedarf nachrüstbar. |

### c) outlook
| | |
|---|---|
| Dateien | `features/outlook/Outlook.tsx` (1773), `OutlookWizard.tsx` (463) |
| Services/Stores | `outlookService` (Tabelle `outlooks`), `outlookStore` (764 Z.), `currencyStrength.ts` (1463 Z.: COT via CFTC-API, Preise via frankfurter.dev, Zinsen hartkodiert) |
| UI | Gauge, Heatmap, Card, Modal |
| Supabase | `outlooks`, `cot_snapshots`, `cot_pair_signals`, `cot_currency_analysis`, `pair_notes`, `fundamentals_notes`, `user_watchlists` |
| Status | ✅ — Route `/journal/outlook`. Thesen-Karten mit Status-Workflow (Beobachtung→Wartend→Aktiv→Ausgeführt/Abgebrochen), Stars, Confidence, Level (Zone/Entry/SL/TP), Confluences, Strategie-Checkliste (aus StrategyBuilder-Regeln), 5-Schritt-Wizard, „Journalieren" → TradeForm-Prefill + Outlook→executed-Rückverknüpfung. **Fundamentals ausschließlich via GVA `/api/fundamentals`** (`lib/journal/fundamentals.ts`, graceful bis Endpoint in Block 5 live ist). Bewusst nicht portiert: `currencyStrength.ts` (1463 Z. Doppel-Fetcher: CFTC direkt, frankfurter.dev, Zinsen hartkodiert Stand Mai 2026 — ersetzt durch Terminal-COT-Seite + `/api/fundamentals`), hartkodierte SAMPLE_NEWS_EVENTS (Econ-Kalender existiert im Terminal), JSON-Export/Import (kommt zentral in Settings), lokaler COT-Bias-Refresh (`cot_snapshots`-Pipeline des alten Journals — Terminal-COT ist die bessere Quelle; Bestandsdaten in `cot_*`-Tabellen bleiben unangetastet). |
| Hinweis | `fundamentalDrivers.ts` existiert im Journal-Quellcode **nicht mehr** (0 Treffer) — Anforderung „wird nicht mitkopiert" ist damit trivial erfüllt und bleibt es (Ziel-Zustand: 0 Treffer im gesamten Frontend). |

### d) calendar (Trade-Kalender, ≠ Econ-Kalender des Terminals)
| | |
|---|---|
| Dateien | `features/calendar/Calendar.tsx` (312) |
| Services/Stores | `tradeStore` (Trades pro Tag, P&L-Färbung) |
| UI | Card, Modal |
| Supabase | `trades` |
| Status | ⬜ — Route wird `/journal/kalender`, Terminal-`/kalender` (ForexFactory) bleibt unverändert |

### e) strategy
| | |
|---|---|
| Dateien | `features/strategy/StrategyBuilder.tsx` (927) |
| Services/Stores | `strategyService` → generisches `supabaseService`-CRUD |
| UI | Card, Modal, Button |
| Supabase | `strategies` (+ `trades.strategy_id`-Verknüpfung aus `RUN_THIS_strategy_link.sql`) |
| Status | ⬜ |

### f) backtest
| | |
|---|---|
| Dateien | `features/backtest/Backtest.tsx`, `BacktestLanding.tsx`, `BacktestRoom.tsx` (432), `BacktestWizard.tsx`, `BacktestAnalysis.tsx` (367), `backtestStats.ts`, `useBacktestSessions.ts`, `types.ts` |
| Services/Stores | `backtestService` (Sessions inkl. Trades+Config als JSONB in `backtest_sessions`) |
| UI | Card, Modal, Button, CommandInput, charts |
| Supabase | `backtest_sessions` (+ Spalten aus `RUN_THIS_backtest_problems.sql`) |
| Status | ⬜ |

### g) settings
| | |
|---|---|
| Dateien | `features/settings/Settings.tsx` (847) |
| Services/Stores | `preferencesService` (`user_preferences` Key/Value), `accountConfigService`, `uiStore`, Export/Import (JSON) |
| Supabase | `user_preferences`, `user_profiles`, `risk_settings` |
| Status | ⬜ — Electron-spezifische Teile (Speicherpfad, Auto-Update) entfallen |

### Shared-Schicht
| Journal | Ziel in frontend-next | Status |
|---|---|---|
| `shared/lib/supabase.ts` (Browser-Client) | `lib/supabase/client.ts` (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | ⬜ |
| `shared/services/*` (supabaseService, trade, accountConfig, outlook, strategy, backtest, preferences) | `lib/journal/*` | ⬜ |
| `shared/stores/*` (zustand) | `lib/journal/stores/*` (Client Components) | ⬜ |
| `shared/ui/*` (18 Komponenten) | `components/ui/*` — neu gestaltet, Terminal-Dark-Theme als Basis (siehe Design) | ⬜ |
| `shared/utils/calculations.ts`, `dateUtils.ts` | `lib/journal/` | ⬜ |
| `shared/config/constants.ts`, `schemas.ts` (zod) | `lib/journal/` | ⬜ |

## Bewusst NICHT migriert (Begründung)

| Was | Warum |
|---|---|
| `electron/`, `webApi.ts`-localStorage-Fallback, Offline-Modus, HashRouter | Kombi-App ist reine Web-App mit Pflicht-Login; Supabase ist Single Source of Truth. |
| `api.ts` (`window.electronAPI`-Layer) + `webApi.ts`-Fetcher (COT/Frankfurter/Kalender/Zins-Hardcode) | Electron-IPC obsolet; Marktdaten liefert das Terminal (Supabase-Jobs) bzw. GVA-Backend `/api/fundamentals`. Hartkodierte Zinssätze (Stand Mai 2026) wären Datenmüll. |
| `i18n/` (i18next, 2 Sprachen) | Single-User, UI durchgehend Deutsch — Framework-Overhead ohne Nutzen. |
| `utils/migration.ts` (localStorage→Supabase-Einmalmigration), `utils/tradingViewIntegration.ts` (Electron-Fenster) | Einmalzweck erfüllt bzw. Electron-gebunden. |
| `providers/QueryProvider` (react-query) | Datenzugriff läuft über Server Components + leichte Client-Stores; react-query nur für Electron-Polling nötig gewesen. Wird nachgerüstet, falls sich echter Bedarf zeigt. |
| GlobalSearch (Cmd+K) | Wird im Zuge des Design-Overhauls neu bewertet; zunächst nicht portiert (geringe Nutzung, hohe Kopplung an alte Routen). Falls vermisst → Backlog. |

**Hinweis Screenshots:** Das alte Journal speicherte Screenshots im Web-Modus **nur in
localStorage des Browsers** (Base64, Key `trading-journal-screenshots`); der JSON-Export
enthielt sie nicht. Die Tabelle `trade_screenshots` existierte, wurde vom Code aber nicht
befüllt. Die Kombi-App speichert Screenshots in `trade_screenshots` (Supabase). In Supabase
vorhandene Daten gehen nicht verloren; localStorage-Screenshots des alten Deployments sind
technisch nur aus dem alten Browser-Origin exportierbar (falls benötigt: einmalig altes
Deployment öffnen und Export-Snippet ausführen — auf Zuruf).

## Supabase-Schema

`supabase/schema.sql` (Repo-Root) = eine idempotente Master-Datei (Status: ✅ geschrieben):
1. Journal-Tabellen aus `TRADING-JOURNAL/desktop-app/supabase/` (maßgeblich: `008_complete_fresh_setup.sql` + `009_schema_update.sql` + drei `RUN_THIS_*.sql`) — keine Umbenennungen.
2. Terminal-Tabellen (vorher `frontend-next/supabase/schema.sql`, jetzt in die Master-Datei integriert; `seed.sql` liegt ebenfalls im Root-`supabase/`).
3. Neu: `signals` (Scanner-HITs) mit RLS + Index `(user_id, status, hit_at desc)`.
4. RLS auf allen Tabellen; Journal+signals mit `auth.uid() = user_id`-Policy (inkl. `WITH CHECK`), Terminal ohne Policy (nur Service-Role). `updated_at`-Trigger überall, wo das Feld existiert.

### Gefundene Konflikte zwischen den Journal-Migrationsdateien

| Tabelle | 008_complete_fresh_setup.sql | RUN_THIS_* (neuer) + App-Code | Entscheidung in schema.sql |
|---|---|---|---|
| `user_preferences` | `user_id UNIQUE` + `preferences JSONB` | `(user_id, key, value)`, PK `(user_id,key)` — `preferencesService` nutzt genau das | Key/Value-Variante. Liegt live das Alt-Schema vor → `RAISE WARNING` statt stiller Umbau. |
| `backtest_sessions` | `pair TEXT NOT NULL`, `timeframe`, `start_date` … | schlank: name/status/elapsed_ms/trades/stats (Config in `stats.config`) — `backtestService` schreibt kein `pair` | Schlanke Variante; existiert `pair NOT NULL` (Alt-Schema) → wird per `DROP NOT NULL` gelockert (dokumentiert, sonst schlägt jedes Speichern fehl). |
| `trades.result`, `outlooks.status/confidence` | mit CHECK-Constraints | ohne CHECKs | Ohne CHECKs (lenient, bestandsdatensicher). |
| `outlooks` Spalten | `cot_bias JSONB`, `target_entry/sl/tp`, `interesting_zone`, `image_data` | identisch + 009-Erweiterungen (`is_starred`, `setup_id`, `strategy_checklist`, `fundamental_outlook`) | Beides (Basis + Erweiterungen als `ADD COLUMN IF NOT EXISTS`). |

### ⚠️ Journal-Supabase-Projekt ist pausiert (INACTIVE)

Das Supabase-Projekt `yahvhzywsynnsqznysfr` („kerim.alur@gmail.com's Project", eu-west-1,
angelegt 2026-02-08 — mutmaßlich das Journal-Projekt) ist im Free-Tier pausiert.
**Vor dem Einspielen von schema.sql im Supabase-Dashboard wiederherstellen (Restore)**
und kurz verifizieren, dass `trades`/`accounts` mit Bestandsdaten vorhanden sind
(= richtiges Projekt). Ein automatischer Restore aus dieser Session wurde bewusst
nicht durchgeführt.

## Live-Kopplung Scanner → Journal (Block 5)

- Backend (`Backend/main.py`): beim HIT **additiv** INSERT in `signals` (Supabase, Service-Role) mit Fundamental-Snapshot beider Währungen. Keine Änderung an `data_pipeline.py`, `analyzer.py`, `_zones_loop`, `_price_loop`, Sticky-HIT, CONSUMED, `state.json`.
- Neuer Endpoint `GET /api/fundamentals` (Master aus `fundamentals.py`); einziger Fundamentals-Lieferant fürs Frontend.
- Signals-Inbox im Scanner-Feature: Journalieren (TradeForm vorausgefüllt: Pair, Datum, Setup „GVA", Snapshot-Notiz) / Später ansehen (bleibt `new`, Badge) / Verwerfen (`dismissed`).

## Setup-Anleitung (einmalig, manuell)

1. **Supabase**: bestehendes Journal-Projekt öffnen → SQL-Editor → `supabase/schema.sql` komplett ausführen (idempotent, legt nur Fehlendes an) → danach `frontend-next/supabase/seed.sql` (Instrumente).
2. **Google-OAuth** (falls im Journal-Projekt noch nicht aktiv): Google Cloud Console → OAuth-Client (Web) → Authorized redirect URI = `https://<projekt-ref>.supabase.co/auth/v1/callback` → Client-ID + Secret in Supabase unter Auth → Providers → Google eintragen. In Supabase Auth → URL Configuration: Site-URL = Vercel-Produktions-URL, zusätzliche Redirect-URLs für Preview-Deployments (`https://*-<team>.vercel.app/**`) und `http://localhost:3000/**`.
3. **Vercel** (Projekt-Root = `frontend-next`): Env-Vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (neu), zusätzlich zu den bestehenden Terminal-Vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OANDA_*`, `CRON_SECRET`, …).
4. **Render** (Backend): neue Env-Vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (für signals-INSERT), optional `FRED_API_KEY`.
5. Lokal: `frontend-next/.env.example` → `.env.local` kopieren und füllen.

## Design-Overhaul (Block 3)

Basis ist das dunkle Terminal-Theme (`globals.css`, Panel/TopBar/Sidebar). Journal-UI-Kit
(BentoGrid, Gauge, StatCard, …) wird nicht 1:1 kopiert, sondern im Terminal-Look neu aufgebaut
unter `components/ui/`. Screenshot-Vergleich alt/neu wird hier ergänzt, sobald die ersten
Features stehen. <!-- TODO: Screenshots -->

Stand des UI-Kits (✅ Block 3): `Button`, `Modal`, `Toaster`/`toast`, `Field`/`Input`/`Select`/
`Textarea`, `StatCard`, `Badge`, `EmptyState`, `Skeleton`/`SkeletonRows`, `Segmented`,
`ProgressRing` — dazu Motion-Utilities (`anim-fade-in`, `anim-slide-up`, `anim-scale-in`,
Shimmer) und Focus-/Selection-Styles in `globals.css`. `Panel` (Terminal) bleibt der
Karten-Grundbaustein.

Bewusste Abweichungen vom Auftragstext:
- **Icons: Phosphor statt Lucide.** Die Terminal-App nutzt durchgehend Phosphor (Webfont);
  ein zweites Icon-Set würde genau die geforderte Konsistenz brechen.
- **Motion: CSS-Keyframes statt Framer Motion** („o.ä." laut Auftrag): gleiche sanfte
  Übergänge ohne ~40 kB Zusatz-Bundle; nachrüstbar, falls komplexe Layout-Animationen nötig werden.

## Journal-Repo einfrieren (Block 6)

Root-README von TRADING-JOURNAL bekommt Archiv-Hinweis („abgelöst durch GVA Screener" + Link). Danach keine Commits mehr dort.
