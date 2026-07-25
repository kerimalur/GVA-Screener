"""Holdout-Validierung: Fold-Disziplin, Konfidenzintervalle, Baseline-Vergleich."""
import numpy as np
import pandas as pd
import pytest

from ml_engine.holdout import (
    add_baseline_comparison,
    bootstrap_fold_ci,
    evaluate_on_holdout,
    paired_delta_ci,
    split_train_holdout,
    wilson_interval,
)
from ml_engine.splits import holdout_walk_forward, purge_train
from tests.test_models_synthetic import _synth_panel

HOLDOUT_WEEKS = 104
CFG = {"algo": "logreg", "horizon": 4, "features": ["rates", "scores"],
       "params": {"C": 1.0}, "seed": 42}
BASE_CFG = {"algo": "baseline", "horizon": 4, "features": ["scores"],
            "params": {}, "seed": 0}


@pytest.fixture(scope="module")
def panel():
    return _synth_panel(signal=True, n_weeks=700)


# --- Datenaufteilung ---------------------------------------------------------

def test_split_ist_lueckenlos_und_ueberschneidungsfrei(panel):
    train, hold, cut = split_train_holdout(panel, HOLDOUT_WEEKS)
    assert train["week_start"].max() < cut <= hold["week_start"].min()
    assert len(train) + len(hold) == len(panel)
    # Holdout deckt genau die letzten 104 Wochen ab
    assert hold["week_start"].nunique() == HOLDOUT_WEEKS + 1  # inkl. Randwoche = cut


# --- Kein Look-ahead (Akzeptanzkriterium 3) ---------------------------------

def test_kein_training_aus_der_zukunft(panel):
    """In KEINEM Fold darf eine Trainingswoche ab dem Testfenster liegen —
    auch nicht mit einem Forward-Fenster, das hineinragt."""
    horizon = 4
    _, _, cut = split_train_holdout(panel, HOLDOUT_WEEKS)
    weeks = panel[panel["label_4w"].notna()]["week_start"]
    folds = holdout_walk_forward(weeks, cut, horizon=horizon, test_size=26)
    assert len(folds) >= 3
    for tr, te in folds:
        assert tr.max() < te.min()                                   # chronologisch
        assert (tr + pd.Timedelta(weeks=horizon) < te.min()).all()   # gepurged
        assert not set(tr).intersection(set(te))                     # disjunkt


def test_testfenster_liegen_komplett_im_holdout(panel):
    """Kein Testblock darf Suchwochen enthalten — sonst wäre es kein Holdout."""
    _, _, cut = split_train_holdout(panel, HOLDOUT_WEEKS)
    weeks = panel[panel["label_4w"].notna()]["week_start"]
    for _, te in holdout_walk_forward(weeks, cut, horizon=4, test_size=26):
        assert te.min() >= cut


def test_spaeterer_fold_darf_frueheren_holdout_block_lernen(panel):
    """Fold 2 trainiert auf Fold-1-Wochen (zu dem Zeitpunkt Vergangenheit)."""
    _, _, cut = split_train_holdout(panel, HOLDOUT_WEEKS)
    weeks = panel[panel["label_4w"].notna()]["week_start"]
    folds = holdout_walk_forward(weeks, cut, horizon=4, test_size=26)
    erster_test, zweiter_train = folds[0][1], folds[1][0]
    assert (zweiter_train >= cut).any()
    assert set(zweiter_train).intersection(set(erster_test))


def test_purge_train_ist_die_einzige_regel():
    weeks = pd.Series(pd.date_range("2020-01-06", periods=50, freq="W-MON"))
    start = weeks.iloc[30]
    tr = purge_train(weeks, start, horizon=4)
    assert tr.max() + pd.Timedelta(weeks=4) < start
    assert purge_train(weeks, weeks.iloc[0], horizon=1).empty


# --- Konfidenzintervalle ----------------------------------------------------

