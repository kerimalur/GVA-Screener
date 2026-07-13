"""Purged Walk-Forward: expanding Train, chronologische Test-Blöcke.

Purge: Trainingswochen, deren Forward-Fenster (week + horizon) in den
Test-Block ragt, fliegen raus — sonst leakt das Target in den Test.
"""
from __future__ import annotations

import pandas as pd


def purged_walk_forward(
    weeks: pd.Series,
    horizon: int,
    n_folds: int = 5,
    test_size: int = 52,
    min_train: int = 260,
) -> list[tuple[pd.Series, pd.Series]]:
    """Liste (train_weeks, test_weeks); Wochen-Serien, aufsteigend, dedupliziert."""
    uniq = pd.Series(sorted(weeks.unique()))
    folds: list[tuple[pd.Series, pd.Series]] = []
    total = len(uniq)
    for i in range(n_folds):
        te_end = total - (n_folds - 1 - i) * test_size
        te_start = te_end - test_size
        if te_start <= 0:
            continue
        test = uniq.iloc[te_start:te_end]
        train = uniq[uniq + pd.Timedelta(weeks=horizon) < test.min()]
        if len(train) < min_train:
            continue
        folds.append((train.reset_index(drop=True), test.reset_index(drop=True)))
    return folds
