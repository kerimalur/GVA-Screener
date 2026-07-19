"""Kern-Suchraum + Exploration (Spec 2026-07-19-ml-engine-stabilisierung)."""
import numpy as np
import pytest

from ml_engine.models import FEATURE_GROUPS
from ml_engine.search import HORIZONS, core_space, explore_frac, random_config


def test_kern_zieht_nur_erlaubte_configs(monkeypatch):
    monkeypatch.delenv("ML_CORE_ALGOS", raising=False)
    monkeypatch.delenv("ML_CORE_HORIZONS", raising=False)
    monkeypatch.delenv("ML_CORE_FEATURE_GROUPS", raising=False)
    rng = np.random.default_rng(42)
    for _ in range(200):
        cfg = random_config(rng, core=True)
        assert cfg["algo"] == "logreg"
        assert cfg["horizon"] == 4
        assert set(cfg["features"]) <= {"rates", "scores"}
        assert len(cfg["features"]) >= 1
        assert cfg["space"] == "core"


def test_explore_frac_null_heisst_nur_kern(monkeypatch):
    monkeypatch.setenv("ML_EXPLORE_FRAC", "0")
    rng = np.random.default_rng(1)
    assert all(random_config(rng)["space"] == "core" for _ in range(100))


def test_explore_frac_eins_heisst_voller_raum(monkeypatch):
    monkeypatch.setenv("ML_EXPLORE_FRAC", "1")
    rng = np.random.default_rng(2)
    cfgs = [random_config(rng) for _ in range(300)]
    assert all(c["space"] == "explore" for c in cfgs)
    # voller Raum bleibt erreichbar: alle Algos/Horizonte/Gruppen kommen vor
    assert {c["algo"] for c in cfgs} == {"lgbm", "logreg"}
    assert {c["horizon"] for c in cfgs} == set(HORIZONS)
    assert {g for c in cfgs for g in c["features"]} == set(FEATURE_GROUPS)


def test_default_mischung_mit_explorations_rest(monkeypatch):
    monkeypatch.delenv("ML_EXPLORE_FRAC", raising=False)  # Default 0.2
    rng = np.random.default_rng(3)
    spaces = [random_config(rng)["space"] for _ in range(400)]
    frac = spaces.count("explore") / len(spaces)
    assert 0.1 < frac < 0.35  # ~20 % Exploration, Rest Kern


def test_env_steuert_kern(monkeypatch):
    monkeypatch.setenv("ML_CORE_ALGOS", "lgbm")
    monkeypatch.setenv("ML_CORE_HORIZONS", "1,2")
    monkeypatch.setenv("ML_CORE_FEATURE_GROUPS", "season")
    space = core_space()
    assert space == {"algos": ["lgbm"], "horizons": [1, 2], "groups": ["season"]}
    rng = np.random.default_rng(4)
    cfg = random_config(rng, core=True)
    assert cfg["algo"] == "lgbm"
    assert cfg["horizon"] in (1, 2)
    assert cfg["features"] == ["season"]


def test_kaputte_env_faellt_auf_defaults(monkeypatch):
    monkeypatch.setenv("ML_CORE_ALGOS", "quatsch")
    monkeypatch.setenv("ML_CORE_FEATURE_GROUPS", "gibtsnicht")
    monkeypatch.setenv("ML_EXPLORE_FRAC", "keineZahl")
    space = core_space()
    assert space["algos"] == ["logreg"]
    assert space["groups"] == ["rates", "scores"]
    assert explore_frac() == pytest.approx(0.2)
