# GVA-Screener — Projekt-Status & Resume-Notiz

> Notiz für Geräte-/Session-Wechsel. Der Chat-Verlauf ist NICHT im Repo —
> diese Datei ersetzt ihn als Kontext. Bei neuer Session: "lies STATUS.md".

Stand: 2026-07-20

## Nachschärfung des Kern-Workflows — 5 Review-Restpunkte (2026-07-20, Teil 2)
Review von `341d425`. Architektur unverändert (Supabase = Wahrheit, `state.json`
= Cache, keine Disk in `render.yaml`, `collect_hits` = einzige Hit-Logik,
`freshnessOf`/`FreshBadge` = einzige Frische-Logik).

**1 (🟠) `warmup` konnte sich verklemmen.** `compute_zones` überspringt Pairs mit
leerem `daily` oder Exception — `ZONES` bekommt für sie nie einen Eintrag. Ein
einziges dauerhaft kaputtes Pair hielt das Board für immer auf „Backend startet
(Zonen 27/28)" und machte die 27 funktionierenden Pairs unsichtbar. Damit wäre
„leeres Board sieht aus wie kein Setup" nur gegen „blockiertes Board trotz
gültiger Daten" getauscht gewesen — derselbe Fehlermodus Stille.
- Backend zählt abgeschlossene Zonen-Läufe (`ZONES_RUNS`), `GET /api/screener`
  liefert `zones_complete_run` + `zones_runs`.
- Neuer Board-Zustand **`partial`**: erster Zyklus durch, aber `zones <
  pairsTotal` → Lanes werden **normal gerendert**, dazu ein nicht wegklickbarer
  Warn-Chip „nur 27/28 Pairs geladen — 1 Pair liefert keine Daten".
- Sicherheitsnetz für das Deploy-Fenster (altes Backend ohne das Feld):
  `WARMUP_GRACE_MS` = 3 min ab erstem erfolgreichen Fetch, danach `partial`.
- Kopfzeile macht alle drei Fälle jederzeit ablesbar (`zonesLabel`):
  „startet · Zonen 6/28" / Warn-Chip / „28/28 Pairs".

**2 (🟠) Nachtrag-Fenster schloss bei Teilausfällen zu früh.**
`_mark_late_scan_done()` lief, sobald EIN Pair durchkam. Fiel Pair X in genau
diesem Lauf aus, rückte `last_backfill_scan` trotzdem vor — und da der Wert auf
Tagesgenauigkeit gekürzt wird, fiel ein verpasster Hit bei X vom Vortag danach
dauerhaft aus dem Suchfenster.
- Zeitstempel jetzt **pro Pair** in `screener_state.last_backfill_scan_by_pair`
  (EIN Key mit Dict statt 28 Keys: 1 Lese- + 1 Schreibvorgang pro Lauf statt 56).
- Fortgeschrieben wird nur, wenn das Pair sauber durchlief — inklusive
  `_handle_late_hits`; wirft der Nachtrag, bleibt das Fenster offen.
- Migration: gesetzter globaler Altwert gilt als Startwert für alle Pairs, sonst
  wäre nach dem Deploy jedes Pair fälschlich „erster Lauf" und der Nachtrag
  einmalig stumm. Alt-Key wird nur noch gelesen, solange ein Pair fehlt.
- Ausfälle stehen im Log: „… — Nachtrag-Fenster bleibt offen".

**3 (🟡) Kommentar bei `found[-1]` stimmte nicht.** Ältere Treffer kommen NICHT
im nächsten Refresh dran — das Fenster rückt nach. Kommentar und
`late_hits.py`-Docstring sagen das jetzt: bewusst nur der jüngste Treffer je
Pair und Fenster, ältere gehen verloren. Keine Verhaltensänderung.

**4 (🟡) `fetch_signal_rows(limit=1000)` war eine Zeitbombe.** Wächst die
Historie über 1000 Zeilen, fallen alte consumed-Linien aus dem Fenster und
gelten wieder als frei → Alert auf ein längst getradetes Setup.
- `fetch_consumed_rows()` lädt **ohne Limit**, paginiert über den
  PostgREST-`Range`-Header (Seite 1000, Abbruch bei 50 Seiten, `order=id.asc`
  für stabile Seitengrenzen), nur die drei nötigen Felder.
