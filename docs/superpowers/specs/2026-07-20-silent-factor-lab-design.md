# Silent Factor Lab — Design (2026-07-20)

## Kontext & Ziel
Nach der Cockpit-Konsolidierung (Projekt A) sind die fundamentalen Detail-Tools
in die Nav-Gruppe „Labor · versteckt" gewandert. Sie werden nicht mehr täglich
zur Entscheidung genutzt, sollen aber **im Hintergrund messbar machen, welcher
Faktor tatsächlich Richtung trifft** — über ~1 Jahr Live-Betrieb.

Ziel: jeder Faktor = wöchentliche Richtungswette **je Währung**, forward gegen
den Korb-Return gereift. Ein versteckter Tab rankt die Faktoren nach
Trefferquote + n. Faktoren, die sich live bewähren, kann Kerim später aktiv
nutzen. **Kein neues ML, keine Entscheidungsautomatik** — reine Messung.

Kern-Idee: **den bestehenden `run_weekly`-Paper-Track auf N Faktoren
verallgemeinern.** `ml_weekly_rankings` trackt heute genau eine Linie (Ranking-
Score) live-forward; B macht dasselbe für mehrere Faktoren in einer Tabelle.

## Nicht-Ziele (YAGNI)
- Kein neues ML-Training, keine Modelle.
- Kein per-Pair-Tracking (Währungs-Ebene reicht; `fwd_ret` ist bereits demeaned Korb).
- Kein purged Walk-Forward für die Faktoren in v1 (roher Faktor-Sign-Hitrate + ehrliches n).
- Keine Entscheidungs-/Signal-Funktion — der Tab ist read-only Messung.
- Keine UI-Politur (Sparklines etc.) in v1.

## Einheit & Zielgröße
- **Einheit:** Währung (G8), wie der bestehende Paper-Track.
- **Zielgröße:** `fwd_ret_{h}w` aus `macro_features/panel.py` (demeaned Korb-Log-
  Return, panel.py:84-85) — die kanonische Zielgröße laut STATUS.md.
- **Horizonte:** 4W primär, 1W als Nebenwert.

## Faktoren
Ein Faktor liefert je Woche × Währung einen **Score** (Vorzeichen = Richtung).

### v1 — Panel-Faktoren (seedbar UND forward, alles schon in `panel.py`)
| Faktor-Key | Quelle (panel.py-Spalte) | Typ |
|------------|--------------------------|-----|
| `cot` | `cot_score` | atomar |
| `rates` | `rates_score` | atomar |
| `season` | `season_score` | atomar |
| `ranking_baseline` | `0.5·rates_score + 0.5·season_score` (`baseline_scores`) | composite-Referenz |

Die composite-Referenz beantwortet: „schlägt die Kombi ihre Einzelteile?"

### v2 — später (KEIN Python-Wochen-Produzent vorhanden)
`real_yield` (frontend `lib/calc/realYield.ts` / `macro.py`) und `macro_score`
(Weekly-Outlook-Composite, frontend `lib/calc/currencyScore.ts`) werden **nicht**
im ML-Panel berechnet. Sie live zu tracken erfordert erst einen serverseitigen
Wochen-Score-Produzenten → eigenes Folge-Design. `setup_finder` ist pair-level
und passt nicht auf die Währungs-Ebene → ebenfalls v2/verworfen.

> Abweichung vom Freigabe-Sketch: real_yield/macro_score waren dort als
> „forward-only" gelistet. Bei der Verifikation zeigte sich, dass kein
> Python-Produzent existiert → bewusst nach v2 verschoben statt zu raten.

## Datenmodell
Neue Tabelle, generalisiert `ml_weekly_rankings`:

```sql
create table if not exists factor_track (
  week_start date not null,
  factor text not null,          -- 'cot' | 'rates' | 'season' | 'ranking_baseline'
  ccy text not null,             -- G8
  horizon int not null,          -- 1 | 4
  score real,                    -- Faktor-Score der Woche (Vorzeichen = Richtung)
  direction text,                -- 'long' | 'short' | 'neutral'
  realized_return real,          -- fwd_ret_{h}w (nachgetragen bei Reife)
  hit boolean,                   -- (realized_return > 0) == (score > 0)
  source text not null,          -- 'seed' (Historie) | 'live' (forward)
  created_at timestamptz not null default now(),
  primary key (week_start, factor, ccy, horizon)
);
alter table factor_track enable row level security;  -- keine Policies → nur Service-Role
create index if not exists factor_track_factor_idx on factor_track (factor, horizon);
```

Insert-only wie `ml_weekly_rankings` — bestehende Zeilen werden nie überschrieben
(kein Repaint). Reife trägt nur `realized_return` + `hit` nach (UPDATE der NULL-Felder).

## Signal- & Hit-Semantik
- `direction`: `long` wenn `score > +ε`, `short` wenn `score < −ε`, sonst `neutral`
  (ε klein, z.B. 1e-9; `season_score = 0` bei inaktiver Saison → neutral).
