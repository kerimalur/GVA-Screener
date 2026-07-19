"""Hysterese + Seed-Robustheit (Spec 2026-07-19-ml-engine-stabilisierung)."""
import pytest

from ml_engine.stability import (
    best_of_family,
    config_id,
    decide_stable,
    family_key,
    robust_candidate,
)

LOGREG = {"algo": "logreg", "horizon": 4, "features": ["rates", "scores"],
          "params": {"C": 1.0}, "seed": 1}
LGBM = {"algo": "lgbm", "horizon": 4, "features": ["scores"],
        "params": {"n_estimators": 200}, "seed": 2}


def _night(best_cfg, best_hall, stable_score):
    return {"best_config": best_cfg, "best_hall": best_hall, "stable_score": stable_score}


def test_family_key_ignoriert_params_und_seed():
    a = dict(LOGREG, params={"C": 9.9}, seed=123, space="explore")
    assert family_key(a) == family_key(LOGREG)
    assert family_key(dict(LOGREG, features=["scores", "rates"])) == family_key(LOGREG)
    assert family_key(LGBM) != family_key(LOGREG)
    assert family_key(None) is None


def test_config_id_ignoriert_nur_seed_und_space():
    assert config_id(dict(LOGREG, seed=99, space="core")) == config_id(LOGREG)
    assert config_id(dict(LOGREG, params={"C": 2.0})) != config_id(LOGREG)


def test_robust_candidate_bevorzugt_seed_gemittelte_config():
    rows = [
        {"config": dict(LGBM, seed=1), "hall_score": 0.56},  # einzelner Glueckslauf
        {"config": dict(LOGREG, seed=1), "hall_score": 0.52},
        {"config": dict(LOGREG, seed=2), "hall_score": 0.53},
        {"config": {"algo": "baseline", "horizon": 4, "features": ["scores"]},
         "hall_score": 0.99},  # Baseline nie Kandidat
    ]
    cfg, score = robust_candidate(rows)
    assert family_key(cfg) == family_key(LOGREG)
    assert score == pytest.approx(0.525)


def test_robust_candidate_fallback_ohne_mehrfachlaeufe():
    rows = [
        {"config": LGBM, "hall_score": 0.55},
        {"config": LOGREG, "hall_score": 0.52},
    ]
    cfg, score = robust_candidate(rows)
    assert family_key(cfg) == family_key(LGBM)
    assert score == pytest.approx(0.55)


def test_best_of_family():
    rows = [
        {"config": dict(LOGREG, seed=1), "hall_score": 0.51},
        {"config": dict(LOGREG, seed=2, params={"C": 0.1}), "hall_score": 0.53},
        {"config": LGBM, "hall_score": 0.60},
    ]
    cfg, score = best_of_family(rows, family_key(LOGREG))
    assert score == pytest.approx(0.53)
    assert cfg["params"] == {"C": 0.1}
    assert best_of_family(rows, None) == (None, None)


def test_initialisierung_ohne_vorherigen_stabilen():
    cfg, switched = decide_stable(None, [], LOGREG, 0.52, None, nights=3, margin=0.005)
    assert cfg == LOGREG and switched


def test_gleiche_familie_bleibt():
    cfg, switched = decide_stable(LOGREG, [], dict(LOGREG, seed=77), 0.55, 0.55,
                                  nights=3, margin=0.005)
    assert family_key(cfg) == family_key(LOGREG) and not switched


def test_kein_wechsel_unter_marge():
    history = [_night(LGBM, 0.530, 0.526), _night(LGBM, 0.530, 0.526)]
    # heute: Herausforderer nur 0.003 ueber der stabilen Familie (< 0.005)
    cfg, switched = decide_stable(LOGREG, history, LGBM, 0.529, 0.526,
                                  nights=3, margin=0.005)
    assert family_key(cfg) == family_key(LOGREG) and not switched


def test_kein_wechsel_bei_zu_kurzer_serie():
    history = [_night(LGBM, 0.54, 0.52)]  # nur 1 Vornacht statt 2
    cfg, switched = decide_stable(LOGREG, history, LGBM, 0.54, 0.52,
                                  nights=3, margin=0.005)
    assert family_key(cfg) == family_key(LOGREG) and not switched


def test_kein_wechsel_wenn_vornacht_andere_familie_gewann():
    history = [_night(LGBM, 0.54, 0.52), _night(LOGREG, 0.53, 0.53)]
    cfg, switched = decide_stable(LOGREG, history, LGBM, 0.54, 0.52,
                                  nights=3, margin=0.005)
    assert not switched


def test_kein_wechsel_wenn_alte_naechte_ohne_stable_score():
    history = [_night(LGBM, 0.54, None), _night(LGBM, 0.54, None)]  # Alt-Format
    cfg, switched = decide_stable(LOGREG, history, LGBM, 0.54, 0.52,
                                  nights=3, margin=0.005)
    assert not switched


def test_wechsel_bei_marge_ueber_n_naechte():
    history = [_night(LGBM, 0.540, 0.520), _night(LGBM, 0.538, 0.521)]
    cfg, switched = decide_stable(LOGREG, history, LGBM, 0.541, 0.520,
                                  nights=3, margin=0.005)
    assert family_key(cfg) == family_key(LGBM) and switched
