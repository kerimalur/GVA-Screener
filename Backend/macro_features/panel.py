"""Wöchentliches Feature-Panel für die ML-Engine.

Zeile = (week_start Montag, Währung). Alle Features sind zu week_start 00:00
real verfügbar (Release-Lags als Zeitreihen-Shift — identische Semantik wie
die Punkt-Funktionen in cot_factor/rates_factor/seasonality_factor, aber
vektorisiert über die volle Historie).

Targets: Forward-Log-Return des Währungskorbs (Währung vs. Ø aller 8, d.h.
cross-sektional demeaned) über 1/2/4 Wochen, verankert am letzten Kurs VOR
week_start (Freitag-Close) — kein Look-ahead im Anker.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import (
    CFTC_CODE,
    COT_RELEASE_LAG_DAYS,
    COT_Z_FULL_SCALE,
    COT_Z_MIN_PERIODS,
    COT_Z_WINDOW_WEEKS,
    FRED_FX,
    G8,
)
from .data_sources import fetch_cot_legacy, fetch_cot_tff, fetch_prices

HORIZONS = [1, 2, 4]

_LEGACY_CATS = {
    "noncomm": ("noncomm_long", "noncomm_short"),
    "comm": ("comm_long", "comm_short"),
    "retail": ("nonrept_long", "nonrept_short"),
}
_TFF_CATS = {
    "dealer": ("dealer_long", "dealer_short"),
    "asset": ("asset_long", "asset_short"),
    "lev": ("lev_long", "lev_short"),
}


def week_grid(start: str | pd.Timestamp, end: str | pd.Timestamp) -> pd.DatetimeIndex:
    return pd.date_range(pd.Timestamp(start), pd.Timestamp(end), freq="W-MON")


def _usd_leg_frame() -> pd.DataFrame:
    """Täglicher BASE→USD-Kurs je Währung (Spalten = G8, USD = 1.0)."""
    cols: dict[str, pd.Series] = {}
    for pair, sid in FRED_FX.items():
        s = fetch_prices(pair, sid).set_index("date")["close"]
        base, quote = pair[:3], pair[3:]
        cols[base if quote == "USD" else quote] = s if quote == "USD" else 1.0 / s
    df = pd.DataFrame(cols).sort_index()
    df["USD"] = 1.0
    return df[G8]


def _log_price_at_anchor(grid: pd.DatetimeIndex) -> pd.DataFrame:
    """Log-Kurs je Währung am Anker = letzter Kurs strikt VOR week_start."""
    legs = _usd_leg_frame()
    anchors = grid - pd.Timedelta(days=1)  # Sonntag → asof zieht Freitag-Close
    idx = legs.index.union(anchors)
    at = legs.reindex(idx).ffill().loc[anchors]
    at.index = grid
    return np.log(at)


def _targets(grid: pd.DatetimeIndex) -> pd.DataFrame:
    """Long-Format: week_start, ccy, fwd_ret_{h}w, label_{h}w."""
    logp = _log_price_at_anchor(grid)
    out = pd.DataFrame(
        [(w, c) for w in grid for c in G8], columns=["week_start", "ccy"]
    )
    for h in HORIZONS:
        fwd = logp.shift(-h) - logp                 # Log-Return je Währung vs. USD
        basket = fwd.sub(fwd.mean(axis=1), axis=0)  # vs. Ø-Korb (demeaned)
        long = basket.stack().rename(f"fwd_ret_{h}w").reset_index()
        long.columns = ["week_start", "ccy", f"fwd_ret_{h}w"]
        out = out.merge(long, on=["week_start", "ccy"], how="left")
        out[f"label_{h}w"] = out[f"fwd_ret_{h}w"].gt(0).where(
            out[f"fwd_ret_{h}w"].notna()
        )
    return out


def _cot_history(ccy: str) -> pd.DataFrame:
    """Volle COT-Feature-Historie einer Währung, Key = available_from."""
    code = CFTC_CODE[ccy]
    legacy = fetch_cot_legacy(code)
    f = pd.DataFrame({"report_date": legacy["date"]})
    for cat, (lo, sh) in _LEGACY_CATS.items():
        net = legacy[lo] - legacy[sh]
        f[f"{cat}_net"] = net
        f[f"{cat}_net_d1w"] = net.diff()
    prod = f["comm_net_d1w"] * f["noncomm_net_d1w"]
    f["cot_divergence"] = np.where(prod.isna(), np.nan, (prod < 0).astype(float))
    roll = f["comm_net"].rolling(COT_Z_WINDOW_WEEKS, min_periods=COT_Z_MIN_PERIODS)
    f["comm_z"] = (f["comm_net"] - roll.mean()) / roll.std()
    f["cot_score"] = (-f["comm_z"] / COT_Z_FULL_SCALE).clip(-1.0, 1.0)
    f["comm_net_pct156"] = f["comm_net"].rolling(156, min_periods=52).rank(pct=True)
    f["open_interest"] = legacy["open_interest"]
    f["oi_d1w"] = legacy["open_interest"].diff()

    tff = fetch_cot_tff(code)
    if not tff.empty:
        t = pd.DataFrame({"report_date": tff["date"]})
        for cat, (lo, sh) in _TFF_CATS.items():
            net = tff[lo] - tff[sh]
            t[f"{cat}_net"] = net
            t[f"{cat}_net_d1w"] = net.diff()
        f = f.merge(t, on="report_date", how="left")
    else:
        for cat in _TFF_CATS:
            f[f"{cat}_net"] = np.nan
            f[f"{cat}_net_d1w"] = np.nan

    f["available_from"] = f["report_date"] + pd.Timedelta(days=COT_RELEASE_LAG_DAYS)
    return f.sort_values("available_from").reset_index(drop=True)


def _cot_features(grid: pd.DatetimeIndex) -> pd.DataFrame:
    """Long-Format (week_start, ccy) × COT-Spalten via as-of-Merge."""
    weeks = pd.DataFrame({"week_start": grid})
    parts = []
    for ccy in G8:
        hist = _cot_history(ccy)
        m = pd.merge_asof(
            weeks, hist, left_on="week_start", right_on="available_from",
            direction="backward",
        )
        m["ccy"] = ccy
        parts.append(m.drop(columns=["available_from"]))
    out = pd.concat(parts, ignore_index=True)
    return out.rename(columns={"report_date": "cot_report_date"})


def build_feature_panel(
    start: str | pd.Timestamp = "1999-06-01",
    end: str | pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Panel (week_start, ccy) × Features × Targets."""
    end = pd.Timestamp(end) if end is not None else pd.Timestamp.today().normalize()
    grid = week_grid(start, end)
    panel = _targets(grid)
    panel = panel.merge(_cot_features(grid), on=["week_start", "ccy"], how="left")
    return panel.sort_values(["week_start", "ccy"]).reset_index(drop=True)
