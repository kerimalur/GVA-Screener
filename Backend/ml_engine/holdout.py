"""Holdout-Validierung: dieselbe Fold-/Metrik-Logik, anderer Zeitraum.

WARUM ES DAS GIBT
-----------------
Der nächtliche Random-Search meldet ein Maximum über zehntausende Ziehungen.
Bei so vielen Versuchen findet man garantiert eine Config, die nach Edge
aussieht, auch wenn keine existiert — Selection Bias. Die Suchzahl ist deshalb
systematisch zu optimistisch und für sich genommen nicht interpretierbar.

Hier wird dieselbe Config auf den `HOLDOUT_WEEKS` Wochen ausgewertet, die der
Runner per Konstruktion nie gesehen hat (`run_experiments._search_panel()`
schneidet sie ab). Die wichtigste Einzelzahl ist der `selection_gap`
(Suchwert − Holdout-Wert): er beziffert, wie stark die Suchmetrik verzerrt war.

Reine Funktionen; kein DB-Zugriff, keine Ausgaben. Der Runner liegt in
`run_holdout.py`.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .evaluate import score_fold
from .splits import holdout_walk_forward

# 104 Wochen Holdout in 4 Blöcken à 26 — bewusst kürzere Blöcke als in der
# Suche (52), sonst blieben nur 2 Folds und die Streuung wäre nicht schätzbar.
HOLDOUT_TEST_WEEKS = 26
BOOTSTRAP_DRAWS = 10_000
BOOTSTRAP_SEED = 20260725


def split_train_holdout(
    panel: pd.DataFrame, holdout_weeks: int
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Timestamp]:
    """(train, holdout, cut) — identischer Schnitt wie `_search_panel()`.

    `train` ist exakt das, was die Suche gesehen hat; `holdout` ist der Rest.
    """
    cut = panel["week_start"].max() - pd.Timedelta(weeks=holdout_weeks)
    train = panel[panel["week_start"] < cut].reset_index(drop=True)
    holdout = panel[panel["week_start"] >= cut].reset_index(drop=True)
    return train, holdout, cut


def wilson_interval(hits: int, n: int, z: float = 1.959964) -> tuple[float, float]:
    """95-%-Wilson-Intervall für einen Anteil (analytisch, ohne scipy).

    ACHTUNG bei der Interpretation: Wilson nimmt n UNABHÄNGIGE Ziehungen an.
    Das ist hier falsch — 8 Währungen derselben Woche sind korreliert (der Korb
    ist demeaned) und 4-Wochen-Fenster überlappen sich. Das Intervall ist
    dadurch zu eng. Es wird nur als Referenz mitgeführt; berichtet wird das
    Bootstrap-Intervall über die Folds (`bootstrap_fold_ci`).
    """
    if n <= 0:
        return (float("nan"), float("nan"))
    p = hits / n
    denom = 1.0 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (float(max(0.0, centre - half)), float(min(1.0, centre + half)))


def bootstrap_fold_ci(
    fold_hitrates: list[float],
    draws: int = BOOTSTRAP_DRAWS,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[float, float]:
    """95-%-Cluster-Bootstrap über die Folds (Perzentil-Methode).

    Die Fold-Trefferquote ist die Beobachtungseinheit, nicht die Einzelprognose:
    innerhalb eines Folds sind Prognosen stark korreliert, zwischen Folds (=
    disjunkte Zeitblöcke) deutlich weniger. Resampled wird deshalb über Folds
    mit Zurücklegen; Statistik ist das Fold-Mittel, also derselbe Schätzer wie
    der Punktwert `holdout_hitrate`.

    Bei 4 Folds ist das Intervall grob — das ist ehrlich so und der Grund,
    warum `n_predictions` und die Fold-Zahl immer mitberichtet werden.
    """
    vals = [float(h) for h in fold_hitrates if h is not None and not np.isnan(h)]
    if len(vals) == 0:
        return (float("nan"), float("nan"))
    if len(vals) == 1:
        return (vals[0], vals[0])
    rng = np.random.default_rng(seed)
    arr = np.asarray(vals)
    idx = rng.integers(0, len(arr), size=(draws, len(arr)))
    means = arr[idx].mean(axis=1)
    return (float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)))


def paired_delta_ci(
    a_hitrates: list[float],
    b_hitrates: list[float],
    draws: int = BOOTSTRAP_DRAWS,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[float, float]:
    """95-%-KI der Differenz a − b, GEPAART über dieselben Folds.

    Modell und Baseline laufen auf identischen Testblöcken (gleicher Horizont
    → gleiche Folds). Gepaart zu resamplen entfernt die gemeinsame Marktphase
    aus der Streuung und macht das Intervall der Differenz aussagekräftiger als
    zwei getrennte Intervalle. Schliesst es die Null NICHT ein, ist der
    Unterschied zur Baseline auf diesem Holdout messbar.
    """
    n = min(len(a_hitrates), len(b_hitrates))
    if n == 0:
        return (float("nan"), float("nan"))
    diffs = np.asarray([
        float(a_hitrates[i]) - float(b_hitrates[i])
        for i in range(n)
        if not (np.isnan(a_hitrates[i]) or np.isnan(b_hitrates[i]))
    ])
    if len(diffs) == 0:
        return (float("nan"), float("nan"))
    if len(diffs) == 1:
        return (float(diffs[0]), float(diffs[0]))
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(diffs), size=(draws, len(diffs)))
    means = diffs[idx].mean(axis=1)
    return (float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)))


def evaluate_on_holdout(
    panel: pd.DataFrame,
    config: dict,
    holdout_weeks: int,
    test_size: int = HOLDOUT_TEST_WEEKS,
) -> dict:
    """Eine Config auf den zurückgehaltenen Wochen auswerten.

    Kein Look-ahead: die Folds kommen aus `splits.holdout_walk_forward`, das
    für JEDEN Block per `splits.purge_train` nur Wochen zulässt, deren
    Forward-Fenster strikt vor dem Blockbeginn endet. Fold k trainiert also auf
    Suchdaten plus den bereits vergangenen Holdout-Blöcken 1..k−1, nie auf dem
    eigenen Testfenster oder danach. Abgesichert in
    `tests/test_holdout.py::test_kein_training_aus_der_zukunft`.
    """
    h = config["horizon"]
    label_col = f"label_{h}w"
    data = panel[panel[label_col].notna()].reset_index(drop=True)
    _, _, cut = split_train_holdout(panel, holdout_weeks)

    folds = holdout_walk_forward(data["week_start"], cut, horizon=h, test_size=test_size)
    fold_rows = [score_fold(data, config, tr_w, te_w) for tr_w, te_w in folds]

    hits = [f["hitrate"] for f in fold_rows if not np.isnan(f["hitrate"])]
    n_pred = int(sum(f["n"] for f in fold_rows))
    n_correct = int(round(sum(f["hitrate"] * f["n"] for f in fold_rows
                              if not np.isnan(f["hitrate"]))))
    mean_hit = float(np.mean(hits)) if hits else float("nan")
    std_hit = float(np.std(hits)) if hits else float("nan")
    ci_low, ci_high = bootstrap_fold_ci(hits)
    w_low, w_high = wilson_interval(n_correct, n_pred)

    test_weeks = [w for _, te in folds for w in te]
    return {
        "config": config,
        "fold_hitrates": hits,
        "n_folds": len(fold_rows),
        "holdout_hitrate": mean_hit,
        "holdout_std": std_hit,
        "ci_low": ci_low,
        "ci_high": ci_high,
        "wilson_low": w_low,
        "wilson_high": w_high,
        "n_predictions": n_pred,
        "holdout_start": min(test_weeks).date().isoformat() if test_weeks else None,
        "holdout_end": max(test_weeks).date().isoformat() if test_weeks else None,
    }


def add_baseline_comparison(result: dict, baseline: dict | None) -> dict:
    """`delta_vs_baseline` + gepaartes KI der Differenz an ein Ergebnis hängen.

    `baseline` ist das Ergebnis von `evaluate_on_holdout` für die Baseline
    DESSELBEN Horizonts — nur dann sind die Folds identisch und die Paarung
    zulässig. Ohne passende Baseline bleiben die Felder None.
    """
    if baseline is None or baseline is result:
        return {**result, "delta_vs_baseline": None,
                "delta_ci_low": None, "delta_ci_high": None,
                "beats_baseline": None}
    delta = result["holdout_hitrate"] - baseline["holdout_hitrate"]
    lo, hi = paired_delta_ci(result["fold_hitrates"], baseline["fold_hitrates"])
    # «Schlägt die Baseline» heisst: das KI der Differenz schliesst die Null aus.
    beats = None if np.isnan(lo) or np.isnan(hi) else bool(lo > 0.0)
    return {**result, "delta_vs_baseline": float(delta),
            "delta_ci_low": lo, "delta_ci_high": hi, "beats_baseline": beats}
