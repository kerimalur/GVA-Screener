"""Quintil-Zuordnung + Reifungs-Logik des Wochen-Jobs."""
import numpy as np
import pandas as pd

from ml_engine.run_weekly import quintile_of, mature_mask


def test_quintile_grenzen():
    hist = np.linspace(-1, 1, 200)  # gleichverteilte Score-Historie
    assert quintile_of(-0.95, hist) == 1
    assert quintile_of(0.0, hist) == 3
    assert quintile_of(0.95, hist) == 5


def test_quintile_leere_historie_neutral():
    assert quintile_of(0.7, np.array([])) == 3


def test_mature_mask():
    today = pd.Timestamp("2026-07-13")
    rows = pd.DataFrame({
        "week_start": pd.to_datetime(["2026-05-11", "2026-07-06"]),
        "horizon": [4, 4],
    })
    m = mature_mask(rows, today)
    assert m.tolist() == [True, False]