- `fetch_open_signal_rows()` behält ein Fenster (`OPEN_SIGNAL_LIMIT = 500`) —
  es gibt höchstens einen offenen HIT je Pair.
- `fetch_lifecycle_rows()` setzt beide zusammen (offene zuerst, damit
  `state_from_rows` den jüngsten HIT wählt) und liefert `None`, sobald EINE
  Abfrage scheitert: ein halber Zustand wäre schlimmer als keiner.
- Start-Log nennt die Zahl der consumed-Linien; ein Abschneiden wäre sichtbar.

**5 (🟡) Bildungsdatum ging beim Restart verloren.** Migration
`signals_line_formed_date` (additiv, nullable). Beide Schreibpfade (Live-Hit und
Nachtrag) füllen die Spalte, `to_iso_date()` normalisiert die zwei Quellformate
('DD.MM.YYYY' aus analyzer, ISO aus `collect_hits`) auf ISO. `state_from_rows`
stellt `TRIGGERED[pair]["date"]` wieder her; das Modal zeigt „Formiert am".
Altzeilen ohne Wert bleiben gültig und zeigen einen Platzhalter.

**Verifiziert:** 132 pytest grün (25 neu: `test_scan_windows.py` 11,
`test_signal_fetch.py` 14). 34 Frontend-Kontrollwerte grün. tsc + `next build`
sauber; ESLint unverändert 18 vorbestehende Meldungen in 12 nicht berührten Dateien.

## Kern-Workflow repariert: Lebenszyklus, Downtime, Sichtbarkeit (2026-07-20)
Review-Befund: vier strukturelle Defekte im Kern-Workflow, alle mit dem
Fehlermodus **Stille** — das Board sah funktionsfähig aus, während nichts mehr
passierte. In drei Arbeitspaketen behoben (A und B sind Verhaltensänderungen,
C ist reine Sichtbarkeit).

**A — Linien-Lebenszyklus schliesst sich jetzt (🔴)**
- *Vorher:* `TRIGGERED[pair]` ist sticky. Aufgehoben wurde es nur durch
  `POST /api/mark {done}` — und `markPair` rief ausschliesslich
  `ScannerShell.tsx`. Das Cockpit importierte die Funktion nicht einmal.
  Folge: Pair hittet → „Genommen" → Karte weg → Backend bleibt **für immer**
  auf HIT. Kein Alert, keine nächste Linie. Nach Wochen sind die aktivsten
  Pairs tot und drei leere Lanes sehen aus wie „nichts los".
- **A1:** `onTake` und `onDismiss` rufen zusätzlich `markPair(pair,"done")`,
  „Beobachten" ruft `markPair(pair,"pending")`. Aufrufe sind idempotent und
  werfen nicht (`markPair` gibt `boolean` zurück, loggt statt zu werfen) —
  ein fehlgeschlagener Backend-Call blockiert weder Supabase noch die UI.
- **A2:** Zustand liegt in **Supabase**, nicht mehr in `state.json`
  (`render.yaml` deklariert bewusst weiterhin KEINE Disk — Render Free hat kein
  persistentes FS, die Lösung ist die DB). Neu `Backend/lifecycle_state.py`:
  `journaled`/`dismissed` = **consumed**, `new`/`watchlist` = **triggered**.
  Kein Daten-Rewrite, bestehende `signals`-Zeilen werden korrekt gedeutet.
  `state.json` ist auf **reinen Cache** degradiert; ein Lauf mit gelöschter
  Datei verhält sich identisch.
- **Migration ohne Alert-Sturm:** Ein offener HIT, den nur die Datei kennt und
  Supabase nicht, gilt **im Zweifel als consumed** — lieber ein Alert zu wenig
  als eine Flut auf längst getradete Setups. `ALERT_CACHE` wird beim Start aus
  den offenen Signalen vorbelegt (kein Doppel-Alert nach Restart).
- **Kein Weg zurück in die Sackgasse:** `reconcile_state()` läuft bei jedem
  Zonen-Refresh (15 min) und löst Trigger, deren Signal ausserhalb von
  `/api/mark` geschlossen wurde (z.B. direkt im Journal).
