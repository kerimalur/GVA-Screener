"""Purge/Embargo: kein Trainings-Forward-Fenster ragt in einen Test-Block."""
import pandas as pd
import pytest

from ml_engine.splits import purged_walk_forward


@pytest.fixture
def weeks():
    return pd.Series(pd.date_range("2005-01-03", periods=600, freq="W-MON"))


def test_fold_anzahl_und_chronologie(weeks):
    folds = purged_walk_forward(weeks, horizon=4, n_folds=5, test_size=52)
    assert len(folds) == 5
    for tr, te in folds:
        assert tr.max() < te.min()


def test_purge_kein_overlap(weeks):
    horizon = 4
    for tr, te in purged_walk_forward(weeks, horizon=horizon, n_folds=5, test_size=52):
        # Forward-Fenster jeder Trainingswoche endet strikt vor Test-Beginn
        assert (tr + pd.Timedelta(weeks=horizon) < te.min()).all()


def test_min_train_verwirft_fruehe_folds():
    kurz = pd.Series(pd.date_range("2020-01-06", periods=120, freq="W-MON"))
    folds = purged_walk_forward(kurz, horizon=1, n_folds=5, test_size=52, min_train=260)
    assert folds == []