def test_wilson_enthaelt_den_punktwert_und_wird_mit_n_enger():
    lo, hi = wilson_interval(55, 100)
    assert lo < 0.55 < hi
    lo2, hi2 = wilson_interval(5500, 10000)
    assert (hi2 - lo2) < (hi - lo)


def test_wilson_bei_n_null_ist_nan():
    lo, hi = wilson_interval(0, 0)
    assert np.isnan(lo) and np.isnan(hi)


def test_bootstrap_umschliesst_das_fold_mittel():
    folds = [0.52, 0.55, 0.49, 0.58]
    lo, hi = bootstrap_fold_ci(folds, draws=2000, seed=1)
    assert lo <= float(np.mean(folds)) <= hi
    assert lo < hi


def test_bootstrap_ist_breiter_als_wilson_bei_gleichem_punktwert():
    """Kernaussage der Methodenwahl: Wilson (unabhängige Ziehungen) ist hier
    zu optimistisch, der Cluster-Bootstrap über Folds ist konservativer."""
    folds = [0.44, 0.60, 0.47, 0.63]  # Ø 0.535, stark streuend
    b_lo, b_hi = bootstrap_fold_ci(folds, draws=5000, seed=3)
    w_lo, w_hi = wilson_interval(535, 1000)
    assert (b_hi - b_lo) > (w_hi - w_lo)


def test_gepaartes_delta_ki_erkennt_konstanten_vorsprung():
    a = [0.60, 0.62, 0.61, 0.59]
    b = [0.50, 0.52, 0.51, 0.49]
    lo, hi = paired_delta_ci(a, b, draws=5000, seed=5)
    assert lo > 0  # konstanter Vorsprung → Null ausgeschlossen


def test_gepaartes_delta_ki_schliesst_null_ein_bei_rauschen():
    a = [0.55, 0.45, 0.58, 0.42]
    b = [0.52, 0.51, 0.49, 0.50]
    lo, hi = paired_delta_ci(a, b, draws=5000, seed=5)
    assert lo < 0 < hi


# --- Gesamt-Auswertung ------------------------------------------------------

def test_evaluate_on_holdout_liefert_alle_kennzahlen(panel):
    res = evaluate_on_holdout(panel, CFG, HOLDOUT_WEEKS)
    for key in ("holdout_hitrate", "holdout_std", "ci_low", "ci_high",
                "n_predictions", "holdout_start", "holdout_end"):
        assert key in res
    assert res["n_folds"] >= 3
    assert res["n_predictions"] > 0
    assert 0.0 <= res["holdout_hitrate"] <= 1.0
    assert res["ci_low"] <= res["holdout_hitrate"] <= res["ci_high"]


def test_evaluate_findet_das_geplantete_signal(panel):
    """Sanity: bei echtem Signal liegt die Holdout-Trefferquote über 0.5."""
    res = evaluate_on_holdout(panel, CFG, HOLDOUT_WEEKS)
    assert res["holdout_hitrate"] > 0.55


def test_baseline_vergleich_haengt_delta_und_ki_an(panel):
    modell = evaluate_on_holdout(panel, CFG, HOLDOUT_WEEKS)
    basis = evaluate_on_holdout(panel, BASE_CFG, HOLDOUT_WEEKS)
    out = add_baseline_comparison(modell, basis)
    assert out["delta_vs_baseline"] == pytest.approx(
        modell["holdout_hitrate"] - basis["holdout_hitrate"], abs=1e-9)
    assert out["delta_ci_low"] <= out["delta_vs_baseline"] <= out["delta_ci_high"]
    assert out["beats_baseline"] in (True, False)


def test_baseline_gegen_sich_selbst_hat_kein_delta(panel):
    basis = evaluate_on_holdout(panel, BASE_CFG, HOLDOUT_WEEKS)
    out = add_baseline_comparison(basis, basis)
    assert out["delta_vs_baseline"] is None
    assert out["beats_baseline"] is None
