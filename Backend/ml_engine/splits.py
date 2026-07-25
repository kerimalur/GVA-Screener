"""Purged Walk-Forward: expanding Train, chronologische Test-Blöcke.

Purge: Trainingswochen, deren Forward-Fenster (week + horizon) in den
Test-Block ragt, fliegen raus — sonst leakt das Target in den Test.

Die Purge-Regel steht genau EINMAL (`purge_train`) und wird von beiden
Fold-Buildern benutzt: der Suche (`purged_walk_forward`, Panel OHNE Holdout)
und der Holdout-Validierung (`holdout_walk_forward`, siehe holdout.py).
"""
from __future__ import annotations

import pandas as pd


def purge_train(weeks: pd.Series, test_start: pd.Timestamp, horizon: int) -> pd.Series:
    """Trainingswochen, deren Forward-Fenster strikt VOR `test_start` endet.

    Das ist die einzige Stelle, an der «was darf trainiert werden» definiert
    ist. `week + horizon < test_start` schliesst zweierlei aus: Wochen aus der
    Zukunft des Testfensters (week >= test_start) und Wochen davor, deren
    Label-Fenster noch in den Test hineinragt (Target-Leak).
    """
    return weeks[weeks + pd.Timedelta(weeks=horizon) < test_start]


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
        train = purge_train(uniq, test.min(), horizon)
        if len(train) < min_train:
            continue
        folds.append((train.reset_index(drop=True), test.reset_index(drop=True)))
    return folds


def holdout_walk_forward(
    all_weeks: pd.Series,
    holdout_start: pd.Timestamp,
    horizon: int,
    test_size: int = 26,
    min_train: int = 260,
) -> list[tuple[pd.Series, pd.Series]]:
    """Walk-Forward-Folds, deren Testfenster AUSSCHLIESSLICH im Holdout liegen.

    Unterschied zu `purged_walk_forward`: dort werden die Testblöcke vom Ende
    der Serie her abgezählt, hier vom `holdout_start` her vorwärts. Damit
    beginnt Block 1 exakt am Holdout-Rand — keine Suchwochen rutschen in einen
    Testblock, und die zurückgehaltenen Wochen werden lückenlos abgedeckt.

    Trainiert wird per `purge_train` gegen den Beginn des JEWEILIGEN Blocks:
    Fold 2 darf die Holdout-Wochen aus Fold 1 mitlernen (die sind zu dem
    Zeitpunkt Vergangenheit), aber nie etwas ab dem eigenen Testfenster.
    """
    uniq = pd.Series(sorted(all_weeks.unique()))
    hold = uniq[uniq >= holdout_start].reset_index(drop=True)
    folds: list[tuple[pd.Series, pd.Series]] = []
    for start in range(0, len(hold), test_size):
        test = hold.iloc[start:start + test_size]
        if test.empty:
            continue
        train = purge_train(uniq, test.min(), horizon)
        if len(train) < min_train:
            continue
        folds.append((train.reset_index(drop=True), test.reset_index(drop=True)))
    return folds
