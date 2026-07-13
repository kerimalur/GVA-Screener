"""Pipeline findet geplantete Edge; Rauschen bleibt bei ~0.5."""
import numpy as np
import pandas as pd

from ml_engine.evaluate import run_experiment_on_panel
from ml_engine.models import FEATURE_GROUPS


def _synth_panel(signal: bool, n_weeks: int = 700, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    weeks = pd.date_range("2008-01-07", periods=n_weeks, freq="W-MON")
    ccys = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"]
    rows = []
    for w in weeks:
        for c in ccys:
            feat = {col: rng.normal() for cols in FEATURE_GROUPS.values() for col in cols}
            drift = 0.6 * feat["rates_score"] if signal else 0.0
            ret = drift + rng.normal()
            rows.append({"week_start": w, "ccy": c, **feat,
                         "fwd_ret_4w": ret, "label_4w": ret > 0})
    return pd.DataFrame(rows)


CFG = {"algo": "lgbm", "horizon": 4, "features": ["rates", "scores"],
       "params": {"n_estimators": 120, "learning_rate": 0.08}, "seed": 42}


def test_planted_signal_wird_gefunden():
    metrics = run_experiment_on_panel(_synth_panel(signal=True), CFG)
    assert metrics["mean_auc"] > 0.62


def test_rauschen_bleibt_bei_50_prozent():
    metrics = run_experiment_on_panel(_synth_panel(signal=False), CFG)
    assert 0.45 < metrics["mean_auc"] < 0.55


def test_baseline_experiment_laeuft():
    cfg = {"algo": "baseline", "horizon": 4, "features": ["scores"], "params": {}, "seed": 0}
    metrics = run_experiment_on_panel(_synth_panel(signal=True), cfg)
    assert 0.0 <= metrics["mean_hitrate"] <= 1.0
    assert metrics["n_folds"] >= 3
