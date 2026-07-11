"""Inference: aktives Modell laden (Cache), aktuelle Features bauen, Prediction.

Confidence-Schwellen: probability ≥ 0.58 high, ≥ 0.54 medium, sonst low.
"""
from __future__ import annotations

import io
import threading

import joblib
import pandas as pd

from . import db, features

# Perzentil 5y braucht 260 Wochen Historie + Puffer
FEATURE_WEEKS = 340

_CACHE: dict = {"models": {}, "features": None, "features_week": None}
_LOCK = threading.Lock()


def _load_active_model(horizon: int):
    rows = db.select_all(
        "ml_models",
        {
            "select": "id,horizon,model_blob,feature_names,created_at",
            "horizon": f"eq.{horizon}",
            "is_active": "eq.true",
            "order": "created_at.desc",
            "limit": 1,
        },
    )
    if not rows:
        return None
    row = rows[0]
    blob = row["model_blob"]
    raw = bytes.fromhex(blob[2:] if blob.startswith("\\x") else blob)
    model = joblib.load(io.BytesIO(raw))
    return {"id": row["id"], "model": model, "feature_names": row["feature_names"]}


def get_model(horizon: int, refresh: bool = False):
    with _LOCK:
        if refresh or horizon not in _CACHE["models"]:
            _CACHE["models"][horizon] = _load_active_model(horizon)
        return _CACHE["models"][horizon]


def invalidate_model_cache() -> None:
    with _LOCK:
        _CACHE["models"] = {}
        _CACHE["features"] = None


def _current_features() -> pd.DataFrame:
    """Feature-Zeilen der aktuellen Woche (einmal pro Woche gecacht)."""
    current_week = features.mondays(1, include_current=True)[-1]
    with _LOCK:
        if _CACHE["features"] is not None and _CACHE["features_week"] == current_week:
            return _CACHE["features"]
    df = features.build_dataset(weeks=FEATURE_WEEKS, include_current=True, with_targets=False)
    now = df[df["week_start"] == current_week].reset_index(drop=True)
    with _LOCK:
        _CACHE["features"] = now
        _CACHE["features_week"] = current_week
    return now


def _confidence(prob: float) -> str:
    if prob >= 0.58:
        return "high"
    if prob >= 0.54:
        return "medium"
    return "low"


def predict_pair(pair: str, horizon: int) -> dict:
    entry = get_model(horizon)
    if entry is None:
        return {"error": f"kein aktives Modell für Horizont {horizon} — erst /ml/train ausführen"}
    now = _current_features()
    row = now[now["instrument"] == pair]
    if row.empty:
        return {"error": f"keine aktuellen Features für {pair}"}
    p_long = float(entry["model"].predict_proba(row[entry["feature_names"]])[:, 1][0])
    direction = "LONG" if p_long >= 0.5 else "SHORT"
    prob = p_long if direction == "LONG" else 1.0 - p_long
    return {
        "pair": pair,
        "horizon": horizon,
        "week_start": str(row.iloc[0]["week_start"]),
        "direction": direction,
        "probability": round(prob, 4),
        "confidence": _confidence(prob),
    }


def predict_all(horizon: int, persist: bool = True) -> list[dict]:
    entry = get_model(horizon)
    if entry is None:
        return [{"error": f"kein aktives Modell für Horizont {horizon} — erst /ml/train ausführen"}]
    now = _current_features()
    if now.empty:
        return [{"error": "keine aktuellen Features"}]

    probs = entry["model"].predict_proba(now[entry["feature_names"]])[:, 1]
    out = []
    rows_to_persist = []
    for i, (_, r) in enumerate(now.iterrows()):
        p_long = float(probs[i])
        direction = "LONG" if p_long >= 0.5 else "SHORT"
        prob = p_long if direction == "LONG" else 1.0 - p_long
        item = {
            "pair": r["instrument"],
            "horizon": horizon,
            "week_start": str(r["week_start"]),
            "direction": direction,
            "probability": round(prob, 4),
            "confidence": _confidence(prob),
        }
        out.append(item)
        rows_to_persist.append(
            {
                "model_id": entry["id"],
                "instrument": r["instrument"],
                "horizon": horizon,
                "direction": direction,
                "probability": round(prob, 4),
                "week_start": str(r["week_start"]),
            }
        )
    if persist:
        try:
            db.insert("ml_predictions", rows_to_persist, upsert_on="model_id,instrument,week_start,horizon")
        except Exception as e:
            print(f"ml_predictions persist fehlgeschlagen: {e}")
    return sorted(out, key=lambda x: -x["probability"])


def model_report(horizon: int) -> dict:
    rows = db.select_all(
        "ml_models",
        {
            "select": "id,horizon,created_at,metrics,config",
            "horizon": f"eq.{horizon}",
            "is_active": "eq.true",
            "order": "created_at.desc",
            "limit": 1,
        },
    )
    if not rows:
        return {"error": f"kein aktives Modell für Horizont {horizon}"}
    return rows[0]
