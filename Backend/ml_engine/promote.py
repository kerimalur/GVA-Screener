"""Promotion-CLI — der EINZIGE Code, der das Holdout anfasst. Jeder Zugriff
wird in ml_holdout_access protokolliert (sichtbar im Dashboard).

  python -m ml_engine.promote --list            # Hall of Fame vs. Champion
  python -m ml_engine.promote --evaluate 123    # Holdout-Test für Experiment 123
  python -m ml_engine.promote --promote 123     # Finaler Fit + Champion-Wechsel
"""
from __future__ import annotations

import argparse
import io
import json

import joblib
import pandas as pd

from macro_features.panel import build_feature_panel

from . import db
from .evaluate import _fold_metrics
from .models import design_matrix, make_model, predict_scores
from .run_experiments import HOLDOUT_WEEKS, _jsonsafe


def _get_experiment(exp_id: int) -> dict:
    rows = db.select_all("ml_experiments", {"select": "*", "id": f"eq.{exp_id}"})
    if not rows:
        raise SystemExit(f"Experiment {exp_id} nicht gefunden")
    exp = rows[0]
    if isinstance(exp["config"], str):
        exp["config"] = json.loads(exp["config"])
    return exp


def _split_holdout(panel: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    last = panel["week_start"].max()
    cut = last - pd.Timedelta(weeks=HOLDOUT_WEEKS)
    return (panel[panel["week_start"] < cut].reset_index(drop=True),
            panel[panel["week_start"] >= cut].reset_index(drop=True))


def cmd_list() -> None:
    champ = db.select_all("ml_champion", {"select": "id,promoted_at,experiment_id,config",
                                          "order": "id.desc", "limit": 1})
    top = db.select_all("ml_experiments", {
        "select": "id,config,hall_score,metrics", "status": "eq.done",
        "order": "hall_score.desc.nullslast", "limit": 10,
    })
    n_access = len(db.select_all("ml_holdout_access", {"select": "id"}))
    print(f"Champion: {champ[0] if champ else 'KEINER (Baseline-Fallback)'}")
    print(f"Holdout-Zugriffe bisher: {n_access}\n")
    for e in top:
        cfg = e["config"] if isinstance(e["config"], dict) else json.loads(e["config"])
        m = e["metrics"] if isinstance(e["metrics"], dict) else json.loads(e["metrics"] or "{}")
        hall = e["hall_score"]
        hit = m.get("mean_hitrate")
        print(f"#{e['id']:5d} hall {hall if hall is not None else float('nan'):.3f}  "
              f"hit {hit if hit is not None else float('nan'):.3f}  "
              f"{cfg['algo']} h={cfg['horizon']} {cfg['features']}")


def cmd_evaluate(exp_id: int) -> dict:
    exp = _get_experiment(exp_id)
    cfg = exp["config"]
    panel = build_feature_panel()
    search, holdout = _split_holdout(panel)
    h = cfg["horizon"]
    label_col, ret_col = f"label_{h}w", f"fwd_ret_{h}w"
    tr = search[search[label_col].notna()]
    te = holdout[holdout[label_col].notna()]

    if cfg["algo"] == "baseline":
        from .baseline import baseline_scores
        scores = baseline_scores(te)
    else:
        model = make_model(cfg["algo"], cfg.get("params", {}), cfg.get("seed", 42))
        model.fit(design_matrix(tr, cfg["features"]), tr[label_col].astype(bool))
        scores = predict_scores(model, cfg["algo"], design_matrix(te, cfg["features"]))

    result = _jsonsafe(_fold_metrics(scores, te[label_col], te[ret_col]))
    db.insert("ml_holdout_access", {
        "experiment_id": exp_id, "result": result,
        "note": f"evaluate {cfg['algo']} h={h} {cfg['features']}",
    })
    hit = result["hitrate"]
    auc = result["auc"]
    print(f"Holdout ({len(te)} Zeilen, {HOLDOUT_WEEKS}W): "
          f"hit {hit if hit is not None else float('nan'):.3f} "
          f"auc {auc if auc is not None else float('nan'):.3f} — Zugriff protokolliert.")
    return result


def cmd_promote(exp_id: int, note: str) -> None:
    exp = _get_experiment(exp_id)
    cfg = exp["config"]
    holdout_result = cmd_evaluate(exp_id)  # erzwingt frischen, protokollierten Holdout-Blick
    panel = build_feature_panel()
    h = cfg["horizon"]
    label_col = f"label_{h}w"
    data = panel[panel[label_col].notna()]

    blob_hex = None
    if cfg["algo"] != "baseline":
        model = make_model(cfg["algo"], cfg.get("params", {}), cfg.get("seed", 42))
        model.fit(design_matrix(data, cfg["features"]), data[label_col].astype(bool))
        buf = io.BytesIO()
        joblib.dump(model, buf)
        blob_hex = "\\x" + buf.getvalue().hex()

    db.insert("ml_champion", {
        "experiment_id": exp_id, "model_blob": blob_hex, "config": cfg,
        "holdout_metrics": holdout_result, "note": note,
    })
    print(f"Champion gewechselt → Experiment #{exp_id} ({cfg['algo']} h={h})")


def main() -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--list", action="store_true")
    g.add_argument("--evaluate", type=int, metavar="ID")
    g.add_argument("--promote", type=int, metavar="ID")
    ap.add_argument("--note", default="", help="Begründung beim Promoten")
    args = ap.parse_args()
    if args.list:
        cmd_list()
    elif args.evaluate:
        cmd_evaluate(args.evaluate)
    else:
        cmd_promote(args.promote, args.note)


if __name__ == "__main__":
    main()
