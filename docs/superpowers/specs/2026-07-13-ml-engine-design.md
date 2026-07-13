# ML-Engine — Kontinuierliche Experiment-Maschine für fundamentale Confluence

Datum: 2026-07-13 · Status: Entwurf zur Review · Ansatz A (freigegeben)

## Ziel

Wöchentliches **Währungs-Ranking** (8 G8-Währungen, stark → schwach, mit Konfidenz)
als fundamentale Confluence für Kerims GVA-Trading. Dahinter eine Maschine, die
**dauerhaft** Modell-Varianten sucht (nächtlich, automatisch), aber durch einen
strikten Anti-Overfit-Vertrag nicht in Selbstbetrug laufen kann.

**Nicht** Ziel: Pair-Signale, Intraday-Prognosen, Auto-Trading.

## Entscheidungen (aus Brainstorming)

| Frage | Entscheidung |
|---|---|
| Nutzung | Währungs-Ranking-Dashboard (kein Setup-Filter) |
| «Viel trainieren» | Kontinuierliche Experiment-Suche, nicht Dauer-Fitting auf gleiche Daten |
| Compute | GitHub Actions (nächtlicher Batch ~60 min, kostenlos) |
| Modell-Ebene | 8 Währungen (Korb-Return), nicht 28 Pairs |
| Historie | ~25 Jahre (CFTC ab ~1995, FRED FX/Zinsen ab 1999) → ~1300 Wochen × 8 ≈ 10k Samples |
| Promotion | Manuell durch Kerim (Dashboard-Vergleich), kein Auto-Replace in v1 |
| Frontend | **/ml/labor wird komplett ersetzt** durch neue Ranking-Seite |
| Bestehendes `Backend/ml/` | Bleibt unangetastet, wird später abgelöst |

## Architektur / Datenfluss

```
GitHub Actions (nächtlich + samstags)
  → Python: macro_features (Feature-Panel) + ml_engine (Training/Prediction)
  → Supabase (ml_experiments, ml_champion, ml_weekly_rankings)
  → frontend-next liest Supabase direkt (wie bestehende Tabellen)
Render bleibt unbeteiligt (Free-Tier-Schlaf irrelevant).
```

## Baustein 1 — Feature-Fabrik (Ausbau `Backend/macro_features/`)

Neu: `build_feature_panel(start, end) -> DataFrame`
Zeile = (Woche, Währung), ~35 Feature-Spalten + Targets. Wochenraster: Dienstag
(COT-Stichtag), Nutzbarkeit per Release-Lag-Shift.

**Features** (alle as-of-korrekt via Zeitreihen-Shift statt Punkt-Abfrage):
- COT Legacy: Netto (NonComm/Comm/Retail), Δ1W, Perzentil (156W), z-Score (17J),
  Divergenz-Flag, Open Interest + Δ
- COT TFF: Dealer/AssetMgr/LevFunds Netto + Δ (NaN wo Kontrakt fehlt)
- Zinsen: Level, Differenzial-Ø, Momentum 6M (FRED, 42-Tage-Publikations-Lag)
- Saison: mean_ret, hit_years, active-Flag (12/17-Filter, Monatsebene)

**Targets:** Forward-Log-Return des Währungskorbs (Währung vs. Ø der 7 anderen)
über 1/2/4 Wochen; Label = Vorzeichen, Return für Auswertung.

**Performance-Anforderung:** vektorisiert (Rolling-Transforms + Lag-Shifts),
komplettes Panel < 2 min. Die bestehenden `compute_*`-Punkt-Funktionen bleiben
für Einzelabfragen/Audit erhalten.

**Leak-Test (Pflicht):** Für ≥3 zufällige Stichtage muss die Panel-Zeile exakt
den Werten von `build_feature_table(as_of)` entsprechen (Toleranz 1e-9).

## Baustein 2 — Experiment-Engine (`Backend/ml_engine/`)

Neues Python-Package, unabhängig von `Backend/ml/`.

**Tabelle `ml_experiments`** (Supabase):
`id, created_at, status (queued|running|done|failed), config jsonb, metrics jsonb,
git_sha, seed, runtime_s, error`
- config: Feature-Subset (Faktor-Familien an/aus, COT-Variante je Währung),
  Horizont (1/2/4W), Algo, Hyperparameter, CV-Schema
- metrics: OOS-Hitrate/AUC je Fold, Ø, Std über Folds, n je Fold

**Runner** (`run_experiments.py`, GitHub Actions nächtlich 02:00 UTC, Budget 60 min):
1. Feature-Panel bauen (Cache im Actions-Workspace)
2. Queue abarbeiten; leer → Random-Search generiert nächsten Batch selbst
3. Training mit **Purged Walk-Forward CV**: expanding Window, Embargo =
   Horizont-Wochen zwischen Train/Test, Holdout ausgeschlossen
4. Metriken zurückschreiben; Fehler → status=failed + traceback, nächstes Experiment

**Algos v1:** LightGBM (classifier), Logistic Regression (linearer Sanity-Check).
**Experiment #0 (fix):** adaptiver Composite (Labor-v2-Logik: z-Score-Summe
Zins+Saison Kern, Edge-Gewichte rollierend) = Baseline, die jedes ML schlagen muss.

