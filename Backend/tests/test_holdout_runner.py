"""Holdout-Runner: Config-Auswahl, Ein-Schuss-Disziplin, Zeilenbau (ohne DB)."""
import json

import pytest

import ml_engine.run_holdout as rh
from ml_engine.stability import config_id

CFG_A = {"algo": "logreg", "horizon": 4, "features": ["rates", "scores"],
         "params": {"C": 1.0}, "seed": 1}
CFG_B = {"algo": "lgbm", "horizon": 1, "features": ["cot_core"],
         "params": {"n_estimators": 200}, "seed": 2}


def _exp(cfg, hall, hit):
    return {"id": 1, "config": cfg, "hall_score": hall, "metrics": {"mean_hitrate": hit}}


class _Args:
    def __init__(self, config=None, top_families=0):
        self.config = config
        self.top_families = top_families


# --- Config-Auswahl ---------------------------------------------------------

def test_standardlauf_nimmt_baselines_und_stabile_config(monkeypatch):
    monkeypatch.setattr(rh, "stable_config", lambda: CFG_A)
    cfgs = rh.collect_configs(_Args(), [])
    baselines = [c for c in cfgs if c["algo"] == "baseline"]
    assert [c["horizon"] for c in baselines] == [1, 2, 4]
    assert CFG_A in cfgs


def test_configs_werden_dedupliziert(monkeypatch):
    monkeypatch.setattr(rh, "stable_config", lambda: CFG_A)
    cfgs = rh.collect_configs(_Args(config=[json.dumps(CFG_A)]), [])
    ids = [config_id(c) for c in cfgs]
    assert len(ids) == len(set(ids))


def test_top_families_nimmt_je_familie_die_beste_config(monkeypatch):
    monkeypatch.setattr(rh, "stable_config", lambda: None)
    schwach = dict(CFG_A, params={"C": 0.1})
    rows = [_exp(schwach, 0.40, 0.52), _exp(CFG_A, 0.51, 0.55), _exp(CFG_B, 0.45, 0.53)]
    cfgs = rh.collect_configs(_Args(top_families=1), rows)
    nicht_baseline = [c for c in cfgs if c["algo"] != "baseline"]
    assert nicht_baseline == [CFG_A]  # beste Familie, darin die beste Config


def test_top_families_ignoriert_baselines(monkeypatch):
    monkeypatch.setattr(rh, "stable_config", lambda: None)
    base = {"algo": "baseline", "horizon": 4, "features": ["scores"], "params": {}, "seed": 0}
    assert rh.top_family_configs(3, [_exp(base, 0.99, 0.99)]) == []


# --- Suchwert-Lookup --------------------------------------------------------

def test_search_hitrate_nimmt_das_maximum_ueber_seeds():
    """Der Maximalwert hat die Auswahl getrieben — genau dessen Verzerrung
    soll selection_gap beziffern."""
    rows = [_exp(dict(CFG_A, seed=1), 0.50, 0.531),
            _exp(dict(CFG_A, seed=2), 0.51, 0.544)]
    assert rh.search_hitrates(rows)[config_id(CFG_A)] == pytest.approx(0.544)


def test_search_hitrate_ohne_metrics_faellt_weg():
    rows = [{"id": 1, "config": CFG_A, "hall_score": 0.5, "metrics": None}]
    assert rh.search_hitrates(rows) == {}


# --- Ein-Schuss-Disziplin ---------------------------------------------------

def test_erstlauf_braucht_keine_bestaetigung():
    assert rh.confirm_rerun(0, 0, forced=False) is True


def test_zweiter_lauf_ohne_flag_und_ohne_tty_bricht_ab(monkeypatch):
    monkeypatch.setattr(rh.sys.stdin, "isatty", lambda: False)
    assert rh.confirm_rerun(1, 4, forced=False) is False


def test_zweiter_lauf_mit_flag_laeuft_durch():
    assert rh.confirm_rerun(1, 4, forced=True) is True


def test_warnung_benennt_laufzahl_und_configs():
    text = rh.warning_text(2, 9)
    assert "2×" in text and "9 Configs" in text and "Nr. 3" in text


# --- Zeilenbau --------------------------------------------------------------

def _result(**over):
    base = {
        "config": CFG_A, "holdout_hitrate": 0.505, "holdout_std": 0.02,
        "ci_low": 0.47, "ci_high": 0.54, "n_predictions": 800,
        "holdout_start": "2024-07-29", "holdout_end": "2026-07-20",
        "delta_vs_baseline": 0.004, "delta_ci_low": -0.02, "delta_ci_high": 0.03,
    }
    return {**base, **over}


def test_selection_gap_ist_suche_minus_holdout():
    row = rh.to_row(_result(), run_index=1, search_hit=0.544, notes="Erstlauf")
    assert row["selection_gap"] == pytest.approx(0.039, abs=1e-6)
    assert row["run_index"] == 1
    assert row["is_baseline"] is False
    assert row["family"] == "logreg · 4 · ('rates', 'scores')"


def test_ohne_suchwert_bleibt_gap_leer():
    row = rh.to_row(_result(), run_index=1, search_hit=None, notes="")
    assert row["search_hitrate"] is None and row["selection_gap"] is None


def test_nan_wird_zu_none_fuer_postgres():
    row = rh.to_row(_result(holdout_std=float("nan")), 1, None, "")
    assert row["holdout_std"] is None


def test_warnung_landet_in_den_notes():
    notes = rh.warning_text(1, 4)
    row = rh.to_row(_result(), run_index=2, search_hit=0.544, notes=notes)
    assert "WARNUNG" in row["notes"]
