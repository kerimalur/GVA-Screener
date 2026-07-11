"""FastAPI-Routen fürs ML-Modul. Registrierung in main.py:

    from ml.routes import ml_router
    app.include_router(ml_router, prefix="/ml")

Training läuft im Background-Thread (Render Free Tier: ein Training gleichzeitig).
Optionaler Schreibschutz: Env ML_TRAIN_KEY gesetzt → POST /ml/train verlangt
Header X-ML-KEY. Ohne Env bleibt der Endpoint offen (privates Tool).
"""
from __future__ import annotations

import os
import threading

from fastapi import APIRouter, Header, HTTPException, Query

from . import predict as predict_mod
from . import train as train_mod

ml_router = APIRouter()

TRAIN_STATUS: dict = {"state": "idle"}  # idle | running | done | error
_TRAIN_LOCK = threading.Lock()


def _run_training(weeks: int) -> None:
    try:
        results = train_mod.train_all(weeks=weeks, progress=TRAIN_STATUS)
        TRAIN_STATUS.update({"state": "done", "results": results})
        predict_mod.invalidate_model_cache()
    except Exception as e:  # noqa: BLE001 — Status muss den Fehler zeigen
        TRAIN_STATUS.update({"state": "error", "error": str(e)})


@ml_router.post("/train")
def start_training(
    weeks: int = Query(900, ge=200, le=1000),
    x_ml_key: str | None = Header(default=None),
):
    required = os.getenv("ML_TRAIN_KEY")
    if required and x_ml_key != required:
        raise HTTPException(status_code=401, detail="X-ML-KEY fehlt oder falsch")
    with _TRAIN_LOCK:
        if TRAIN_STATUS.get("state") == "running":
            return {"status": "already_running", **TRAIN_STATUS}
        TRAIN_STATUS.clear()
        TRAIN_STATUS.update({"state": "running", "stage": "starting", "weeks": weeks})
        threading.Thread(target=_run_training, args=(weeks,), daemon=True).start()
    return {"status": "started", "weeks": weeks}


@ml_router.get("/status")
def training_status():
    return TRAIN_STATUS


@ml_router.get("/predict")
def predict_one(pair: str = Query(...), horizon: int = Query(2, ge=1, le=4)):
    try:
        result = predict_mod.predict_pair(pair.upper().replace("/", "_"), horizon)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@ml_router.get("/predict-all")
def predict_all(horizon: int = Query(2, ge=1, le=4)):
    try:
        results = predict_mod.predict_all(horizon)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if results and "error" in results[0]:
        raise HTTPException(status_code=404, detail=results[0]["error"])
    return {"horizon": horizon, "predictions": results}


@ml_router.get("/report")
def report(horizon: int = Query(2, ge=1, le=4)):
    try:
        result = predict_mod.model_report(horizon)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    metrics = result.get("metrics", {})
    return {
        "model_id": result["id"],
        "horizon": result["horizon"],
        "created_at": result["created_at"],
        "config": result.get("config", {}),
        "summary": {
            k: metrics.get(k)
            for k in ("folds", "oos_n", "oos_acc", "oos_auc", "oos_high_conf_wr", "oos_high_conf_n")
        },
        "fold_details": metrics.get("fold_details", []),
        "calibration": metrics.get("calibration", []),
        "feature_importance": metrics.get("feature_importance", [])[:15],
    }


@ml_router.get("/feature-importance")
def feature_importance(horizon: int = Query(2, ge=1, le=4)):
    try:
        result = predict_mod.model_report(horizon)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {
        "horizon": horizon,
        "feature_importance": result.get("metrics", {}).get("feature_importance", []),
    }
