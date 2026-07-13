"""Tests für macro_features.panel — Leak-Freiheit + Korb-Target-Mathematik."""
import numpy as np
import pandas as pd
import pytest

from macro_features.panel import build_feature_panel, HORIZONS
from macro_features.config import G8


@pytest.fixture(scope="module")
def panel() -> pd.DataFrame:
    # Fenster deckt alle LEAK_DATES ab; nutzt lokalen CSV-Cache
    return build_feature_panel("2013-01-01", "2024-12-31")


def test_panel_shape_und_index(panel):
    assert set(panel["ccy"].unique()) == set(G8)
    assert panel["week_start"].dt.weekday.eq(0).all()  # Montage
    # Pro Woche genau 8 Zeilen
    counts = panel.groupby("week_start")["ccy"].count()
    assert (counts == 8).all()


def test_targets_korb_summe_null(panel):
    # Demeaned: Summe der 8 Korb-Returns je Woche = 0 (wo alle 8 vorhanden)
    for h in HORIZONS:
        col = f"fwd_ret_{h}w"
        full = panel.groupby("week_start")[col].agg(["count", "sum"])
        full = full[full["count"] == 8]
        assert len(full) > 100
        assert np.allclose(full["sum"], 0.0, atol=1e-9)


def test_labels_vorzeichen(panel):
    m = panel["fwd_ret_4w"].notna()
    assert (panel.loc[m, "label_4w"] == (panel.loc[m, "fwd_ret_4w"] > 0)).all()


def test_targets_am_ende_nan(panel):
    last = panel["week_start"].max()
    tail = panel[panel["week_start"] > last - pd.Timedelta(weeks=4)]
    assert tail["fwd_ret_4w"].isna().all()


# ── Leak-Tests: Panel-Zeile == Punkt-Build (gleiche Quelle, gleiche Cutoffs) ──
from macro_features import build_feature_table

LEAK_DATES = ["2015-03-02", "2020-06-01", "2024-06-03"]  # Montage
COT_COLS = [
    "noncomm_net", "noncomm_net_d1w", "comm_net", "comm_net_d1w",
    "retail_net", "retail_net_d1w", "comm_z", "cot_score",
    "dealer_net", "dealer_net_d1w",
]


@pytest.fixture(scope="module")
def leak_refs():
    return {d: build_feature_table(pd.Timestamp(d)) for d in LEAK_DATES}


@pytest.mark.parametrize("as_of", LEAK_DATES)
def test_cot_leak_panel_gleich_punkt_build(panel, leak_refs, as_of):
    ts = pd.Timestamp(as_of)
    ref = leak_refs[as_of]
    rows = panel[panel["week_start"] == ts].set_index("ccy")
    assert len(rows) == 8
    for ccy in G8:
        for col in COT_COLS:
            a, b = rows.loc[ccy, col], ref.loc[ccy, col]
            if pd.isna(b):
                assert pd.isna(a), f"{ccy}.{col}: Panel {a}, Punkt NaN"
            else:
                assert a == pytest.approx(b, abs=1e-9), f"{ccy}.{col}"
