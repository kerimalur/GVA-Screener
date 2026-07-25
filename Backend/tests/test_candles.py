"""Kontrollwerte für simple_candles (Performance-Chart im Währungs-Ranking)."""
import threading

import pandas as pd
import pytest

import data_pipeline
from data_pipeline import simple_candles


def _df():
    # Jun 1 2026 = Montag -> Jun 1-3 (Mo-Mi) = Woche 1, Jun 8-9 = Woche 2.
    idx = pd.to_datetime(
        ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-08", "2026-06-09"]
    )
    return pd.DataFrame(
        {
            "open": [1.0, 1.1, 1.2, 1.3, 1.4],
            "high": [1.05, 1.15, 1.25, 1.35, 1.45],
            "low": [0.95, 1.05, 1.15, 1.25, 1.35],
            "close": [1.1, 1.2, 1.15, 1.4, 1.42],
        },
        index=idx,
    )


def test_daily_passthrough_and_since():
    out = simple_candles(_df(), "D", "2026-06-03")
    assert [c["time"] for c in out] == ["2026-06-03", "2026-06-08", "2026-06-09"]
    assert out[0]["close"] == 1.15


def test_weekly_resample():
    out = simple_candles(_df(), "W", "")
    assert len(out) == 2
    # Woche 1 aggregiert Jun 1-3
    assert out[0]["open"] == 1.0 and out[0]["close"] == 1.15
    assert out[0]["high"] == 1.25 and out[0]["low"] == 0.95
    # Woche 2 aggregiert Jun 8-9
    assert out[1]["open"] == 1.3 and out[1]["close"] == 1.42


def test_empty():
    assert simple_candles(pd.DataFrame(), "D", "") == []


@pytest.fixture
def leere_cache(monkeypatch):
    """Isolierter Kerzen-Cache pro Test (Prozess-global sonst klebrig)."""
    monkeypatch.setattr(data_pipeline, "_DAILY_CACHE", {})
    monkeypatch.setattr(data_pipeline, "_DAILY_LOCKS", {})
    monkeypatch.setattr(data_pipeline, "OANDA_API_KEY", "test-key")


class _FakeResponse:
    def __init__(self, candles):
        self._candles = candles

    def raise_for_status(self):
        pass

    def json(self):
        return {"candles": self._candles}


def _oanda_candles(n=3):
    # 2026-06-01..03 (Mo-Mi), UNIX-Sekunden minus 12h (fetch addiert +12h)
    tage = pd.date_range("2026-06-01", periods=n, freq="B") - pd.Timedelta(hours=12)
    return [
        {
            "complete": True,
            "time": str(t.timestamp()),
            "mid": {"o": "1.0", "h": "1.1", "l": "0.9", "c": "1.05"},
            "volume": 10,
        }
        for t in tage
    ]


def test_single_flight_bundelt_parallele_fetches(leere_cache, monkeypatch):
    """20 Pairs × D+W trafen früher als je eigener OANDA-Call ein — das war der
    Grund für die minutenlangen Ladezeiten. Parallel = genau EIN Request."""
    calls = []
    start = threading.Barrier(4)

    def fake_get(url, headers=None, params=None, timeout=None):
        calls.append(params["count"])
        return _FakeResponse(_oanda_candles())

    monkeypatch.setattr(data_pipeline.requests, "get", fake_get)

    def hole():
        start.wait(timeout=5)
        data_pipeline.fetch_daily_oanda("EURUSD", count=500)

    threads = [threading.Thread(target=hole) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert len(calls) == 1


def test_daily_for_candles_nutzt_warme_5000er_cache(leere_cache, monkeypatch):
    warm = pd.DataFrame({"open": [1.0], "high": [1.0], "low": [1.0], "close": [1.0]},
                        index=pd.to_datetime(["2026-06-01"]))
    data_pipeline._DAILY_CACHE[("EURUSD", 5000)] = (
        data_pipeline.time.monotonic(), warm, data_pipeline._DAILY_TTL_SEC
    )

    def boom(*a, **k):
        raise AssertionError("darf keinen OANDA-Call machen")

    monkeypatch.setattr(data_pipeline.requests, "get", boom)
    assert data_pipeline.daily_for_candles("EURUSD", "2026-05-01").equals(warm)


def test_daily_for_candles_holt_nur_den_seit_since_noetigen_ausschnitt(
    leere_cache, monkeypatch
):
    counts = []

    def fake_get(url, headers=None, params=None, timeout=None):
        counts.append(params["count"])
        return _FakeResponse(_oanda_candles())

    monkeypatch.setattr(data_pipeline.requests, "get", fake_get)
    seit = (pd.Timestamp.now().normalize() - pd.Timedelta(days=40)).strftime("%Y-%m-%d")
    data_pipeline.daily_for_candles("EURUSD", seit)
    assert counts == [120]  # Untergrenze statt 5000

    counts.clear()
    data_pipeline.daily_for_candles("GBPUSD", "")
    assert counts == [5000]  # ohne Startpunkt volle Historie
