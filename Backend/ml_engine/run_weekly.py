"""Wochen-Job (samstags nach COT-Release):
1. Champion + Baseline predicten die 8 Währungen für die kommende Woche
   → insert-only nach ml_weekly_rankings
2. Gereifte Predictions bekommen realized_return + hit → Paper-Track wächst.

  python -m ml_engine.run_weekly
"""
from __future__ import annotations

import io
import json

import joblib
import numpy as np
import pandas as pd

from macro_features.panel import build_feature_panel

from . import db
from .baseline import baseline_contributions, baseline_scores
from .models import design_matrix, predict_scores, top_contributions

QUANTILE_WINDOW_WEEKS = 156

BASELINE_CFG = {"algo": "baseline", "horizon": 4, "features": ["scores"], "params": {}}


def quintile_of(score: float, history: np.ndarray) -> int:
    """Stärke-Quintil 1..5: Position des Scores in der eigenen Score-Historie
    (Q5 = stärkstes Fünftel). KEINE Konfidenz und keine Trefferquote. Leere
    Historie → 3 (neutral)."""
    h = history[~np.isnan(history)]
    if len(h) < 20:
        return 3
    qs = np.quantile(h, [0.2, 0.4, 0.6, 0.8])
    return int(np.searchsorted(qs, score) + 1)


def mature_mask(rows: pd.DataFrame, today: pd.Timestamp) -> pd.Series:
    """Prediction gereift, wenn week_start + horizon Wochen <= heute."""
    due = rows["week_start"] + rows["horizon"].apply(lambda h: pd.Timedelta(weeks=int(h)))
    return due <= today


def _load_champion() -> tuple[dict, object | None]:
    rows = db.select_all("ml_champion", {
        "select": "id,config,model_blob", "order": "id.desc", "limit": 1,
    })
    if not rows:
        return dict(BASELINE_CFG), None
    row = rows[0]
    cfg = row["config"] if isinstance(row["config"], dict) else json.loads(row["config"])
    model = None
    blob = row.get("model_blob")
    if blob:
        raw = bytes.fromhex(blob[2:] if blob.startswith("\\x") else blob)
        model = joblib.load(io.BytesIO(raw))
    return cfg, model


def _scores_for(panel_rows: pd.DataFrame, history_rows: pd.DataFrame,
                cfg: dict, model) -> tuple[np.ndarray, np.ndarray, list[list[dict]]]:
    """(Scores aktuelle Woche, Score-Historie fürs Quintil, Top-Features)."""
    if cfg["algo"] == "baseline" or model is None:
        return (baseline_scores(panel_rows), baseline_scores(history_rows),
                baseline_contributions(panel_rows))
    X_now = design_matrix(panel_rows, cfg["features"])
    X_hist = design_matrix(history_rows, cfg["features"])
    return (predict_scores(model, cfg["algo"], X_now),
            predict_scores(model, cfg["algo"], X_hist),
            top_contributions(model, cfg["algo"], X_now))


def main() -> None:
    today = pd.Timestamp.today().normalize()
    panel = build_feature_panel()
    week = panel["week_start"].max()
    now_rows = panel[panel["week_start"] == week].reset_index(drop=True)
    hist_cut = week - pd.Timedelta(weeks=QUANTILE_WINDOW_WEEKS)
    hist_rows = panel[(panel["week_start"] >= hist_cut) & (panel["week_start"] < week)]

    champ_cfg, champ_model = _load_champion()
    for model_name, (cfg, mdl) in {
        "champion": (champ_cfg, champ_model),
        "baseline": (dict(BASELINE_CFG), None),
    }.items():
        scores, hist_scores, contribs = _scores_for(now_rows, hist_rows, cfg, mdl)
        rows = []
        for i, r in now_rows.iterrows():
            rows.append({
                "week_start": str(week.date()), "ccy": r["ccy"], "model": model_name,
                "horizon": int(cfg["horizon"]),
                "score": round(float(scores[i]), 4),
                # Stärke-Quintil (quintile_of): Position des Scores in seiner eigenen
                # 156W-Verteilung, keine Konfidenz.
                "strength_quintile": quintile_of(float(scores[i]), np.asarray(hist_scores)),
                "top_features": contribs[i],
            })
        db.insert_ignore("ml_weekly_rankings", rows, on_conflict="week_start,ccy,model")
        print(f"{model_name}: {len(rows)} Rankings für {week.date()} geschrieben")

    # ── Paper-Track: gereifte Predictions nachtragen ─────────────────────────
    open_rows = db.select_all("ml_weekly_rankings", {
        "select": "week_start,ccy,model,horizon,score",
        "realized_return": "is.null",
    })
    if not open_rows:
        print("Paper-Track: nichts offen")
        return
    df = pd.DataFrame(open_rows)
    df["week_start"] = pd.to_datetime(df["week_start"])
    df = df[mature_mask(df, today)]
    matured = 0
    for _, r in df.iterrows():
        h = int(r["horizon"])
        src = panel[(panel["week_start"] == r["week_start"]) & (panel["ccy"] == r["ccy"])]
        if src.empty or pd.isna(src[f"fwd_ret_{h}w"].iloc[0]):
            continue
        realized = float(src[f"fwd_ret_{h}w"].iloc[0])
        db.update("ml_weekly_rankings", {
            "week_start": f"eq.{r['week_start'].date()}",
            "ccy": f"eq.{r['ccy']}", "model": f"eq.{r['model']}",
        }, {
            "realized_return": round(realized, 6),
            "hit": bool((realized > 0) == (float(r["score"]) > 0)),
        })
        matured += 1
    print(f"Paper-Track: {matured} Predictions gereift")


if __name__ == "__main__":
    main()
