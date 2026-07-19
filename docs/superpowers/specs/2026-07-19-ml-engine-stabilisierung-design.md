# ML-Engine: Suche stabilisieren + Trefferquote transparent (2026-07-19)

## Problem

1. `random_config()` (search.py) zieht komplett zufällige Configs. Der «Beste der
   Nacht» ist ein roher `max(hall_score)` über ~1200 Experimente — bei schwachem
   Signal springt er jede Nacht auf einen anderen Modelltyp/Feature-Satz
   (belegt: Nächte 13.–19.07. wechseln lgbm·4W·[scores] ↔ logreg·4W·[rates,scores]
   ↔ lgbm·1W·[cot_core,rates]).
2. `hall_score = mean_hitrate − std_hitrate` (evaluate.py) ist bereits
   konsistenz-adjustiert. Im Engine-Log ist nicht unterscheidbar, ob ~0.51
   «keine Edge» (mean ≈ 0.51) oder «instabile Edge» (mean ≈ 0.57, hohe std) ist.

**Nicht-Ziel:** Die Stabilisierung reduziert Auswahl-Rauschen. Sie verbessert
das Signal NICHT — ein stabiler 0.51 bleibt ein Münzwurf.

**Unantastbar:** Holdout-Disziplin (HOLDOUT_WEEKS-Cut in run_experiments,
promote.py als einziger Holdout-Zugriff, Protokoll ml_holdout_access).

## Kern-Suchraum (vorab festgelegt, 2026-07-19)

Basis: die 7 dokumentierten Nächte in `ml_engine_nights` (13.–19.07.).
Nacht-Sieger: 4/7 = logreg · 4W · [rates,scores]; 6/7 Nächte Horizont 4;
Sieger-Features stets aus der Familie {rates, scores} (Ausnahme 18.07.,
lgbm·1W·cot_core+rates, best_hall 0.511 — kein Ausreisser nach oben).

Daraus fixiert (VOR der Implementation, kein nachträgliches Cherry-Picking):

| Env-Variable | Default | Bedeutung |
|---|---|---|
| `ML_CORE_ALGOS` | `logreg` | Algo-Auswahl im Kern-Raum (CSV) |
| `ML_CORE_HORIZONS` | `4` | Horizont-Auswahl im Kern-Raum (CSV) |
| `ML_CORE_FEATURE_GROUPS` | `rates,scores` | Feature-Pool; Draw = nicht-leere Teilmenge |
| `ML_EXPLORE_FRAC` | `0.2` | Anteil der Draws aus dem VOLLEN Raum (Exploration — neue Faktoren wie Real Yield bleiben entdeckbar) |

Jede gezogene Config trägt `"space": "core" | "explore"` (nur Metadatum im
config-jsonb, ändert keine Auswertung).

## Seed-Robustheit

Nach dem Budget-Loop: die Top-`ML_TOPK_RESEED` (Default 5) verschiedenen
Configs der Nacht (ohne Baseline, Identität = Config ohne Seed) werden mit
`ML_SEED_REPEATS − 1` (Default: 3−1 = 2) zusätzlichen Seeds erneut ausgewertet
(normale ml_experiments-Zeilen). Zeitdeckel `ML_RESEED_BUDGET_S` (Default 300 s).
Robust-Score einer Config = Mittel der hall_scores ihrer Läufe. Der
Hysterese-Kandidat der Nacht ist die Config mit dem besten Robust-Score unter
den Configs mit ≥2 Läufen (Fallback: roher Nacht-Bester) — nicht der einzelne
Glückslauf.

## Hysterese («stabiler Bester»)

Modell-Familie = `(algo, horizon, sorted(features))` — Params/Seed zählen für
die stabile Linie nicht. Regeln in `ml_engine/stability.py` (pure functions):

- Keine bisherige stabile Familie → Initialisierung mit dem Nacht-Kandidaten.
- Kandidat == stabile Familie → bleibt.
- Wechsel NUR wenn in den letzten `ML_STABLE_NIGHTS` (Default 3) Nächten
  (inkl. heute) jeweils: Nacht-Kandidat = dieselbe Herausforderer-Familie UND
  deren Score ≥ Score der stabilen Familie jener Nacht + `ML_STABLE_MARGIN`
  (Default 0.005). Alte Nächte ohne `stable_score` erfüllen die Bedingung nicht
  (kein Wechsel auf dünner Datenlage).

Pro Nacht persistiert: `stable_config` (bester voller Config der stabilen
Familie dieser Nacht; sonst Vortrags-Config), `stable_score` (bester hall_score
der stabilen Familie heute Nacht, sonst NULL). `best_hall`/`best_config`
bleiben der ROHE Nacht-Bestwert (unverändert angezeigt).

## Schema (additiv) + View

```sql
alter table ml_engine_nights
  add column mean_hitrate real,
  add column std_hitrate  real,
  add column stable_config jsonb,
  add column stable_score real;
```

`mean_hitrate`/`std_hitrate` = Metriken des ROHEN besten Experiments der Nacht
(stehen schon in ml_experiments.metrics, werden nur durchgereicht).
View `ml_engine_nights_live`: zusätzlich mean/std des besten Experiments
(Spalten hinten angehängt, CREATE OR REPLACE, security_invoker bleibt).
Die stable_*-Spalten kann die View nicht liefern (Hysterese ist zustandsbehaftet)
→ nur Tabelle; Frontend zeigt «–», solange die Nacht läuft. Alte Nächte ohne
neue Felder → «–».

## Engine-Log (Frontend)

- `engineLog.ts`: neue Felder durchreichen; beim Merge Archiv↔Live-View bleibt
  stable_* aus der Tabelle erhalten (Live-View kennt sie nicht).
- Tabelle: Spalten «Hit Ø±σ» (mean_hitrate ± std_hitrate) und «Stabiles Modell».
- Verlauf: bestHall (roh, wie bisher) + stable_score (stabile Linie) +
  mean_hitrate (gestrichelt).
- Explainer ergänzt: hall = mean − std; hohe σ = instabile Edge; die stabile
  Linie wechselt nur bei Marge über mehrere Nächte; Stabilisierung reduziert
  Rauschen, verbessert nicht das Signal.

## Tests

- Suchraum: Kern-Modus zieht nur erlaubte Algos/Horizonte/Feature-Teilmengen;
  `ML_EXPLORE_FRAC=0` → ausschliesslich Kern; Explore-Draws sind markiert.
- Hysterese: kein Wechsel unter Marge; kein Wechsel bei Streak < N Nächte;
  Wechsel bei erfüllter Marge über N Nächte; Init; gleiche Familie bleibt.
- Runner: mean/std_hitrate + stable_* landen in der Nacht-Zusammenfassung
  (FakeDB); bestehende Runner-Tests bleiben grün.
