"""Reine Faktor-Logik des Factor-Tracks (Projekt B)."""
import numpy as np
import pandas as pd

from ml_engine.factors import (
    FACTORS,
    direction_of,
    hit_of,
    factor_scores,
    build_rows,
)


def test_direction_of():
    assert direction_of(0.4) == "long"
    assert direction_of(-0.4) == "short"
    assert direction_of(0.0) == "neutral"
    assert direction_of(float("nan")) == "neutral"


def test_hit_of():
    assert hit_of(0.4, 0.02) is True
    assert hit_of(0.4, -0.02) is False
    assert hit_of(-0.4, -0.02) is True
    assert hit_of(0.0, 0.02) is None
    assert hit_of(0.4, float("nan")) is None


def test_factor_scores_atomar_und_composite():
    panel = pd.DataFrame({
        "ccy": ["EUR", "USD"],
        "cot_score": [0.5, -0.5],
        "rates_score": [0.2, -0.2],
        "season_score": [0.0, 0.4],
    })
    assert list(factor_scores(panel, "cot")) == [0.5, -0.5]
    np.testing.assert_allclose(factor_scores(panel, "ranking_baseline"), [0.1, 0.1])


def test_build_rows_struktur():
    week = pd.Timestamp("2026-07-27")
    panel = pd.DataFrame({
        "week_start": [week, week],
        "ccy": ["EUR", "USD"],
        "cot_score": [0.5, -0.5],
        "rates_score": [0.2, -0.2],
        "season_score": [0.0, 0.4],
        "fwd_ret_1w": [0.01, np.nan],
        "fwd_ret_4w": [np.nan, np.nan],
    })
    rows = build_rows(panel, week, source="seed", horizons=[1, 4])
    assert len(rows) == len(FACTORS) * 2 * 2
    eur_cot_1w = next(r for r in rows if r["factor"] == "cot" and r["ccy"] == "EUR" and r["horizon"] == 1)
    assert eur_cot_1w["direction"] == "long"
    assert eur_cot_1w["realized_return"] == 0.01
    assert eur_cot_1w["hit"] is True
    assert eur_cot_1w["source"] == "seed"
    eur_cot_4w = next(r for r in rows if r["factor"] == "cot" and r["ccy"] == "EUR" and r["horizon"] == 4)
    assert eur_cot_4w["realized_return"] is None
    assert eur_cot_4w["hit"] is None
