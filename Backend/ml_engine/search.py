"""Random-Search-Space. Bewusst v1: kein Optuna, erst Random ausreizen.

Seit 2026-07-19 zweigeteilt (Spec: docs/superpowers/specs/
2026-07-19-ml-engine-stabilisierung-design.md):
  - KERN-Raum (Default-Anteil 1 − ML_EXPLORE_FRAC): vorab festgelegte, zuletzt
    konsistent gewinnende Familie — logreg · 4W · Teilmengen von {rates, scores}.
  - EXPLORATION (ML_EXPLORE_FRAC, Default 0.2): der volle bisherige Raum,
    damit neue Faktoren (z.B. Real Yield) entdeckbar bleiben.
Das verengt nur, WO gesucht wird (weniger Auswahl-Rauschen) — es verbessert
das Signal selbst nicht. Grenzen per Env steuerbar, jede Config traegt
"space": "core"|"explore" als Metadatum.
"""
from __future__ import annotations

import os

import numpy as np

from .models import FEATURE_GROUPS

HORIZONS = [1, 2, 4]

# Kern-Defaults — festgelegt 2026-07-19 aus den Nacht-Siegern 13.–19.07.
# (4/7 logreg·4W·[rates,scores], 6/7 Horizont 4). Nicht nachtraeglich anpassen,
# ohne es in der Spec zu dokumentieren.
CORE_ALGOS_DEFAULT = "logreg"
CORE_HORIZONS_DEFAULT = "4"
CORE_FEATURE_GROUPS_DEFAULT = "rates,scores"
EXPLORE_FRAC_DEFAULT = 0.2


def _csv_env(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [x.strip() for x in raw.split(",") if x.strip()]


def core_space() -> dict:
    """Aktueller Kern-Suchraum aus der Env (validiert gegen die echten Gruppen)."""
    algos = [a for a in _csv_env("ML_CORE_ALGOS", CORE_ALGOS_DEFAULT) if a in ("lgbm", "logreg")]
    horizons = [int(h) for h in _csv_env("ML_CORE_HORIZONS", CORE_HORIZONS_DEFAULT)
                if h.isdigit() and int(h) in HORIZONS]
    groups = [g for g in _csv_env("ML_CORE_FEATURE_GROUPS", CORE_FEATURE_GROUPS_DEFAULT)
              if g in FEATURE_GROUPS]
    return {
        "algos": algos or ["logreg"],
        "horizons": horizons or [4],
        "groups": groups or ["rates", "scores"],
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
    return {"C": float(np.round(10 ** rng.uniform(-2, 2), 4))}


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
