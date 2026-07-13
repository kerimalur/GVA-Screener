"""Experiment #0 — Baseline: Zins+Saison-Composite (beste Labor-Kombi).

Kein Training. Score = 0.5·rates_score + 0.5·season_score. Jedes ML-Modell
muss diese Latte OOS schlagen, sonst hat es keine Existenzberechtigung.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def baseline_scores(panel: pd.DataFrame) -> np.ndarray:
    r = panel["rates_score"].fillna(0.0)
    s = panel["season_score"].fillna(0.0)
    return (0.5 * r + 0.5 * s).to_numpy()


def baseline_contributions(panel: pd.DataFrame) -> list[list[dict]]:
    out = []
    for _, row in panel.iterrows():
        out.append([
            {"feature": "rates_score",
             "value": round(0.5 * float(row["rates_score"] if pd.notna(row["rates_score"]) else 0.0), 4)},
            {"feature": "season_score",
             "value": round(0.5 * float(row["season_score"] if pd.notna(row["season_score"]) else 0.0), 4)},
        ])
    return out