- `POST /api/mark` bleibt in Signatur und Verhalten kompatibel
  (`ScannerShell.tsx:44` unberührt); neu ist nur der Durchschrieb nach Supabase
  (`done` → `dismissed`, `pending` → `watchlist`, fire-and-forget) und dass ein
  doppelter Aufruf `{ok:true, reason:"already_resolved"}` liefert statt zu failen.

**B — Verpasste Hits während Downtime werden nachgetragen (🔴)**
- *Vorher:* Kreuzungs-Erkennung braucht `PREV_PRICE`; nach jedem Restart leer.
  Render Free schläft nach 15 min, der Keep-Alive ist ein GitHub-Cron (verzögert
  notorisch 5–20 min). Eine Linie, die im Downtime-Fenster durchquert wird und
  nicht zurückkommt, wurde **nie** erkannt.
- Neu `Backend/late_hits.py`: beim Zonen-Refresh prüft
  `replay.gva_history.collect_hits` (**keine zweite Erkennungslogik**), ob seit
  dem letzten Lauf eine Linie berührt wurde. Treffer → Signal + Telegram-Alert,
  beide klar als **„nachträglich erkannt"** gekennzeichnet.
- Zeitpunkt des letzten Laufs liegt in `screener_state.last_backfill_scan`
  (Supabase) — er muss genau die Downtime überleben, die er misst.
- **Dedupe:** offener HIT / consumed Linie / `ALERT_CACHE` — derselbe Treffer
  wird bei einem zweiten Refresh weder geschrieben noch gealertet. Nachträglicher
  Hit auf eine bereits consumed Linie erzeugt **nichts**.
- **Erster Lauf überhaupt** trägt bewusst nichts nach (sonst Alert-Sturm über die
  gesamte Historie).
- Grenze: OANDA liefert nur abgeschlossene Tageskerzen → Nachtrag spätestens mit
  dem nächsten Tagesschluss (NY 17:00), nicht sekundengenau. Genau deshalb ist
  das Flag da.

**C — Leeres Board ist von Ausfall unterscheidbar (🟠)**
- `GET /api/screener` liefert jetzt `{data, updated, zones, pairs_total, live}`
  statt roh `LIVE_CACHE["data"]`. `toSnapshot()` im Frontend hebt auch die alte
  Array-Antwort auf den neuen Vertrag (Deploy-Fenster).
- **Kaltstart** (`zones < 28`) rendert den eigenen Zustand
  „Backend startet (Zonen X/28)" — **nicht** `ok` mit drei leeren Lanes.
- **Kopfzeile** „Stand HH:MM · N Pairs": >2 min grau, >5 min `warn`.
- **OANDA-Ausfall:** `live:false`, betroffene Karten tragen `stale:true` und
  zeigen `~` vor der Pip-Distanz; Board bleibt bedienbar.
- **Keine neue Frische-Logik:** `freshnessOf` bekam überschreibbare Schwellen
  (Defaults unverändert, Cockpit ruft `freshnessOf(alterInMinuten, 2, 5)`),
  `FreshBadge` ist aus `RealYieldView` nach `components/ui/FreshBadge.tsx`
  herausgelöst und wird von beiden genutzt.

**DB** (Migration `screener_lifecycle_state_and_detected_late`, angewandt, additiv):
`signals.detected_late boolean default false` + Tabelle `screener_state`
(key/value/updated_at, RLS an ohne Policies).

**Verifiziert:** 107 pytest grün (neu: `test_lifecycle_state.py` 14,
`test_late_hits.py` 7, `test_screener_lifecycle.py` 17 — inkl. hit → genommen →
nächster Hit, Restart-Persistenz, Dedupe-Logik). 20 Frontend-Kontrollwerte grün
(`npx tsx scripts/cockpit-board-check.mts`). tsc sauber, `npm run build` sauber;
ESLint-Meldungen sind ausschliesslich vorbestehend (journal/, layout/, ml/,
hooks/ — keine berührte Datei).
**Noch nicht live gesichtet** (Auth + Render nötig) — beim nächsten Login prüfen.

