"""Experiment-Auswertung: Purged Walk-Forward → Fold-Metriken → hall_score.

KANONISCHE ZIELGRÖSSE des Projekts (siehe STATUS.md „Kanonische Zielgrösse &
Vokabular"): demeaned Korb-Log-Returns (panel.py:84-85). mean_hitrate/hall_score
hier sind DIE Referenz für Aussagen über Ranking-/Signal-Qualität. Rohe
Pair-Renditen (Ranking-View / fundamental_track) sind ein anderes, nicht
kanonisches Mass und im UI als „Kalibrier-Blick" gekennzeichnet.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

from .baseline import baseline_scores
from .models import design_matrix, make_model, predict_scores
from .splits import purged_walk_forward


def _fold_metrics(scores: np.ndarray, labels: pd.Series, rets: pd.Series) -> dict:
    mask = labels.notna() & pd.Series(scores, index=labels.index).ne(0.0)
    y = labels[mask].astype(bool).to_numpy()
    s = np.asarray(scores)[mask.to_numpy()]
    if len(y) == 0:
        return {"hitrate": np.nan, "auc": np.nan, "n": 0}
    hit = float(((s > 0) == y).mean())
    auc = float(roc_auc_score(y, s)) if 0 < y.sum() < len(y) else np.nan
    return {"hitrate": hit, "auc": auc, "n": int(len(y))}


def score_fold(
    data: pd.DataFrame, config: dict, train_weeks: pd.Series, test_weeks: pd.Series
) -> dict:
    """Ein Fold: auf `train_weeks` fitten, `test_weeks` scoren → Fold-Metriken.

    Einzige Trainings-/Vorhersage-Stelle des Projekts. Suche
    (`run_experiment_on_panel`) und Holdout-Validierung (`holdout.py`) rufen
    beide hier hinein — damit sind die Zahlen per Konstruktion vergleichbar,
    es gibt keine zweite Implementierung, die auseinanderlaufen könnte.
    """
    h = config["horizon"]
    label_col, ret_col = f"label_{h}w", f"fwd_ret_{h}w"
    tr = data[data["week_start"].isin(train_weeks)]
    te = data[data["week_start"].isin(test_weeks)]
    if config["algo"] == "baseline":
        scores = baseline_scores(te)
    else:
        X_tr = design_matrix(tr, config["features"])
        X_te = design_matrix(te, config["features"])
        model = make_model(config["algo"], config.get("params", {}), config.get("seed", 42))
        model.fit(X_tr, tr[label_col].astype(bool))
        scores = predict_scores(model, config["algo"], X_te)
    return _fold_metrics(scores, te[label_col], te[ret_col])


def run_experiment_on_panel(panel: pd.DataFrame, config: dict) -> dict:
    """OOS-Metriken eines Experiments (Panel OHNE Holdout übergeben!)."""
    h = config["horizon"]
    label_col = f"label_{h}w"
    data = panel[panel[label_col].notna()].reset_index(drop=True)
    folds = purged_walk_forward(data["week_start"], horizon=h)

    fold_rows = [score_fold(data, config, tr_w, te_w) for tr_w, te_w in folds]

    hits = [f["hitrate"] for f in fold_rows if not np.isnan(f["hitrate"])]
    aucs = [f["auc"] for f in fold_rows if not np.isnan(f["auc"])]
    mean_hit = float(np.mean(hits)) if hits else np.nan
    std_hit = float(np.std(hits)) if hits else np.nan
    return {
        "folds": fold_rows,
        "n_folds": len(fold_rows),
        "mean_hitrate": mean_hit,
        "std_hitrate": std_hit,
        "mean_auc": float(np.mean(aucs)) if aucs else np.nan,
        "hall_score": mean_hit - std_hit if hits else np.nan,
    }
