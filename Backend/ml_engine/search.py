"""Random-Search-Space. Bewusst v1: kein Optuna, erst Random ausreizen."""
from __future__ import annotations

import numpy as np

from .models import FEATURE_GROUPS

HORIZONS = [1, 2, 4]


def random_config(rng: np.random.Generator) -> dict:
    algo = rng.choice(["lgbm", "lgbm", "logreg"])  # lgbm 2:1 gewichtet
    groups = list(FEATURE_GROUPS)
    k = int(rng.integers(1, len(groups) + 1))
    features = sorted(rng.choice(groups, size=k, replace=False).tolist())
    if algo == "lgbm":
        params = {
            "n_estimators": int(rng.integers(100, 500)),
            "learning_rate": float(np.round(10 ** rng.uniform(-2, -0.7), 4)),
            "num_leaves": int(rng.integers(7, 64)),
            "min_child_samples": int(rng.integers(20, 200)),
            "feature_fraction": float(np.round(rng.uniform(0.5, 1.0), 2)),
            "bagging_fraction": float(np.round(rng.uniform(0.5, 1.0), 2)),
            "bagging_freq": 1,
        }
    else:
        params = {"C": float(np.round(10 ** rng.uniform(-2, 2), 4))}
    return {
        "algo": str(algo),
        "horizon": int(rng.choice(HORIZONS)),
        "features": features,
        "params": params,
        "seed": int(rng.integers(0, 2**31)),
    }