## Trade-Cockpit — neue Startseite (2026-07-20)
Konsolidierung: statt fundamentalem Sprawl (Weekly Outlook, Setup-Finder,
Fundamental-Track, Macro Terminal, COT, Season) ein GVA-zentrisches Cockpit.
Nur GVA-Setups werden getradet; Fundamentales ist Konfluenz, kein Gate.
- **Seite** `/cockpit` (Startseite; Landing-Redirects `app/page.tsx` +
  `app/(app)/page.tsx` → `/cockpit`). 3 Lanes: **Wartend** (Scanner `PREPARE`,
  Distanz ≤ 100 Pips) · **Aktiv** (`signals.status='new'`, frischer HIT) ·
  **In Arbeit** (`signals.status='watchlist'`).
- **Reuse, kaum neuer Code:** Lanes = `fetchScreener()` (live) + `signals`-Tabelle
  (Backend füllt bei HIT, `supabase_signals.record_hit_async`) + Stärke-Quintil-
  Ranking. Konfluenz via `pairBias`/`biasReason` (✓ Rückenwind / ✗ Gegenwind).
- **c-clean:** jeder HIT erscheint automatisch im Board; nur „Genommen" schreibt
  einen Journal-Trade (`sessionStorage.tradePrefill` → `/journal`, Signal→`journaled`).
  Beobachten→`watchlist`, Verwerfen→`dismissed`. Winrate bleibt sauber.
- **Popup** (Klick auf Pair): Verdikt + beide Quintile (Score + Top-Faktoren) +
  Linien-Info + High-Impact-Kalender der Woche.
- **Nav:** neue Gruppe „Trading" (Cockpit, Währungs-Ranking) oben; Fundamentales
  in die Gruppe „Labor · versteckt" (siehe nächster Abschnitt).
- **Neue Files:** `lib/cockpit/board.ts` (pure Lane-Assembly), `components/cockpit/
  {CockpitBoard,FundamentalModal}.tsx`, `app/(app)/cockpit/page.tsx`.
- **Verifiziert:** tsc + ESLint grün. **Nicht** lokal lauffähig (braucht FastAPI-
  Backend + Supabase-Session) → Live-Check nach Vercel-Deploy.

## Silent Factor Lab — Projekt B (2026-07-20)
Spec: `docs/superpowers/specs/2026-07-20-silent-factor-lab-design.md`
Plan: `docs/superpowers/plans/2026-07-20-silent-factor-lab.md`

Misst still im Hintergrund, **welcher Faktor tatsächlich Richtung trifft** —
je Währung, forward gegen `fwd_ret` (demeaned Korb) gereift. Kein neues ML,
keine Entscheidungsautomatik. Verallgemeinert den `run_weekly`-Paper-Track.
- **Faktoren v1:** `cot`, `rates`, `season` (atomar, aus `panel.py`-Scores) +
  `ranking_baseline` (0.5·rates+0.5·season) als Kombi-Referenz. Horizonte 1W/4W.
  `real_yield`/`macro_score`/`setup_finder` = **v2** (kein Python-Wochen-Produzent).
- **Tabelle** `factor_track` (PK week_start,factor,ccy,horizon) + View
  `factor_track_stats` (Aggregat; nötig, weil PostgREST Rohabrufe bei 1000 Zeilen
  kappt und die wenigen `live`-Zeilen sonst unsichtbar blieben).
- **Zwei Quellen, streng getrennt:** `source='seed'` = **Historisch/Backtest**
  (roher Faktor-Sign-Hitrate über die Panel-Historie, NICHT purged) ·
  `source='live'` = **Forward**, der eigentliche Beweis. Neutral (`hit IS NULL`)
  zählt nie mit.
