"""Faktor 1 — COT (wöchentlich).

Pro Währung aus dem CFTC-Report des zugehörigen Futures:
  - Netto-Position (Level) je Kategorie: Non-Commercials, Commercials,
    Retail/Non-Reportables (Legacy) + Dealer (TFF; fehlt → NaN)
  - Δ1W je Kategorie gegenüber dem Vor-Report
  - Divergenz-Flag: Commercials und Non-Commercials bewegen sich gegenläufig
  - Score: Z-Score der Commercial-Netto-Position über ein 17-Jahres-Fenster,
    CONTRARIAN gewichtet → score = clip(−z / 2, −1, +1).
    Vorzeichen-Konvention (Spec): extreme Commercial-LONG-Positionierung
    (z stark positiv) liefert einen NEGATIVEN Beitrag zum Bullish-Score.
    Über `contrarian=False` invertierbar, damit die Feature-Importance-Analyse
    beide Lesarten isoliert testen kann.

Look-ahead: Reports tragen den Dienstags-Stand (report_date), veröffentlicht
Freitag → nutzbar erst ab report_date + COT_RELEASE_LAG_DAYS (config).
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
)
from .data_sources import fetch_cot_legacy, fetch_cot_tff


def _released(df: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    """Nur Reports, die zu as_of bereits veröffentlicht waren."""
    cutoff = as_of - pd.Timedelta(days=COT_RELEASE_LAG_DAYS)
    return df[df["date"] <= cutoff]


def _net(df: pd.DataFrame, long_col: str, short_col: str) -> pd.Series:
    return df[long_col] - df[short_col]


def compute_cot_factor(ccy: str, as_of: pd.Timestamp, contrarian: bool = True) -> dict:
    """Rohwerte + Score des COT-Faktors einer Währung zum Zeitpunkt as_of."""
    out: dict = {
        "cot_report_date": pd.NaT,
        "noncomm_net": np.nan, "noncomm_net_d1w": np.nan,
        "comm_net": np.nan, "comm_net_d1w": np.nan,
        "retail_net": np.nan, "retail_net_d1w": np.nan,
        "dealer_net": np.nan, "dealer_net_d1w": np.nan,
        "cot_divergence": np.nan,
        "comm_z": np.nan,
        "cot_score": np.nan,
    }
    code = CFTC_CODE.get(ccy)
    if not code:
        return out

    legacy = _released(fetch_cot_legacy(code), as_of)
    if len(legacy) >= 1:
        comm_net = _net(legacy, "comm_long", "comm_short")
        noncomm_net = _net(legacy, "noncomm_long", "noncomm_short")
        retail_net = _net(legacy, "nonrept_long", "nonrept_short")

        out["cot_report_date"] = legacy["date"].iloc[-1]
        out["comm_net"] = float(comm_net.iloc[-1])
        out["noncomm_net"] = float(noncomm_net.iloc[-1])
        out["retail_net"] = float(retail_net.iloc[-1])

        if len(legacy) >= 2:
            d_comm = float(comm_net.iloc[-1] - comm_net.iloc[-2])
            d_noncomm = float(noncomm_net.iloc[-1] - noncomm_net.iloc[-2])
            out["comm_net_d1w"] = d_comm
            out["noncomm_net_d1w"] = d_noncomm
            out["retail_net_d1w"] = float(retail_net.iloc[-1] - retail_net.iloc[-2])
            # Divergenz: beide bewegen sich, aber in entgegengesetzte Richtung
            out["cot_divergence"] = bool(d_comm * d_noncomm < 0)

        # Z-Score der Commercial-Netto-Position, 17J-Rolling (as-of-sauber:
        # Fenster endet an der letzten veröffentlichten Woche)
        roll = comm_net.rolling(COT_Z_WINDOW_WEEKS, min_periods=COT_Z_MIN_PERIODS)
        mean, std = roll.mean().iloc[-1], roll.std().iloc[-1]
        if pd.notna(std) and std > 0:
            z = (float(comm_net.iloc[-1]) - float(mean)) / float(std)
            out["comm_z"] = z
            sign = -1.0 if contrarian else 1.0
            out["cot_score"] = float(np.clip(sign * z / COT_Z_FULL_SCALE, -1.0, 1.0))

    tff = _released(fetch_cot_tff(code), as_of)
    if len(tff) >= 1 and tff[["dealer_long", "dealer_short"]].notna().all(axis=1).iloc[-1]:
        dealer_net = _net(tff, "dealer_long", "dealer_short")
        out["dealer_net"] = float(dealer_net.iloc[-1])
        if len(tff) >= 2:
            out["dealer_net_d1w"] = float(dealer_net.iloc[-1] - dealer_net.iloc[-2])

    return out


if __name__ == "__main__":  # Selftest: EUR, Vorzeichen-Logik sichtbar
    as_of = pd.Timestamp.today().normalize()
    r = compute_cot_factor("EUR", as_of)
    for k, v in r.items():
        print(f"{k:18s}: {v}")
    print(
        "\nVorzeichen-Check: comm_z "
        f"{r['comm_z']:+.2f} -> contrarian Score {r['cot_score']:+.2f} "
        "(z>0 => Score<0 erwartet)" if pd.notna(r["comm_z"]) else "keine Daten"
    )
