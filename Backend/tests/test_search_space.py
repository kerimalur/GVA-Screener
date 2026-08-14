"""Kern-Suchraum + Exploration.

Spec 2026-07-19-ml-engine-stabilisierung, erweitert am 2026-08-14.

Der Kern war auf {logreg} x {4W} x Teilmengen von {rates, scores} geschrumpft
— drei Feature-Kombinationen bei einem deterministischen Modell. Die Suche
stand deshalb ueber sechs Naechte still. Diese Datei haelt seither auch fest,
dass der Kern GROSS GENUG bleibt: `test_kern_ist_nicht_entartet` schlaegt an,
sobald jemand ihn wieder so weit zuschnuert, dass Weitersuchen sinnlos wird.
"""
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
        assert cfg["algo"] in ("logreg", "lgbm")
        assert cfg["horizon"] in (2, 4)
        assert set(cfg["features"]) <= {"rates", "scores", "season", "cot_tff"}
        assert len(cfg["features"]) >= 1
        assert cfg["space"] == "core"


def test_kern_ist_nicht_entartet(monkeypatch):
    """Der Kern muss genug Freiheitsgrade haben, dass Suchen etwas bringt.

    Genau hier lag der Fehler vom Juli: ein Kern mit drei Feature-Kombinationen
    und einem deterministischen Modell laesst sich in einer Nacht erschoepfen.
    Jede weitere Nacht findet dann garantiert dasselbe.
    """
    for var in ("ML_CORE_ALGOS", "ML_CORE_HORIZONS", "ML_CORE_FEATURE_GROUPS"):
        monkeypatch.delenv(var, raising=False)
    space = core_space()

    # Mindestens ein nicht-deterministisches Modell, sonst bringen mehrere
    # Seeds derselben Config kein neues Ergebnis.
    assert "lgbm" in space["algos"]

    moegliche_teilmengen = 2 ** len(space["groups"]) - 1
    kombinationen = len(space["algos"]) * len(space["horizons"]) * moegliche_teilmengen
    assert kombinationen >= 50, (
        f"Kern hat nur {kombinationen} Kombinationen — zu wenig zum Suchen."
    )

    rng = np.random.default_rng(7)
    gezogen = {
        (c["algo"], c["horizon"], tuple(c["features"]))
        for c in (random_config(rng, core=True) for _ in range(400))
    }
    assert len(gezogen) >= 30, f"nur {len(gezogen)} verschiedene Kern-Configs gezogen"


def test_logreg_c_ist_breit_gestreut():
    """Der C-Bereich muss ueber mehrere Groessenordnungen laufen.

    Lag der Sieger dauernd am Rand des Bereichs, ist das Optimum ausserhalb —
    und die Suche misst nur, wo man sie hat suchen lassen.
    """
    rng = np.random.default_rng(11)
    cs = [random_config(rng, core=True)["params"].get("C") for _ in range(500)]
    cs = [c for c in cs if c is not None]
    assert cs, "keine logreg-Config gezogen"
    assert min(cs) < 0.01, f"kleinstes C nur {min(cs)}"
    assert max(cs) > 100, f"groesstes C nur {max(cs)}"


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
    monkeypatch.delenv("ML_EXPLORE_FRAC", raising=False)  # Default 0.4
    rng = np.random.default_rng(3)
    spaces = [random_config(rng)["space"] for _ in range(400)]
    frac = spaces.count("explore") / len(spaces)
    assert 0.3 < frac < 0.5  # ~40 % Exploration, Rest Kern


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
    assert space["algos"] == ["logreg", "lgbm"]
    assert space["groups"] == ["rates", "scores", "season", "cot_tff"]
    assert explore_frac() == pytest.approx(0.4)