- **Jobs:** `ml_engine/seed_factors.py` (einmalig, Workflow „ML Seed Factors") ·
  `ml_engine/run_factors.py` (samstags im Workflow „ML Weekly Ranking",
  Step mit `if: always()`, damit ein `run_weekly`-Fehler den forward-only
  Snapshot nicht dauerhaft überspringt). `run_weekly.py` unangetastet.
- **UI** `/ml/factor-lab`: Live-Hitrate + n neben Historisch + n, ehrlich gelabelt.
- **Stand:** Seed gelaufen (Historisch gefüllt). **Live ist noch leer** — füllt
  sich ab dem ersten `run_factors`-Lauf und wird erst über Monate aussagekräftig.

## Nav-Ausdünnung + harte Routen-Sperre (2026-07-20)
Zu viele sich widersprechende Tabs = Entscheidungslähmung. Deshalb radikal reduziert.
- **Sichtbar in „Labor · versteckt":** Factor-Lab · Engine-Log · Macro Terminal ·
  Real Yield · News.
- **Hart NICHT erreichbar** (Redirect → `/cockpit`, auch per direkter URL):
  Weekly Outlook, COT Intelligence, Season 2.0, Fundamental-Track, Setup-Finder,
  ML-Modell, Daten-Check, Training, Labor. **Code + Seiten bleiben im Projekt.**
- **Mechanik:** `frontend-next/proxy.ts` → `HIDDEN_PREFIXES` (Prefix-Match) plus
  Exakt-Regel `pathname === "/ml"` (Daten-Check; Unterseiten wie `/ml/ranking`,
  `/ml/factor-lab`, `/ml/engine-log`, `/ml/replay` bleiben erreichbar).
- **Wieder aktivieren (2 Schritte):** Pfad aus `HIDDEN_PREFIXES` streichen **und**
  Eintrag in `components/layout/nav.ts` zurück. Nur eins von beidem reicht nicht.
- `/dashboard` heisst jetzt **News** und zeigt nur noch den Wirtschaftskalender —
  Wochenplan + GVA-Nähe waren Doppelspur zum Cockpit.
- Login-/Admin-Fallback-Redirects zeigen auf `/cockpit`.

> Langsame Scanner-Seiten (Radar/Signale/Heatmap) = Render-Kaltstart des FastAPI-
> Backends, kein Code-Problem. Währungs-Ranking ist schnell (Supabase + 5 min Cache).

## ⭐ Kanonische Zielgrösse & Vokabular (VERBINDLICH, 2026-07-20)
Damit «Q5» und «Trefferquote» nie wieder zwei Dinge bedeuten:

**Kanonische Zielgrösse für ALLE Aussagen über Ranking-/Signal-Qualität:**
die purged Walk-Forward Engine-Baseline — `Backend/ml_engine/evaluate.py`,
Zielgrösse = **demeaned Korb-Log-Returns** (`macro_features/panel.py:84-85`).
Aktueller Stand: mean_hitrate ≈ **0,52–0,54 roh**, hall_score ≈ **0,51**
(= Ø-Trefferquote − Streuung). Alles andere ist nachrangig.

**Zwei verschiedene Quintile — nie unqualifiziert «Q5» sagen:**
- **Stärke-Quintil**: Position des Zins+Saison-Scores in seiner eigenen
  156W-Verteilung (Q5 = stärkstes Fünftel). Das ist, was Ranking-Seite,
  Dashboard-WeekPlan, Setup-Finder, Fundamental-Track anzeigen. DB-/Typ-Feld
  heisst `strength_quintile` (umbenannt von `confidence_quintile` am 2026-07-20,
  Migration `rename_confidence_quintile_to_strength_quintile` — Werte unverändert).
- **Konfidenz-Quintil**: Top-20 % nach |Composite-z| eines Modells. Lebte nur im
  entfernten ML-Labor; Quelle der 57,6 %. NICHT dasselbe wie das Stärke-Quintil.

**Andere Zielgrössen im Umlauf (nicht kanonisch, nur gekennzeichnet nutzen):**
rohe Pair-Rendite Close-to-Close (Ranking-View / `fundamental_track`) →
im UI als **„Kalibrier-Blick, keine Signifikanz"** gelabelt (überlappende
4W-Fenster + korrelierte Pairs → effektives n ≪ Zeilenzahl). Bewusst NICHT
gepurged: Purging wäre eine Logikänderung mit eigenem Validierungsbedarf; das
ehrliche Label ist die pragmatische, risikoarme Variante und verhindert, dass
daraus je wieder eine Headline-Zahl wird.

**Label-Disziplin:** „handelbar" erst, wenn der Paper-Track signifikant >50 %
mit ausreichend n zeigt. Bis dahin: „Kandidat" / „Beobachtung". Jede prominente
Prozentzahl braucht Definition + Zeitraum + n (sichtbar oder Tooltip).