- **Neutral-Zeilen zählen NICHT in die Trefferquote** (analog der Q2–Q4-Regel: nur Extrem-Richtung zählt).
- `hit = (realized_return > 0) == (score > 0)` — identisch zur `run_weekly`-Logik.
- Trefferquote je (factor, horizon, source) = hits / (n der gereiften, nicht-neutralen Zeilen).

## Jobs

### Seed-Job (`ml_engine/seed_factors.py`, einmalig, idempotent)
- `panel = build_feature_panel()` (volle Historie).
- Für jede Woche mit nicht-NaN `fwd_ret_{h}w` × Faktor × Währung × Horizont:
  Zeile mit `score`, `direction`, `realized_return`, `hit`, `source='seed'`.
- `insert_ignore` (kein Überschreiben; erneuter Lauf = 0 neue Zeilen).
- Roher Faktor-Sign-Hitrate — **kein purged-WF**. Label: „historisch, n effektiv
  klein" (überlappende 4W-Fenster + korrelierte Währungen → effektives n ≪ Zeilen),
  konsistent zur `fundamental_track`-Labeldisziplin (STATUS.md).

### Forward-Job (`ml_engine/run_factors.py`, samstags)
Eigenes Modul — **`run_weekly.py` bleibt unangetastet** (gerade erst gefixt).
- `week = next_week_start(today)`; `panel = build_feature_panel(end=week)`.
- Für jeden Faktor × Währung × Horizont: `score`/`direction` der Zielwoche schreiben
  (`source='live'`) via `insert_ignore`.
- Reife-Block (analog `run_weekly`): offene Live-Zeilen, deren `week_start + horizon`
  gereift ist, bekommen `realized_return` + `hit` nachgetragen (`mature_mask`).
- Abschluss-Checks + Exit-Semantik wie `run_weekly` (`check_run_result`-Muster:
  0 neue Zeilen + Zielwoche existiert → grün/INFO; sonst rot). Reuse, nicht kopieren.
- Trigger: eigener Step im bestehenden `ml-weekly.yml` **oder** separater Workflow,
  gleicher Cron (Sa 08:00 UTC). Entscheidung im Plan.

**Reuse:** `next_week_start`, `insert_ignore`, `mature_mask`, `check_run_result`
(ggf. nach `ml_engine/` gemeinsam nutzbar machen), `baseline_scores`, `panel.py`.

## UI — versteckter Tab
- Route `/ml/factor-lab`, Nav-Gruppe „Labor · versteckt".
- Server lädt aus `factor_track` je (factor, horizon, source) → Trefferquote + n.
- Tabelle: Faktor × Horizont → **Live-Hitrate + n** (oberste Instanz) neben
  **Historisch + n** (Kalibrier-Blick), nach Live-Hitrate sortiert, `ranking_baseline`
  hervorgehoben (schlägt die Kombi die Teile?).
- Ehrliche Labels: „Live = echter Forward-Beweis; Historisch = Kalibrier-Blick,
  n effektiv klein, nicht purged." Jede Prozentzahl mit n.
- Minimal, keine Interaktion außer Horizont-Umschalter.

## Risiken & Ehrlichkeit
- **Überlappende Fenster:** 4W-Returns überlappen wöchentlich + Währungen korrelieren
  → effektives n ≪ Zeilenzahl. Nie als Signifikanz verkaufen; Label + n sichtbar.
- **Seed ≠ Live:** Seed ist Rückblick (roher Sign-Hitrate). Nur die Live-Spalte ist
  der Beweis. Klar getrennt halten (`source`).
- **Kein Look-ahead:** `panel.py`-Features sind bereits streng „as of" (Release-Lags);
  die Zielwoche hat `fwd_ret = NaN` und wird erst bei Reife bewertet.

## Akzeptanzkriterien
- `factor_track` existiert (RLS an), Seed-Lauf füllt `cot/rates/season/ranking_baseline`
  × {1,4}W über die Historie; zweiter Seed-Lauf = 0 neue Zeilen.
- `run_factors.py` schreibt samstags die Zielwoche (`source='live'`) und trägt gereifte
  Zeilen nach; Insert-only, kein Repaint bestehender Zeilen.
- `/ml/factor-lab` zeigt je Faktor × Horizont Live- und Historisch-Hitrate + n,
  neutral ausgeschlossen, ehrlich gelabelt.
- `run_weekly.py` + `ml_weekly_rankings` unverändert; bestehende Tests grün.

## Offene Punkte (für den Plan)
1. Forward-Job als eigener Step in `ml-weekly.yml` vs. separater Workflow.
2. `check_run_result`/`next_week_start` gemeinsam nutzbar machen vs. leicht duplizieren.
3. Genauer ε-Wert / Neutral-Schwelle je Faktor (season = 0 ist der Hauptfall).
4. v2-Trigger: wann real_yield/macro_score einen Python-Wochen-Produzenten bekommen.
