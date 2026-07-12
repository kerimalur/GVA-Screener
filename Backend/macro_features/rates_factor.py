"""Faktor 2 — Zinsen (mittelfristig).

Pro Währung aus FRED-Leitzins-/Geldmarktserien:
  - Zins-Level (letzter zu as_of verfügbarer Wert)
  - Zins-Differenzial gegenüber jeder der 7 anderen Währungen + Durchschnitt
  - Zins-Momentum: Änderung über ~6 Monate (hiking/cutting-Zyklus)
  - Score = clip(0.5 · diff_avg/2pp + 0.5 · mom_6m/100bps, −1, +1)

Look-ahead / Revision: FRED-CSV liefert nur revidierte Werte (Point-in-time
bräuchte ALFRED + API-Key). Leitzinsen sind Fakten und revisionsarm; die
OECD-Monatsserien erscheinen aber mit 1–2 Monaten Verzögerung. Deshalb gilt
eine Beobachtung erst ab obs_date + FRED_PUBLICATION_LAG_DAYS als verfügbar —
der Backtest wird dadurch eher zu pessimistisch als zu optimistisch.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import (
    FRED_POLICY_RATE,
    FRED_PUBLICATION_LAG_DAYS,
    G8,
    RATES_DIFF_FULL_SCALE,
    RATES_MOM_FULL_SCALE,
    RATES_MOMENTUM_MONTHS,
)
from .data_sources import fetch_fred


def _available(df: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    """Nur Beobachtungen, die zu as_of bereits veröffentlicht waren."""
    cutoff = as_of - pd.Timedelta(days=FRED_PUBLICATION_LAG_DAYS)
    return df[df["date"] <= cutoff]


def _rate_series(ccy: str, as_of: pd.Timestamp) -> pd.DataFrame:
    sid = FRED_POLICY_RATE.get(ccy)
    if not sid:
        return pd.DataFrame(columns=["date", "value"])
    return _available(fetch_fred(sid), as_of)


def _level_and_momentum(series: pd.DataFrame, as_of: pd.Timestamp) -> tuple[float, float]:
    """(Level, Δ über RATES_MOMENTUM_MONTHS) — NaN wenn Historie fehlt."""
    if series.empty:
        return np.nan, np.nan
    level = float(series["value"].iloc[-1])
    cutoff = series["date"].iloc[-1] - pd.DateOffset(months=RATES_MOMENTUM_MONTHS)
    past = series[series["date"] <= cutoff]
    momentum = level - float(past["value"].iloc[-1]) if not past.empty else np.nan
    return level, momentum


def compute_rates_factor(ccy: str, as_of: pd.Timestamp) -> dict:
    """Rohwerte + Score des Zins-Faktors einer Währung zum Zeitpunkt as_of.

    Für das Differenzial werden die Level aller 8 Währungen (as-of-gefiltert)
    berechnet; fehlende Gegenwährungen fallen aus dem Durchschnitt heraus.
    """
    levels: dict[str, float] = {}
    for c in G8:
        series = _rate_series(c, as_of)
        levels[c], _ = _level_and_momentum(series, as_of)

    own = _rate_series(ccy, as_of)
    level, momentum = _level_and_momentum(own, as_of)

    diffs = {
        f"rate_diff_{c}": (level - levels[c]) if pd.notna(level) and pd.notna(levels[c]) else np.nan
        for c in G8
        if c != ccy
    }
    valid = [v for v in diffs.values() if pd.notna(v)]
    diff_avg = float(np.mean(valid)) if valid else np.nan

    score = np.nan
    if pd.notna(diff_avg) or pd.notna(momentum):
        diff_part = 0.0 if pd.isna(diff_avg) else diff_avg / RATES_DIFF_FULL_SCALE
        mom_part = 0.0 if pd.isna(momentum) else momentum / RATES_MOM_FULL_SCALE
        score = float(np.clip(0.5 * diff_part + 0.5 * mom_part, -1.0, 1.0))

    return {
        "rate_level": level,
        "rate_obs_date": own["date"].iloc[-1] if not own.empty else pd.NaT,
        "rate_mom_6m": momentum,
        "rate_diff_avg": diff_avg,
        **diffs,
        "rates_score": score,
    }


if __name__ == "__main__":  # Selftest: Level + Diff-Symmetrie
    as_of = pd.Timestamp.today().normalize()
    rows = {c: compute_rates_factor(c, as_of) for c in G8}
    print(f"{'CCY':4s} {'Level':>6s} {'Mom6M':>7s} {'DiffAvg':>8s} {'Score':>6s}")
    for c, r in rows.items():
        print(
            f"{c:4s} {r['rate_level']:6.2f} {r['rate_mom_6m']:+7.2f} "
            f"{r['rate_diff_avg']:+8.2f} {r['rates_score']:+6.2f}"
        )
    # Symmetrie: Summe aller Durchschnitts-Differenziale ~ 0
    total = sum(r["rate_diff_avg"] for r in rows.values())
    print(f"\nSymmetrie-Check Summe(diff_avg) = {total:+.4f} (erwartet ~0)")