## ML-Engine stabilisiert + Trefferquote transparent (2026-07-20)
Spec: `docs/superpowers/specs/2026-07-19-ml-engine-stabilisierung-design.md`
Problem: nächtlicher «Bester» war roher max(hall_score) über ~1200 Zufalls-Configs
→ sprang jede Nacht (lgbm·4W·scores ↔ logreg·4W·rates+scores ↔ lgbm·1W·cot).
Und: hall_score (= mean_hitrate − std_hitrate) zeigte nicht, ob «keine Edge»
oder «instabile Edge». **Stabilisierung reduziert Auswahl-Rauschen, verbessert
das Signal NICHT.** Holdout-Disziplin unangetastet (promote.py/ml_holdout_access).
- **Kern-Suchraum** (search.py, VORAB fixiert aus Nacht-Siegern 13.–19.07.,
  4/7 logreg·4W·[rates,scores], 6/7 Horizont 4): Default 80 % der Draws aus
  logreg · 4W · Teilmengen{rates,scores}, 20 % Exploration voller Raum.
  Env: ML_CORE_ALGOS / ML_CORE_HORIZONS / ML_CORE_FEATURE_GROUPS /
  ML_EXPLORE_FRAC. Configs tragen `space: core|explore`.
- **Seed-Robustheit** (run_experiments._reseed_top_configs): nach dem Budget-
  Loop Top-5-Configs mit insgesamt 3 Seeds wiederholen (ML_TOPK_RESEED /
  ML_SEED_REPEATS / ML_RESEED_BUDGET_S=300s-Deckel); Kandidat der Nacht =
  bester Seed-MITTELWERT, nicht der Einzel-Glückslauf. (Im --max-Smoke übersprungen.)
- **Hysterese** (neu ml_engine/stability.py, pure functions): stabile Linie
  je Modell-Familie (algo·horizont·features). Wechsel NUR wenn Herausforderer
  die stabile Familie ML_STABLE_NIGHTS (3) Nächte in Folge um ML_STABLE_MARGIN
  (0.005) schlägt. best_hall/best_config bleiben ROH.
- **DB** (Migration `ml_engine_nights_stability` angewandt, additiv):
  ml_engine_nights + mean_hitrate, std_hitrate, stable_config, stable_score;
  View ml_engine_nights_live liefert zusätzlich mean/std des Nacht-Besten.
  mean/std der 7 Alt-Nächte backfilled (Befund: mean ≈ 0.52–0.54, std ≈
  0.005–0.033 → schwache, leicht instabile Edge — nicht «keine Edge»).
- **Engine-Log**: Tabelle + «Hit Ø±σ» und «Stabiles Modell»; Chart 3 Linien
  (roher Bester, stabile Linie, Ø-Trefferquote gestrichelt); Explainer erklärt
  mean−std, «keine Edge» vs. «instabile Edge», Hysterese. Alte Nächte ohne
  Felder zeigen «–».
- Tests: 56 pytest grün (neu: test_search_space, test_stability, Runner-
  Durchreichen + Re-Seed), Frontend-Build sauber.
- Hinweis Laufzeit: Nightly-Budget 50 min + Re-Seed ≤5 min bleibt unter dem
  60-min-Workflow-Timeout.

## Setup-Finder — Ranking ↔ Outlook-Konfluenz in EINEM Tool (2026-07-17)
Neue Seite **/ml/setup-finder** (Nav: Analyse). Führt die zwei bestehenden
Backtest-Hälften zusammen, wiederverwendet statt dupliziert:
- **Umschalter Signalquelle:** WÄHRUNGSRANKING (Q5/Q1, bestehender
  /replay/fundamental-track-Endpoint — jetzt über alle 28 Pairs, Concurrency 4,
  Fortschritt x/28, Fehler je Pair einzeln) ↔ WEEKLY-OUTLOOK (Konfluenz über
  die Outlook-Faktoren).
- **Gemeinsame Steuerung:** Zeitraum 52W/2J/5J/10J/eigener (RANGE_PRESETS
  jetzt in `lib/ml/fundamentalTrackApi.ts`, FundamentalTrack nutzt dieselbe
  Quelle), alle 28 Pairs. Gleiche Konfiguration treibt LIVE-Setups UND Backtest.
