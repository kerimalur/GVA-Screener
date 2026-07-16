"""Nightly-Runner: Budget-Loop über Experiment-Queue + Random-Search.

Holdout-Disziplin: die letzten HOLDOUT_WEEKS Wochen des Panels werden VOR
jeder Suche abgeschnitten — der Runner sieht sie nie.

  python -m ml_engine.run_experiments             # Budget aus ML_BUDGET_MIN (Default 50)
  python -m ml_engine.run_experiments --max 3     # fixe Anzahl (lokaler Smoke-Test)
"""
from __future__ import annotations

import argparse
import json
import os
import time
import traceback
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from macro_features.panel import build_feature_panel

from . import db
from .evaluate import run_experiment_on_panel
from .search import random_config

HOLDOUT_WEEKS = 104


def _jsonsafe(o):
    """NaN → None rekursiv — Postgres jsonb akzeptiert kein NaN-Literal."""
    if isinstance(o, dict):
        return {k: _jsonsafe(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_jsonsafe(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    return o


def _search_panel() -> pd.DataFrame:
    panel = build_feature_panel()
    last = panel["week_start"].max()
    cut = last - pd.Timedelta(weeks=HOLDOUT_WEEKS)
    return panel[panel["week_start"] < cut].reset_index(drop=True)


def _seed_baseline_experiments() -> None:
    """Experiment #0 (Baseline) je Horizont einmalig einreihen."""
    existing = [
        e for e in db.select_all("ml_experiments", {"select": "id,config"})
        if (e["config"] if isinstance(e["config"], dict) else json.loads(e["config"]))["algo"] == "baseline"
    ]
    if existing:
        return
    for h in [1, 2, 4]:
        db.insert("ml_experiments", {
            "status": "queued",
            "config": {"algo": "baseline", "horizon": h, "features": ["scores"],
                       "params": {}, "seed": 0},
            "seed": 0,
        })


def _claim_next(rng: np.random.Generator) -> dict:
    queued = db.select_all("ml_experiments", {
        "select": "id,config,seed", "status": "eq.queued",
        "order": "id.asc", "limit": 1,
    })
    if queued:
        exp = queued[0]
        db.update("ml_experiments", {"id": f"eq.{exp['id']}"}, {"status": "running"})
        return exp
    cfg = random_config(rng)
    db.insert("ml_experiments", {"status": "running", "config": cfg, "seed": cfg["seed"]})
    return db.select_all("ml_experiments", {
        "select": "id,config,seed", "status": "eq.running",
        "order": "id.desc", "limit": 1,
    })[0]


def _write_night_summary() -> None:
    """Nacht-Zusammenfassung dauerhaft nach ml_engine_nights (idempotent:
    upsert nur auf die EIGENE Nacht — ältere Nächte bleiben unberührt)."""
    night = datetime.now(timezone.utc).date().isoformat()
    rows = db.select_all("ml_experiments", {
        "select": "status,hall_score,runtime_s,config",
        "created_at": f"gte.{night}T00:00:00Z",
    })
    if not rows:
        return
    best_hall, best_config = None, None
    done = failed = 0
    runtime_s = 0.0
    for r in rows:
        runtime_s += r["runtime_s"] or 0
        if r["status"] == "done":
            done += 1
            if r["hall_score"] is not None and (best_hall is None or r["hall_score"] > best_hall):
                best_hall = r["hall_score"]
                best_config = r["config"] if isinstance(r["config"], dict) else json.loads(r["config"])
        elif r["status"] == "failed":
            failed += 1
    db.insert("ml_engine_nights", {
        "night": night,
        "done": done,
        "failed": failed,
        "best_hall": best_hall,
        "best_config": best_config,
        "runtime_min": round(runtime_s / 60, 1),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, upsert_on="night")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=None, help="max. Experimente (Smoke-Test)")
    args = ap.parse_args()

    budget_s = float(os.getenv("ML_BUDGET_MIN", "50")) * 60
    git_sha = os.getenv("GITHUB_SHA", "local")[:12]
    rng = np.random.default_rng()

    t0 = time.time()
    panel = _search_panel()
    print(f"Such-Panel: {len(panel)} Zeilen, Wochen bis {panel['week_start'].max().date()} "
          f"(Holdout {HOLDOUT_WEEKS}W abgeschnitten), Aufbau {time.time() - t0:.0f}s")
    _seed_baseline_experiments()

    done = 0
    while time.time() - t0 < budget_s and (args.max is None or done < args.max):
        exp = _claim_next(rng)
        cfg = exp["config"] if isinstance(exp["config"], dict) else json.loads(exp["config"])
        t1 = time.time()
        try:
            metrics = run_experiment_on_panel(panel, cfg)
            hall = metrics["hall_score"]
            db.update("ml_experiments", {"id": f"eq.{exp['id']}"}, {
                "status": "done",
                "metrics": _jsonsafe(metrics),
                "hall_score": None if hall is None or np.isnan(hall) else float(hall),
                "git_sha": git_sha,
                "runtime_s": round(time.time() - t1, 1),
            })
            hall_txt = f"{hall:.3f}" if hall is not None and not np.isnan(hall) else "nan"
            print(f"#{exp['id']} {cfg['algo']} h={cfg['horizon']} {cfg['features']} "
                  f"→ hit {metrics['mean_hitrate']:.3f} hall {hall_txt}")
        except Exception:
            db.update("ml_experiments", {"id": f"eq.{exp['id']}"}, {
                "status": "failed", "error": traceback.format_exc()[-1500:],
                "git_sha": git_sha, "runtime_s": round(time.time() - t1, 1),
            })
            print(f"#{exp['id']} FAILED")
        done += 1
    print(f"Fertig: {done} Experimente in {(time.time() - t0) / 60:.1f} min")

    try:
        _write_night_summary()
        print("Nacht-Zusammenfassung → ml_engine_nights geschrieben.")
    except Exception:
        # Zusammenfassung darf den Lauf nicht scheitern lassen — die Live-View
        # ml_engine_nights_live deckt die Nacht notfalls ab.
        print(f"WARNUNG: Nacht-Zusammenfassung fehlgeschlagen:\n{traceback.format_exc()[-800:]}")


if __name__ == "__main__":
    main()
