"""Wöchentlicher Forward-Job des Factor-Tracks (Projekt B), samstags nach COT.

Snapshotet je Faktor × Währung × Horizont die Zielwoche (source='live') und
trägt gereifte Live-Zeilen (realized_return + hit) nach. Insert-only, kein
Repaint. Reuse der run_weekly-Bausteine. run_weekly.py bleibt unangetastet.

  python -m ml_engine.run_factors
"""
from __future__ import annotations

import pandas as pd

from macro_features.panel import build_feature_panel

from . import db
from .factors import HORIZONS, hit_of, build_rows
from .run_weekly import next_week_start, mature_mask, check_run_result


def main() -> None:
    today = pd.Timestamp.today().normalize()
    week = next_week_start(today)
    panel = build_feature_panel(end=week)

    # Zielwoche live snapshotten (realized/hit noch None → Reife später).
    rows = build_rows(panel, week, source="live", horizons=HORIZONS)
    written = db.insert_ignore(
        "factor_track", rows, on_conflict="week_start,factor,ccy,horizon"
    )
    if written == 0:
        print(f"WARN: factor_track: 0 neue Zeilen für {week.date()} — bereits vorhanden.")
    else:
        print(f"factor_track: {written} Zeilen für {week.date()} geschrieben")

    # Reife: offene Live-Zeilen nachtragen.
    open_rows = db.select_all("factor_track", {
        "select": "week_start,factor,ccy,horizon,score",
        "realized_return": "is.null",
        "source": "eq.live",
    })
    matured = 0
    if open_rows:
        df = pd.DataFrame(open_rows)
        df["week_start"] = pd.to_datetime(df["week_start"])
        df = df[mature_mask(df, today)]
        for _, r in df.iterrows():
            h = int(r["horizon"])
            src = panel[(panel["week_start"] == r["week_start"]) & (panel["ccy"] == r["ccy"])]
            if src.empty or pd.isna(src[f"fwd_ret_{h}w"].iloc[0]):
                continue
            realized = float(src[f"fwd_ret_{h}w"].iloc[0])
            score = r["score"]
            db.update("factor_track", {
                "week_start": f"eq.{r['week_start'].date()}",
                "factor": f"eq.{r['factor']}", "ccy": f"eq.{r['ccy']}",
                "horizon": f"eq.{h}",
            }, {
                "realized_return": round(realized, 6),
                "hit": hit_of(float(score) if score is not None else float("nan"), realized),
            })
            matured += 1
    print(f"factor_track Reife: {matured} Zeilen nachgetragen")

    # Abschluss (nach Reife): 0 neue + Zielwoche existiert → grün/INFO; sonst rot.
    target = str(week.date())
    if written > 0:
        target_exists = True
    else:
        target_exists = bool(db.select_all("factor_track", {
            "select": "week_start", "week_start": f"eq.{target}", "limit": 1,
        }))
    latest = db.select_all("factor_track", {
        "select": "week_start", "order": "week_start.desc", "limit": 1,
    })
    latest_week = pd.Timestamp(latest[0]["week_start"]) if latest else None
    print(check_run_result(written, target_exists, latest_week, week))


if __name__ == "__main__":
    main()