- **Outlook-Modus:** Faktoren an-/abwählbar (Retail mit «ab 2026-07»-Badge =
  kurze Historie), Schwelle 3/4/5 live (steuert Live-Liste + Pair-Tabelle);
  Backtest-Tabelle zeigt bewusst ALLE Schwellen 2/3/4/5 (kein nachträgliches
  Besten-Picking). 2v2-Patt bei Schwelle 2 → kein Signal. Effektiver Zeitraum
  + Faktor-Startdaten sichtbar; fehlende Daten zählen nicht (kein Hochrechnen).
- **Datenweg:** `lib/ml/backtest.ts` refaktoriert — gemeinsamer Loader
  (`loadSnapshotsAndPrices`) + `forwardReturns()` (kein Lookahead), neu
  exportiert `loadOutlookRows()` → Route `/api/ml/setup-finder`
  (unstable_cache 30 min, kompakte Rows); Client rechnet Faktor-/Schwellen-
  Kombis live in `lib/ml/confluence.ts` (15 Kontrollwerte grün).
  BucketTable (BacktestPanel) + RateTile (FundamentalTrack) exportiert und
  wiederverwendet. loadBacktest-Verhalten unverändert; rein additiv,
  Q-Score/Baseline unberührt. Build sauber.
- Visuell hinter Auth noch nicht gesichtet — beim nächsten Login prüfen.

## Backend-CPI aus BIS — Real-Zins im Makro-Terminal wieder live (2026-07-17, Teil 3)
`fundamentals.cpi_yoy()` holte CPI aus CPALTT01* (OECD via FRED, endgültig
tot) → realRate/score in `macro.py` (6h-Loop, Macro-Terminal) blieben auf
STATIC-Fallback eingefroren. Jetzt: neues `Backend/bis_api.py` — spiegelt
das Frontend (bis.ts/updateBis.ts): WS_LONG_CPI Serie 771 (fertiges YoY %),
Area-Mapping US/XM/GB/JP/CH/AU/NZ/CA, keyless.
- EIN Request für alle 8 Währungen + 6h-In-Prozess-Cache (Rate-Limit-schonend,
  passt zum Loop). Fetch-Fehler → alter Cache, ohne Cache → None → Faktor
  neutral (wie bisher, kein Crash). Rückgabeformat unverändert (float %/None).
- AUD/NZD quartalsweise = release-bedingt gültig; erst >400 Tage gilt eine
  Serie als tot (identisch Frontend-freshnessOf). macro.py unverändert —
  realRate/score rechnen automatisch wieder, sobald cpi nicht None ist.
- Verifiziert: 5 neue pytest (Parser/Cache/Frische/Fallback/Delegation),
  Suite 37/37 grün; Live-Check gegen stats.bis.org lieferte aktuelle Werte
  für alle 8 Währungen (USD 4.25 / JPY 1.35 / AUD 4.09 / NZD 3.08 …).
- Damit ist der frühere Vermerk «fundamentals.py CPI = CPALTT01* tot» behoben.

## FRED-API auch im Python-Backend (2026-07-17, Teil 2)
Das Backend zog FRED an ZWEI Stellen weiter über fredgraph.csv:
`fundamentals.py` (OECD-10Y + CPI für den 6h-Makro-Loop auf Render) und
`macro_features/data_sources.py` (Leitzinsen + H.10-FX-Kurse fürs ML-Panel —
Render-Warmup + GitHub Actions). Beide nutzen jetzt `Backend/fred_api.py`
(offizielle API, Key aus Env FRED_API_KEY, 1 Retry bei 429/5xx/Netz,
Log nennt Serie+Status, nie die URL). Fallbacks unverändert: fundamentals →
Faktor neutral, data_sources → alter CSV-Cache. Workflows ml-nightly/ml-weekly
reichen `secrets.FRED_API_KEY` durch. 5 neue pytest (Parser/Fehlerpfade),
Suite 32/32 grün (test_runner-Fix: FakeDB kannte ml_engine_nights nicht —
vorbestehend seit 16.07., separater Commit).
- **OFFEN (Kerim, manuell):**
  1. FRED_API_KEY zusätzlich in die **Render-Env** (gva-screener-backend)
     eintragen → Makro-Loop + Panel-Warmup ziehen wieder frische Zinsen.
  2. FRED_API_KEY als **GitHub-Repo-Secret** anlegen (Settings → Secrets →
     Actions) → nächtliche ML-Suche bekommt frische Daten (bis dahin: alter
     Actions-Cache, kein Crash).
  3. Vercel-seitig liegt der Key schon — einmal Cron "fundamentals" manuell
     laufen lassen und /makro/terminal prüfen (Daily-Serien wieder aktuell).

