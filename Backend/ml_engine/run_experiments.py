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
from .stability import best_of_family, decide_stable, family_key, robust_candidate

HOLDOUT_WEEKS = 104

# Seed-Robustheit (Spec 2026-07-19): Top-Configs der Nacht mit weiteren Seeds
# wiederholen, damit der Hysterese-Kandidat kein einzelner Glueckslauf ist.
TOPK_RESEED_DEFAULT = 5
SEED_REPEATS_DEFAULT = 3
RESEED_BUDGET_S_DEFAULT = 300.0


def _int_env(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


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


def _evaluate_and_store(exp_id: int, cfg: dict, panel: pd.DataFrame, git_sha: str) -> bool:
    """Ein Experiment auswerten + Ergebnis schreiben. True = done, False = failed."""
    t1 = time.time()
    try:
        metrics = run_experiment_on_panel(panel, cfg)
        hall = metrics["hall_score"]
        db.update("ml_experiments", {"id": f"eq.{exp_id}"}, {
            "status": "done",
            "metrics": _jsonsafe(metrics),
            "hall_score": None if hall is None or np.isnan(hall) else float(hall),
            "git_sha": git_sha,
            "runtime_s": round(time.time() - t1, 1),
        })
        hall_txt = f"{hall:.3f}" if hall is not None and not np.isnan(hall) else "nan"
        print(f"#{exp_id} {cfg['algo']} h={cfg['horizon']} {cfg['features']} "
              f"→ hit {metrics['mean_hitrate']:.3f} hall {hall_txt}")
        return True
    except Exception:
        db.update("ml_experiments", {"id": f"eq.{exp_id}"}, {
            "status": "failed", "error": traceback.format_exc()[-1500:],
            "git_sha": git_sha, "runtime_s": round(time.time() - t1, 1),
        })
        print(f"#{exp_id} FAILED")
        return False


def _tonight_done_rows(night: str) -> list[dict]:
    return [
        r for r in db.select_all("ml_experiments", {
            "select": "id,config,hall_score,metrics,status",
            "status": "eq.done",
            "created_at": f"gte.{night}T00:00:00Z",
        })
    ]


def _reseed_top_configs(panel: pd.DataFrame, rng: np.random.Generator, git_sha: str) -> None:
    """Top-K Configs der Nacht mit zusaetzlichen Seeds wiederholen (A3).

    Ziel: Robust-Score = Mittel ueber Seeds statt einzelner Glueckslauf.
    Zeitdeckel ML_RESEED_BUDGET_S — der GH-Workflow-Timeout bleibt sicher.
    """
    repeats = _int_env("ML_SEED_REPEATS", SEED_REPEATS_DEFAULT)
    topk = _int_env("ML_TOPK_RESEED", TOPK_RESEED_DEFAULT)
    budget_s = float(os.getenv("ML_RESEED_BUDGET_S", str(RESEED_BUDGET_S_DEFAULT)))
    if repeats <= 1 or topk == 0:
        return

    from .stability import config_id

    night = datetime.now(timezone.utc).date().isoformat()
    groups: dict[str, dict] = {}
    for r in _tonight_done_rows(night):
        cfg = r["config"] if isinstance(r["config"], dict) else json.loads(r["config"])
        if cfg.get("algo") == "baseline" or r.get("hall_score") is None:
            continue
        g = groups.setdefault(config_id(cfg), {"config": cfg, "runs": 0, "best": None})
        g["runs"] += 1
        if g["best"] is None or r["hall_score"] > g["best"]:
            g["best"] = r["hall_score"]
    if not groups:
        return

    top = sorted(groups.values(), key=lambda g: g["best"], reverse=True)[:topk]
    t0 = time.time()
    for g in top:
        for _ in range(max(0, repeats - g["runs"])):
            if time.time() - t0 > budget_s:
                print(f"Re-Seed-Budget ({budget_s:.0f}s) erreicht — Rest übersprungen.")
                return
            cfg = dict(g["config"], seed=int(rng.integers(0, 2**31)))
            db.insert("ml_experiments", {"status": "running", "config": cfg, "seed": cfg["seed"]})
            exp = db.select_all("ml_experiments", {
                "select": "id,config,seed", "status": "eq.running",
                "order": "id.desc", "limit": 1,
            })[0]
            _evaluate_and_store(exp["id"], cfg, panel, git_sha)


def _write_night_summary() -> None:
    """Nacht-Zusammenfassung dauerhaft nach ml_engine_nights (idempotent:
    upsert nur auf die EIGENE Nacht — ältere Nächte bleiben unberührt).

    Seit 2026-07-19 zusaetzlich (Spec ml-engine-stabilisierung):
      - mean_/std_hitrate des ROHEN Nacht-Besten (Transparenz: «keine Edge»
        vs. «instabile Edge» — hall_score = mean − std),
      - stable_config/stable_score: stabile Linie mit Hysterese (wechselt nur
        bei Marge ueber mehrere Naechte, siehe stability.decide_stable).
    """
    night = datetime.now(timezone.utc).date().isoformat()
    rows = db.select_all("ml_experiments", {
        "select": "status,hall_score,runtime_s,config,metrics",
        "created_at": f"gte.{night}T00:00:00Z",
    })
    if not rows:
        return
    best_hall, best_config, best_metrics = None, None, None
    done_rows: list[dict] = []
    done = failed = 0
    runtime_s = 0.0
    for r in rows:
        runtime_s += r["runtime_s"] or 0
        if r["status"] == "done":
            done += 1
            cfg = r["config"] if isinstance(r["config"], dict) else json.loads(r["config"])
            done_rows.append({"config": cfg, "hall_score": r["hall_score"]})
            if r["hall_score"] is not None and (best_hall is None or r["hall_score"] > best_hall):
                best_hall = r["hall_score"]
                best_config = cfg
                best_metrics = r.get("metrics") or {}
        elif r["status"] == "failed":
            failed += 1

    # — Stabile Linie (Hysterese) —
    history = [
        h for h in db.select_all("ml_engine_nights", {
            "select": "night,best_config,best_hall,stable_config,stable_score",
            "night": f"lt.{night}",
            "order": "night.desc",
        })
    ]
    prev_stable = next((h["stable_config"] for h in history if h.get("stable_config")), None)
    cand_cfg, cand_score = robust_candidate(done_rows)
    _, incumbent_score = best_of_family(done_rows, family_key(prev_stable))
    stable_cfg, switched = decide_stable(
        prev_stable, history, cand_cfg, cand_score, incumbent_score,
    )
    stable_rep, stable_score = best_of_family(done_rows, family_key(stable_cfg))
    if stable_rep is None:
        stable_rep = stable_cfg  # Familie heute nicht gesampelt → Config vortragen
    if switched and prev_stable is not None:
        print(f"Stabiler Bester wechselt → {family_key(stable_cfg)}")

    def _m(key: str):
        v = (best_metrics or {}).get(key)
        return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 6)

    db.insert("ml_engine_nights", {
        "night": night,
        "done": done,
        "failed": failed,
        "best_hall": best_hall,
        "best_config": best_config,
        "runtime_min": round(runtime_s / 60, 1),
        "mean_hitrate": _m("mean_hitrate"),
        "std_hitrate": _m("std_hitrate"),
        "stable_config": stable_rep,
        "stable_score": None if stable_score is None else round(float(stable_score), 6),
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
        _evaluate_and_store(exp["id"], cfg, panel, git_sha)
        done += 1
    print(f"Fertig: {done} Experimente in {(time.time() - t0) / 60:.1f} min")

    # Seed-Robustheit nach dem Budget-Loop (nicht im --max-Smoke-Test —
    # der prueft exakte Experiment-Zahlen).
    if args.max is None:
        try:
            _reseed_top_configs(panel, rng, git_sha)
        except Exception:
            print(f"WARNUNG: Re-Seed fehlgeschlagen:\n{traceback.format_exc()[-800:]}")

    try:
        _write_night_summary()
        print("Nacht-Zusammenfassung → ml_engine_nights geschrieben.")
    except Exception:
        # Zusammenfassung darf den Lauf nicht scheitern lassen — die Live-View
        # ml_engine_nights_live deckt die Nacht notfalls ab.
        print(f"WARNUNG: Nacht-Zusammenfassung fehlgeschlagen:\n{traceback.format_exc()[-800:]}")


if __name__ == "__main__":
    main()
