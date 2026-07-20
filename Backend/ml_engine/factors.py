"""Faktor-Definitionen + reine Zeilen-Assembly für den Factor-Track (Projekt B).

Ein Faktor = wöchentliche Richtungswette je Währung. Score-Vorzeichen = Richtung,
gereift gegen fwd_ret_{h}w (demeaned Korb, panel.py). Rein (keine I/O) → testbar.
v1: nur Panel-Faktoren. real_yield/macro_score = v2 (kein Python-Wochen-Produzent).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .baseline import baseline_scores

FACTOR_COLUMNS = {"cot": "cot_score", "rates": "rates_score", "season": "season_score"}
FACTORS = [*FACTOR_COLUMNS.keys(), "ranking_baseline"]
HORIZONS = [1, 4]
EPS = 1e-9


def factor_scores(panel: pd.DataFrame, factor: str) -> np.ndarray:
    """Score-Array in Zeilenreihenfolge des übergebenen Panels."""
    if factor == "ranking_baseline":
        return baseline_scores(panel)
    return panel[FACTOR_COLUMNS[factor]].to_numpy(dtype=float)


def direction_of(score: float) -> str:
    """long / short / neutral (NaN oder |score|≤EPS = neutral)."""
    if score is None or math.isnan(score):
        return "neutral"
    if score > EPS:
        return "long"
    if score < -EPS:
        return "short"
    return "neutral"


def hit_of(score: float, realized) -> bool | None:
    """Treffer wenn sign(score)==sign(realized). None = nicht bewertbar."""
    if score is None or math.isnan(score) or realized is None or (
        isinstance(realized, float) and math.isnan(realized)
    ):
        return None
    if abs(score) <= EPS:
        return None
    return (realized > 0) == (score > 0)


def build_rows(
    panel: pd.DataFrame,
    week: pd.Timestamp,
    source: str,
    horizons: list[int] = HORIZONS,
) -> list[dict]:
    """factor_track-Zeilen für EINE Woche × alle Faktoren × Währungen × Horizonte.
    realized/hit werden gefüllt, wo fwd_ret_{h}w vorhanden ist; sonst None (offen)."""
    wk = panel[panel["week_start"] == week].reset_index(drop=True)
    out: list[dict] = []
    for factor in FACTORS:
        scores = factor_scores(wk, factor)
        for i, r in wk.iterrows():
            score = float(scores[i])
            for h in horizons:
                fwd = r.get(f"fwd_ret_{h}w", np.nan)
                realized = float(fwd) if pd.notna(fwd) else None
                out.append({
                    "week_start": str(week.date()),
                    "factor": factor,
                    "ccy": r["ccy"],
                    "horizon": h,
                    "score": None if math.isnan(score) else round(score, 6),
                    "direction": direction_of(score),
                    "realized_return": None if realized is None else round(realized, 6),
                    "hit": hit_of(score, realized),
                    "source": source,
                })
    return out
