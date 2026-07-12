"""Feature-Tabelle: 8 Währungen × (3 Sub-Scores + Rohwerte).

Die drei Sub-Scores (cot_score, rates_score, season_score) bleiben einzeln
sichtbar — sie sind die Confluence-Grundlage. `avg_score` ist REIN der
Sortierschlüssel (stark long → stark short), keine Blackbox-Verdichtung.
`confluence` zählt gleichgerichtete Sub-Scores mit |s| >= 0.15.

Wöchentliche Aktualisierung: einfach erneut aufrufen (Cache lädt bei Bedarf
frische Rohdaten). Für Backtests: `as_of` setzen — alle drei Faktoren nutzen
dann ausschließlich Daten, die zu diesem Zeitpunkt real verfügbar waren.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import G8
from .cot_factor import compute_cot_factor
from .rates_factor import compute_rates_factor
from .seasonality_factor import build_ccy_monthly_returns, compute_seasonality_factor

SCORE_COLS = ["cot_score", "rates_score", "season_score"]


def _confluence(row: pd.Series, threshold: float = 0.15) -> int:
    """Max. Anzahl gleichgerichteter Sub-Scores (|s| >= threshold)."""
    signs = [np.sign(row[c]) for c in SCORE_COLS if pd.notna(row[c]) and abs(row[c]) >= threshold]
    if not signs:
        return 0
    return max(signs.count(1.0), signs.count(-1.0))


def build_feature_table(as_of: pd.Timestamp | str | None = None) -> pd.DataFrame:
    """Feature-Tabelle aller 8 Währungen zum Zeitpunkt as_of (Default: heute)."""
    as_of = pd.Timestamp(as_of).normalize() if as_of is not None else pd.Timestamp.today().normalize()

    season_panel = build_ccy_monthly_returns(as_of)
    rows = {}
    for ccy in G8:
        rows[ccy] = {
            **compute_cot_factor(ccy, as_of),
            **compute_rates_factor(ccy, as_of),
            **compute_seasonality_factor(ccy, as_of, season_panel),
        }

    df = pd.DataFrame.from_dict(rows, orient="index")
    df.index.name = "ccy"
    df["avg_score"] = df[SCORE_COLS].mean(axis=1, skipna=True)
    df["confluence"] = df.apply(_confluence, axis=1)
    df.attrs["as_of"] = str(as_of.date())

    # Sub-Scores + Sortierhilfen nach vorn, Rohwerte dahinter
    front = SCORE_COLS + ["avg_score", "confluence"]
    df = df[front + [c for c in df.columns if c not in front]]
    return df.sort_values("avg_score", ascending=False)


def export_csv(df: pd.DataFrame, path: str) -> None:
    df.to_csv(path, float_format="%.4f")
