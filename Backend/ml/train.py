"""LightGBM-Training mit strikter Walk-Forward-Validation.

Kein Datenpunkt aus der Zukunft im Training: Folds sind rein temporal
(Training-Fenster 156 Wochen, Test 52, Step 26). Alle Pairs bleiben im selben
Fold (korrelierte Pairs → Pair-Split wäre Leakage). Grid-Search optimiert
Ø OOS-AUC über die Folds, nie In-Sample.
"""
from __future__ import annotations

import base64
import datetime as dt
import io
import itertools

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import roc_auc_score

from . import db, features

TRAIN_WEEKS = 156
TEST_WEEKS = 52
STEP_WEEKS = 26

# Konservatives Grid (Overfitting vermeiden, Laufzeit im Rahmen halten)
GRID = {
    "n_estimators": [150, 300],
    "max_depth": [3, 4],
    "learning_rate": [0.05],
    "min_child_samples": [80],
    "subsample": [0.8],
    "colsample_bytree": [0.8],
    "reg_alpha": [0.5],
    "reg_lambda": [0.5],
}

BASE_PARAMS = dict(
    objective="binary",
    subsample_freq=1,
    n_jobs=-1,
    verbosity=-1,
    random_state=42,
)


def _grid_configs() -> list[dict]:
    keys = list(GRID.keys())
    return [dict(zip(keys, combo)) for combo in itertools.product(*GRID.values())]


def _folds(week_index: pd.Series) -> list[tuple[np.ndarray, np.ndarray]]:
    """Temporal strikte (train_mask, test_mask)-Paare über den Wochen-Index."""
    weeks = np.sort(week_index.unique())
    out = []
    start = 0
    while start + TRAIN_WEEKS + TEST_WEEKS <= len(weeks):
        train_weeks = set(weeks[start : start + TRAIN_WEEKS])
        test_weeks = set(weeks[start + TRAIN_WEEKS : start + TRAIN_WEEKS + TEST_WEEKS])
        out.append(
            (week_index.isin(train_weeks).to_numpy(), week_index.isin(test_weeks).to_numpy())
        )
        start += STEP_WEEKS
    return out


def _calibration(y_true: np.ndarray, y_prob: np.ndarray) -> list[dict]:
    """Vorhergesagte vs. tatsächliche LONG-Rate in Probability-Buckets."""
    edges = np.arange(0.30, 0.72, 0.04)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (y_prob >= lo) & (y_prob < hi)
        if mask.sum() < 20:
            continue
        out.append(
            {
                "bucket": round(float((lo + hi) / 2), 3),
                "predicted": round(float(y_prob[mask].mean()), 4),
                "actual": round(float(y_true[mask].mean()), 4),
                "n": int(mask.sum()),
            }
        )
    return out


