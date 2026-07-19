"""Runner-Logik offline: Queue-Claim, Baseline-Seed, Metrics-Write (Fake-DB)."""
import numpy as np
import pandas as pd
import pytest

import ml_engine.run_experiments as runner


class FakeDB:
    def __init__(self):
        self.rows: list[dict] = []
        self.nights: list[dict] = []  # ml_engine_nights (Nacht-Zusammenfassung)

    def select_all(self, table, params):
        if table == "ml_engine_nights":
            # Hysterese-Historie: Naechte VOR heute, absteigend
            return [dict(n) for n in sorted(self.nights, key=lambda n: n["night"], reverse=True)
                    if not params.get("night") or n["night"] < params["night"].split("lt.")[1]]
        assert table == "ml_experiments"
        out = self.rows
        if params.get("status") == "eq.queued":
            out = [r for r in out if r["status"] == "queued"]
        if params.get("status") == "eq.running":
            out = [r for r in out if r["status"] == "running"]
        if params.get("status") == "eq.done":
            out = [r for r in out if r["status"] == "done"]
        if params.get("order") == "id.desc":
            out = sorted(out, key=lambda r: r["id"], reverse=True)
        if "limit" in params:
            out = out[: params["limit"]]
        return [dict(r) for r in out]

    def insert(self, table, row, **kw):
        if table == "ml_engine_nights":
            self.nights.append(dict(row))
            return
        self.rows.append({"id": len(self.rows) + 1, **row})

    def update(self, table, match, patch):
        target = int(match["id"].split(".")[1])
        for r in self.rows:
            if r["id"] == target:
                r.update(patch)


@pytest.fixture
def fake_env(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(runner.db, "select_all", db.select_all)
    monkeypatch.setattr(runner.db, "insert", db.insert)
    monkeypatch.setattr(runner.db, "update", db.update)

    # synthetisches Such-Panel statt echtem Datenabruf
    from tests.test_models_synthetic import _synth_panel
    panel = _synth_panel(signal=True, n_weeks=500)
    for h in [1, 2]:  # Runner-Configs können h=1/2 ziehen
        panel[f"fwd_ret_{h}w"] = panel["fwd_ret_4w"]
        panel[f"label_{h}w"] = panel["label_4w"]
    monkeypatch.setattr(runner, "_search_panel", lambda: panel)
    return db


def test_runner_seedet_baseline_und_schreibt_metrics(fake_env, monkeypatch):
    monkeypatch.setattr("sys.argv", ["run_experiments", "--max", "4"])
    monkeypatch.setenv("ML_BUDGET_MIN", "10")
    runner.main()

    baselines = [r for r in fake_env.rows if r["config"]["algo"] == "baseline"]
    assert len(baselines) == 3  # je Horizont eins geseedet
    done = [r for r in fake_env.rows if r.get("status") == "done"]
    assert len(done) == 4  # --max 4 abgearbeitet (kein Re-Seed im Smoke-Test)
    for r in done:
        assert "mean_hitrate" in r["metrics"]
        assert r["hall_score"] is None or isinstance(r["hall_score"], float)
    assert len(fake_env.nights) == 1  # Nacht-Zusammenfassung genau einmal geschrieben

    # Durchreichen (Spec 2026-07-19): mean/std des ROHEN Besten + stabile Linie
    night = fake_env.nights[0]
    best = max((r for r in done if r["hall_score"] is not None), key=lambda r: r["hall_score"])
    assert night["mean_hitrate"] == pytest.approx(best["metrics"]["mean_hitrate"], abs=1e-6)
    assert night["std_hitrate"] == pytest.approx(best["metrics"]["std_hitrate"], abs=1e-6)
    assert night["best_hall"] == pytest.approx(best["hall_score"], abs=1e-6)  # roh unveraendert
    assert night["stable_config"] is not None  # Initialisierung in Nacht 1
    assert night["stable_config"]["algo"] != "baseline"


def test_reseed_wiederholt_top_configs_mit_neuen_seeds(fake_env, monkeypatch):
    monkeypatch.setenv("ML_SEED_REPEATS", "3")
    monkeypatch.setenv("ML_TOPK_RESEED", "1")
    panel = runner._search_panel()
    rng = np.random.default_rng(7)

    cfg = {"algo": "logreg", "horizon": 4, "features": ["scores"],
           "params": {"C": 1.0}, "seed": 1, "space": "core"}
    fake_env.insert("ml_experiments", {"status": "done", "config": cfg, "seed": 1,
                                       "hall_score": 0.52, "metrics": {}})
    runner._reseed_top_configs(panel, rng, "test")

    same = [r for r in fake_env.rows
            if r["config"].get("algo") == "logreg" and r["config"].get("params") == {"C": 1.0}]
    assert len(same) == 3  # 1 Original + 2 zusaetzliche Seeds
    assert len({r["config"]["seed"] for r in same}) == 3  # wirklich verschiedene Seeds
    assert all(r["status"] == "done" for r in same)


def test_holdout_wird_abgeschnitten(monkeypatch):
    from tests.test_models_synthetic import _synth_panel
    panel = _synth_panel(signal=False, n_weeks=300)
    monkeypatch.setattr(runner, "build_feature_panel", lambda: panel)
    cut = runner._search_panel()
    expected_max = panel["week_start"].max() - pd.Timedelta(weeks=runner.HOLDOUT_WEEKS)
    assert cut["week_start"].max() < expected_max