**Suche v1:** Random Search über definierten Space. Optuna erst wenn Random
ausgereizt (bewusst YAGNI).

## Baustein 3 — Anti-Overfit-Vertrag (nicht verhandelbar)

1. **Holdout = letzte 104 Wochen.** Vom Runner nie gelesen. Auswertung nur bei
   Promotion-Prüfung; Tabelle `ml_holdout_access` zählt jeden Zugriff
   (wann, Experiment, Ergebnis) — Zähler sichtbar im Dashboard.
2. **Hall of Fame** rankt nach Ø-OOS **minus** Fold-Instabilität (Std-Abzug);
   Gesamtzahl gelaufener Experimente wird immer mit angezeigt (mentale
   Bonferroni-Latte: 1000 Versuche → 57 % OOS ist wenig).
3. **Paper-Track ist oberste Instanz:** echte Forward-Trefferquote entscheidet,
   nicht Backtest.

## Baustein 4 — Champion/Challenger

**Tabelle `ml_champion`:** `id, promoted_at, experiment_id, model_blob bytea,
config jsonb, holdout_metrics jsonb, note`
- Promotion **manuell**: Dashboard zeigt Champion vs. besten Challenger
  (OOS, Holdout, Paper-Track nebeneinander); Kerim promotet per Admin-Aktion
  (v1: Python-Script/CLI im Repo, kein UI-Button nötig).
- Erst-Champion: bestes Modell nach erster Such-Woche, sonst Baseline #0.

## Baustein 5 — Wochen-Job + Paper-Track

**Workflow samstags 08:00 UTC** (nach COT-Release Freitag):
1. Champion + Baseline predicten 8 Währungen für kommende Woche
2. Insert-only in `ml_weekly_rankings`: `week_start, ccy, model (champion|baseline),
   score, confidence_quintile, top_features jsonb, created_at`
   (Quintile aus OOS-Score-Verteilung des Modells; Labor-Regel: nur Q5 handelbar)
3. Gereifte Predictions (Horizont abgelaufen): realized_return + hit nachtragen
   → Live-Trefferquote je Modell wächst automatisch

## Baustein 6 — Frontend: /ml/labor → Währungs-Ranking

**Ersetzt die Labor-Seite komplett:**
- Seite `app/ml/labor/*` (bzw. Route) entfernen, neue Seite «Währungs-Ranking»
  an gleicher Nav-Position (ML-Gruppe); Route neu `/ml/ranking`,
  alte `/ml/labor` redirectet.
- `/api/ml/matrix` + `lib/ml/factorMatrix.ts` entfernen, sofern kein anderer
  Consumer (vor Löschung prüfen). Labor-Erkenntnisse sind in STATUS.md
  dokumentiert und leben als Baseline-Gewichte weiter.

**Inhalt der Ranking-Seite:**
1. Ranking-Tabelle: 8 Währungen sortiert, Score-Balken, Konfidenz-Quintil-Badge
   (Q5 hervorgehoben = handelbar), Top-3-Faktor-Beiträge je Währung
2. Paper-Track: kumulative Trefferquote Champion vs. Baseline (Wochen-Chart)
3. Engine-Status: Experimente gesamt/letzte Nacht, Hall-of-Fame Top 5,
   Holdout-Zugriffszähler, Champion-Info (seit wann, Config-Kurzfassung)

Design: bestehendes Terminal-Design-System (globals.css-Tokens).

## Secrets / Betrieb

- GitHub-Repo-Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Workflows: `.github/workflows/ml-nightly.yml`, `ml-weekly.yml`
- Actions-Budget (Free: 2000 min/Monat, Linux-Runner): nächtlich **60 min**
  Budget (~1800 min/Monat) + weekly ~10 min. LightGBM auf 10k Zeilen trainiert
  in Sekunden → hunderte Experimente pro Nacht auch mit 60 min.

## Tests

1. Leak-Test Panel vs. Punkt-Build (Baustein 1)
2. Synthetisches Signal: geplantete Edge wird gefunden (AUC deutlich > 0.5),
   pures Rauschen bleibt bei ~0.5
3. Embargo-Test: kein Train-Sample innerhalb Embargo-Fenster eines Test-Samples
4. Promotion-Regeln + Quintil-Zuordnung als Unit-Tests
5. Wochen-Job idempotent (doppelter Lauf → keine Duplikate, insert-only greift)

## Etappen (je eigener Commit)

1. Feature-Panel + Leak-Test
2. Supabase-Migrationen + Experiment-Runner lokal lauffähig + synthetische Tests
3. GitHub-Actions-Workflows (nightly + weekly)
4. Baseline #0 + erste Such-Nächte, Erst-Champion
5. Frontend: Labor raus, Ranking-Seite rein
6. Promotion-CLI + Doku in STATUS.md

## Out of Scope (v1)

Optuna, Auto-Promotion, Deep Learning, Intraday, Pair-Ebene, Sentiment-Features
(Historie erst ab 2026-07), Trade-Feedback-Loop.