def walk_forward(df: pd.DataFrame, horizon: int, params: dict) -> dict:
    """Walk-Forward über alle Folds → OOS-Metriken (nichts In-Sample)."""
    target = f"direction_{horizon}w"
    feat_cols = features.feature_names()
    data = df.dropna(subset=[target])
    week_idx = data["week_start"]

    fold_details = []
    all_true: list[np.ndarray] = []
    all_prob: list[np.ndarray] = []

    for fi, (tr_mask, te_mask) in enumerate(_folds(week_idx)):
        X_tr, y_tr = data.loc[tr_mask, feat_cols], data.loc[tr_mask, target].astype(int)
        X_te, y_te = data.loc[te_mask, feat_cols], data.loc[te_mask, target].astype(int)
        if len(X_te) < 100 or y_tr.nunique() < 2:
            continue
        model = LGBMClassifier(**BASE_PARAMS, **params)
        model.fit(X_tr, y_tr)
        prob = model.predict_proba(X_te)[:, 1]
        pred = (prob >= 0.5).astype(int)
        acc = float((pred == y_te.to_numpy()).mean())
        try:
            auc = float(roc_auc_score(y_te, prob))
        except ValueError:
            auc = 0.5
        # High-Confidence-Winrate: beide Seiten ab 0.58
        conf_mask = (prob >= 0.58) | (prob <= 0.42)
        conf_wr = (
            float((pred[conf_mask] == y_te.to_numpy()[conf_mask]).mean())
            if conf_mask.sum() >= 20
            else None
        )
        fold_details.append(
            {
                "fold": fi,
                "test_from": str(data.loc[te_mask, "week_start"].min()),
                "test_to": str(data.loc[te_mask, "week_start"].max()),
                "n": int(len(X_te)),
                "oos_acc": round(acc, 4),
                "oos_auc": round(auc, 4),
                "high_conf_wr": round(conf_wr, 4) if conf_wr is not None else None,
                "high_conf_n": int(conf_mask.sum()),
            }
        )
        all_true.append(y_te.to_numpy())
        all_prob.append(prob)

    if not fold_details:
        return {"error": "keine gültigen Folds", "folds": 0}

    yt = np.concatenate(all_true)
    yp = np.concatenate(all_prob)
    preds = (yp >= 0.5).astype(int)
    conf_mask = (yp >= 0.58) | (yp <= 0.42)
    return {
        "folds": len(fold_details),
        "oos_n": int(len(yt)),
        "oos_acc": round(float((preds == yt).mean()), 4),
        "oos_auc": round(float(roc_auc_score(yt, yp)), 4),
        "oos_high_conf_wr": round(float((preds[conf_mask] == yt[conf_mask]).mean()), 4)
        if conf_mask.sum() >= 20
        else None,
        "oos_high_conf_n": int(conf_mask.sum()),
        "fold_details": fold_details,
        "calibration": _calibration(yt, yp),
    }


def train_horizon(df: pd.DataFrame, horizon: int) -> dict:
    """Grid-Search (Ø OOS-AUC) → Walk-Forward-Report → finales Modell auf voller Historie."""
    target = f"direction_{horizon}w"
    feat_cols = features.feature_names()

    best_params, best_auc, best_report = None, -1.0, None
    for params in _grid_configs():
        report = walk_forward(df, horizon, params)
        auc = report.get("oos_auc", 0)
        if report.get("folds", 0) > 0 and auc > best_auc:
            best_params, best_auc, best_report = params, auc, report

    if best_params is None:
        return {"error": "Training fehlgeschlagen — keine gültigen Folds"}

    data = df.dropna(subset=[target])
    model = LGBMClassifier(**BASE_PARAMS, **best_params)
    model.fit(data[feat_cols], data[target].astype(int))

    importance = sorted(
        zip(feat_cols, model.booster_.feature_importance(importance_type="gain")),
        key=lambda x: -x[1],
    )
    total_gain = sum(g for _, g in importance) or 1

    buf = io.BytesIO()
    joblib.dump(model, buf)
    blob_hex = "\\x" + buf.getvalue().hex()

    metrics = {
        **best_report,
        "feature_importance": [
            {"feature": f, "gain_pct": round(float(g) / total_gain * 100, 2)}
            for f, g in importance
        ],
        "trained_rows": int(len(data)),
    }
    config = {
        **best_params,
        "train_weeks": TRAIN_WEEKS,
        "test_weeks": TEST_WEEKS,
        "step_weeks": STEP_WEEKS,
        "trained_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }

    # Alte Modelle dieses Horizonts deaktivieren, neues speichern
    db.update("ml_models", {"horizon": f"eq.{horizon}", "is_active": "eq.true"}, {"is_active": False})
    db.insert(
        "ml_models",
        {
            "horizon": horizon,
            "model_blob": blob_hex,
            "feature_names": feat_cols,
            "metrics": metrics,
            "config": config,
            "is_active": True,
        },
    )
    return {"horizon": horizon, "best_params": best_params, **{k: v for k, v in metrics.items() if k != "fold_details" and k != "calibration" and k != "feature_importance"}}


def train_all(weeks: int = 900, progress: dict | None = None) -> dict:
    """Alle 4 Horizonte trainieren. `progress` (dict) wird live aktualisiert."""
    if progress is not None:
        progress["stage"] = "features"
    df = features.build_dataset(weeks=weeks, with_targets=True)
    if progress is not None:
        progress["dataset_rows"] = int(len(df))

    results = {}
    for h in features.HORIZONS:
        if progress is not None:
            progress["stage"] = f"training_{h}w"
        results[f"{h}w"] = train_horizon(df, h)
    return results
