"""Random-Search-Space. Bewusst v1: kein Optuna, erst Random ausreizen.

Zweigeteilt seit 2026-07-19 (Spec: docs/superpowers/specs/
2026-07-19-ml-engine-stabilisierung-design.md):
  - KERN-Raum (Anteil 1 − ML_EXPLORE_FRAC): die Familie, die zuletzt
    konsistent gewonnen hat.
  - EXPLORATION (ML_EXPLORE_FRAC): der volle Raum, damit neue Faktoren
    entdeckbar bleiben.
Jede Config traegt "space": "core"|"explore" als Metadatum.

=================== ERWEITERUNG 2026-08-14 ===================

WARUM. Die Suche stand ueber sechs Naechte und ~14.000 Experimente auf
demselben Ergebnis. Das war kein Fehler, sondern Arithmetik:

  Kern-Raum = {logreg} x {4W} x Teilmengen von {rates, scores}
            = 1 x 1 x 3 = DREI Feature-Kombinationen.

logreg ist bei gegebenem C deterministisch. Vier Fuenftel aller Ziehungen
landeten also in einem Raum mit drei echten Freiheitsgraden — dieselbe Nacht,
tausendfach wiederholt. Mehr Laeufe haetten daran nichts geaendert; sie
haetten dieselbe Zahl nur oefter gefunden.

WAS SICH AENDERT.
  * Kern umfasst beide Algorithmen und die Horizonte 2 und 4 statt nur 4.
    lgbm ist nicht deterministisch — allein das bringt echte Streuung.
  * Kern-Feature-Gruppen von {rates, scores} auf {rates, scores, season,
    cot_tff} erweitert: 15 statt 3 Teilmengen.
  * Explorationsanteil von 20 auf 40 Prozent. Ein auskonvergierter Kern
    verdient weniger Ziehungen, nicht mehr.
  * C-Bereich fuer logreg von 10^[-2,2] auf 10^[-3,3] gespreizt.

WAS SICH NICHT AENDERT. Die Holdout-Disziplin (`HOLDOUT_WEEKS` in
run_experiments.py), die Bewertung, die Baselines. Ein groesserer Suchraum
findet mehr Kandidaten UND mehr Zufallstreffer — die Trennung leistet
weiterhin allein der Holdout. Das Erweitern des Raums macht die Suche
lebendig, nicht ehrlicher; `selection_gap` wird dadurch eher groesser.
"""
from __future__ import annotations

import os

import numpy as np

from .models import FEATURE_GROUPS

HORIZONS = [1, 2, 4]

# Kern-Defaults — festgelegt 2026-07-19 aus den Nacht-Siegern 13.–19.07.
# (4/7 logreg·4W·[rates,scores], 6/7 Horizont 4). Nicht nachtraeglich anpassen,
# ohne es in der Spec zu dokumentieren.
CORE_ALGOS_DEFAULT = "logreg,lgbm"
CORE_HORIZONS_DEFAULT = "2,4"
CORE_FEATURE_GROUPS_DEFAULT = "rates,scores,season,cot_tff"
EXPLORE_FRAC_DEFAULT = 0.4


def _csv_env(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [x.strip() for x in raw.split(",") if x.strip()]


def _defaults() -> dict:
    """Die dokumentierten Defaults, bereits validiert."""
    return {
        "algos": [a for a in CORE_ALGOS_DEFAULT.split(",") if a in ("lgbm", "logreg")],
        "horizons": [int(h) for h in CORE_HORIZONS_DEFAULT.split(",") if int(h) in HORIZONS],
        "groups": [g for g in CORE_FEATURE_GROUPS_DEFAULT.split(",") if g in FEATURE_GROUPS],
    }


def core_space() -> dict:
    """Aktueller Kern-Suchraum aus der Env (validiert gegen die echten Gruppen).

    Bei unbrauchbarer Env wird auf die DOKUMENTIERTEN Defaults zurueckgefallen,
    nicht auf einen engeren Notraum.

    Frueher stand hier `algos or ["logreg"]` — ein Tippfehler in
    ML_CORE_ALGOS liess den Kern also still auf genau die Ein-Modell-Variante
    zusammenfallen, die im Juli 2026 die Suche zum Stillstand gebracht hat.
    Ein Fallback, der schlechter ist als der Default, ist kein Fallback,
    sondern eine Falle: Er greift lautlos und sieht im Log wie Absicht aus.
    """
    d = _defaults()
    algos = [a for a in _csv_env("ML_CORE_ALGOS", CORE_ALGOS_DEFAULT) if a in ("lgbm", "logreg")]
    horizons = [int(h) for h in _csv_env("ML_CORE_HORIZONS", CORE_HORIZONS_DEFAULT)
                if h.isdigit() and int(h) in HORIZONS]
    groups = [g for g in _csv_env("ML_CORE_FEATURE_GROUPS", CORE_FEATURE_GROUPS_DEFAULT)
              if g in FEATURE_GROUPS]
    return {
        "algos": algos or d["algos"],
        "horizons": horizons or d["horizons"],
        "groups": groups or d["groups"],
    }


def explore_frac() -> float:
    try:
        f = float(os.getenv("ML_EXPLORE_FRAC", str(EXPLORE_FRAC_DEFAULT)))
    except ValueError:
        f = EXPLORE_FRAC_DEFAULT
    return min(max(f, 0.0), 1.0)


def _params_for(algo: str, rng: np.random.Generator) -> dict:
    if algo == "lgbm":
        return {
            "n_estimators": int(rng.integers(100, 500)),
            "learning_rate": float(np.round(10 ** rng.uniform(-2, -0.7), 4)),
            "num_leaves": int(rng.integers(7, 64)),
            "min_child_samples": int(rng.integers(20, 200)),
            "feature_fraction": float(np.round(rng.uniform(0.5, 1.0), 2)),
            "bagging_fraction": float(np.round(rng.uniform(0.5, 1.0), 2)),
            "bagging_freq": 1,
        }
    # Weiter gespreizt als frueher (war -2..2): Am Rand des alten Bereichs
    # lag der Sieger auffaellig oft, was fast immer heisst, dass das Optimum
    # ausserhalb liegt.
    return {"C": float(np.round(10 ** rng.uniform(-3, 3), 4))}


def random_config(rng: np.random.Generator, core: bool | None = None) -> dict:
    """Eine zufaellige Config. core=None: Env-Anteil entscheidet (Default 80 %
    Kern / 20 % Exploration); core=True/False erzwingt den Raum (Tests)."""
    if core is None:
        core = bool(rng.random() >= explore_frac())

    if core:
        space = core_space()
        algo = str(rng.choice(space["algos"]))
        horizon = int(rng.choice(space["horizons"]))
        groups = space["groups"]
    else:
        algo = str(rng.choice(["lgbm", "lgbm", "logreg"]))  # lgbm 2:1 gewichtet
        horizon = int(rng.choice(HORIZONS))
        groups = list(FEATURE_GROUPS)

    k = int(rng.integers(1, len(groups) + 1))
    features = sorted(rng.choice(groups, size=k, replace=False).tolist())
    return {
        "algo": algo,
        "horizon": horizon,
        "features": features,
        "params": _params_for(algo, rng),
        "seed": int(rng.integers(0, 2**31)),
        "space": "core" if core else "explore",
    }
