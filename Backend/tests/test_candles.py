"""Kontrollwerte für simple_candles (Performance-Chart im Währungs-Ranking)."""
import pandas as pd

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
