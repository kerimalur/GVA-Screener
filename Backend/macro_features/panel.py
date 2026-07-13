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

from .config import FRED_FX, G8
from .data_sources import fetch_prices

HORIZONS = [1, 2, 4]


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


def build_feature_panel(
    start: str | pd.Timestamp = "1999-06-01",
    end: str | pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Panel (week_start, ccy) × Features × Targets."""
    end = pd.Timestamp(end) if end is not None else pd.Timestamp.today().normalize()
    grid = week_grid(start, end)
    panel = _targets(grid)
    return panel.sort_values(["week_start", "ccy"]).reset_index(drop=True)