## FRED auf offizielle API umgestellt (2026-07-17)
`lib/sources/fred.ts`: fredgraph.csv (seit ~03.07. blockiert, Timeouts) →
offizielle FRED-API (series/observations, JSON). Key NUR aus Env
`FRED_API_KEY` (nie im Code/Log; Fehlerlog nennt Serie+Status, nie die URL).
Gleiche Schnittstelle (`fetchSeries` → Observations|null), 1 Retry bei
429/5xx/Netzfehler, ~80 Serien/Lauf bleiben unter dem Limit (120/min).
- **Befund DB (17.07.):** Daily-Serien (DGS10, VIXCLS, DFII10, T10YIE, DGS2,
  Dollar-Indizes) letzter Stand 26.06.–02.07. → reiner Transport-Ausfall,
  API-Umbau fixt sie. IRLTLT01* (10Y non-US): Mai-Stand = normaler ~2M-Lag,
  Serien leben. T10Y2Y war nie geladen → füllt sich beim ersten Lauf.
- **CPI je Währung:** OECD-Indizes auf FRED endgültig tot (2021–2025) → Katalog
  zeigt jetzt auf die BIS-Serien (`BIS_CPI_YOY_*`, source:"bis", updateFred
  überspringt sie — updateBis pflegt sie). Werte sind direkt YoY %.
  JPY monatlich frisch (Apr 26); AUD/NZD quartalsweise = release-bedingt,
  gekennzeichnet (cadence:"quarterly", Chip im Vergleich statt Stale-Badge).
  Alte OECD-Zeilen bleiben als DB-Historie.
- **Stale neu:** is_stale = Fetch-Fehler ODER Alter > Kadenz-Schwelle
  (`staleAllowanceDays`: daily 14 / weekly 30 / monthly 100 / quarterly 220 /
  unbekannt 400 Tage) — Quartalsserien flappen nicht mehr als "stale".
- terminal.ts rechnet YoY nur noch für isIndex-Serien (BIS ist schon YoY).
- Tests: 10 Mock-Kontrollwerte (Parser, 400/429/Retry, Key-Pfade) grün; Build sauber.
- **OFFEN (Kerim, manuell):** FRED_API_KEY kostenlos registrieren
  (fred.stlouisfed.org/docs/api/api_key.html) → als `FRED_API_KEY` in
  Vercel-Env (Production) + optional lokal `.env.local` eintragen. Danach:
  `npx tsx scripts/fred-api-smoke.mts` (lokal) oder fundamentals-Cron manuell
  laufen lassen → Daily-Serien springen auf aktuell. Render braucht den Key
  NICHT (FRED läuft nur im Vercel-Cron).

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
- **Konfidenz-Quintile OOS (alle 5, 4W): Q1 49.5 → Q5 57.6 %.**
  ⚠️ **ENTWERTET (2026-07-20): KEINE Baseline-Zahl.** Diese 57,6 % sind das oberste
  **Konfidenz**-Fünftel (Top-20 % nach |Composite-z|) eines interaktiv getunten
  Composites — selektions-optimistisch, nicht purged, anderes Mass/andere
  Stichprobe als das Live-**Stärke**-Quintil im Ranking. Nirgends als Beleg für
  Ranking-Qualität zitieren.
  **Kanonisch dagegen** (purged Walk-Forward, Zielgrösse demeaned Korb, evaluate.py):
  mean_hitrate ≈ **0,52–0,54 roh**, hall_score ≈ **0,51**. Vergleichbare *breite*
  Labor-Zahl derselben Zins+Saison-Logik: **51,8 %** (4W, OOS) — nahe Münzwurf.
  Siehe Abschnitt „Kanonische Zielgrösse & Vokabular" oben.

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
