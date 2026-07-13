"""Runner-Logik offline: Queue-Claim, Baseline-Seed, Metrics-Write (Fake-DB)."""
import numpy as np
import pandas as pd
import pytest

import ml_engine.run_experiments as runner


class FakeDB:
    def __init__(self):
        self.rows: list[dict] = []

    def select_all(self, table, params):
        assert table == "ml_experiments"
        out = self.rows
        if params.get("status") == "eq.queued":
            out = [r for r in out if r["status"] == "queued"]
        if params.get("status") == "eq.running":
            out = [r for r in out if r["status"] == "running"]
        if params.get("order") == "id.desc":
            out = sorted(out, key=lambda r: r["id"], reverse=True)
        if "limit" in params:
            out = out[: params["limit"]]
        return [dict(r) for r in out]

    def insert(self, table, row, **kw):
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
    assert len(done) == 4  # --max 4 abgearbeitet
    for r in done:
        assert "mean_hitrate" in r["metrics"]
        assert r["hall_score"] is None or isinstance(r["hall_score"], float)


def test_holdout_wird_abgeschnitten(monkeypatch):
    from tests.test_models_synthetic import _synth_panel
    panel = _synth_panel(signal=False, n_weeks=300)
    monkeypatch.setattr(runner, "build_feature_panel", lambda: panel)
    cut = runner._search_panel()
    expected_max = panel["week_start"].max() - pd.Timedelta(weeks=runner.HOLDOUT_WEEKS)
    assert cut["week_start"].max() < expected_max
