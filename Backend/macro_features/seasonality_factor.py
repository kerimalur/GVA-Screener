"""Faktor 3 — Saisonalität (langfristig-statistisch).

Währungs-Monatsreturn = Ø der ccy-relativen Log-Monatsreturns über die
7 Pairs der Währung (Quote-Seite negiert; Kreuze synthetisch aus den
USD-Majors). Bewusst MONATS-Buckets (12), nicht Kalenderwochen —
Overfitting-Schutz.

Konsistenz-Filter: Score nur aktiv, wenn in mindestens
SEASONALITY_MIN_HIT_YEARS von SEASONALITY_YEARS Jahren (12/17) die Richtung
des Monats gleich war UND volle 17 Jahre Historie vorliegen; sonst 0.0
(neutral). Rohwerte bleiben immer sichtbar.

Look-ahead: nur Monate, die vor as_of vollständig abgeschlossen sind —
der Score für „Monat von as_of" speist sich ausschließlich aus den
17 früheren Vorkommen dieses Kalendermonats.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import (
    FRED_FX,
    G8,
    FX_PAIRS,
    SEASON_RET_FULL_SCALE,
    SEASONALITY_MIN_HIT_YEARS,
    SEASONALITY_YEARS,
)
from .data_sources import fetch_prices


def _usd_legs() -> dict[str, pd.Series]:
    """BASE→USD-Kurs je Nicht-USD-Währung (Index: Datum)."""
    legs: dict[str, pd.Series] = {}
    for pair, sid in FRED_FX.items():
        df = fetch_prices(pair, sid)
        s = df.set_index("date")["close"]
        base, quote = pair[:3], pair[3:]
        if quote == "USD":  # z. B. EURUSD: direkt EUR→USD
            legs[base] = s
        else:  # z. B. USDJPY: JPY→USD = 1/Kurs
            legs[quote] = 1.0 / s
    legs["USD"] = None  # type: ignore[assignment]  # Marker: Kurs 1
    return legs


def _pair_series(pair: str, legs: dict[str, pd.Series]) -> pd.Series | None:
    """Synthetischer Pair-Kurs BASE/QUOTE aus den USD-Beinen."""
    base, quote = pair[:3], pair[3:]
    b, q = legs.get(base), legs.get(quote)
    if base == "USD":
        return (1.0 / q).dropna() if q is not None else None
    if quote == "USD":
        return b.dropna() if b is not None else None
    if b is None or q is None:
        return None
    return (b / q).dropna()


def _monthly_log_returns(s: pd.Series) -> pd.Series:
    """Log-Monatsreturns in % aus Monats-Schlusskursen."""
    monthly = s.resample("ME").last().dropna()
    return np.log(monthly / monthly.shift(1)).dropna() * 100


def build_ccy_monthly_returns(as_of: pd.Timestamp) -> pd.DataFrame:
    """Panel: Zeile = abgeschlossener Monat (< as_of-Monat), Spalte = Währung.

    Wert = Ø ccy-relativer Log-Monatsreturn (%) über die 7 Pairs der Währung.
    """
    legs = _usd_legs()
    pair_rets: dict[str, pd.Series] = {}
    for pair in FX_PAIRS:
        s = _pair_series(pair, legs)
        if s is not None and len(s) > 30:
            pair_rets[pair] = _monthly_log_returns(s)

    out: dict[str, pd.Series] = {}
    for ccy in G8:
        parts = []
        for pair, rets in pair_rets.items():
            if pair[:3] == ccy:
                parts.append(rets)
            elif pair[3:] == ccy:
                parts.append(-rets)
        out[ccy] = (
            pd.concat(parts, axis=1, sort=True).mean(axis=1) if parts else pd.Series(dtype=float)
        )

    panel = pd.DataFrame(out)
    # nur Monate, die vor as_of vollständig abgeschlossen sind
    month_start = as_of.normalize().replace(day=1)
    return panel[panel.index < month_start]


def monthly_stats(ccy: str, panel: pd.DataFrame) -> pd.DataFrame:
    """12 Buckets: mean_ret, hit_years (Mehrheitsrichtung), n_years (17J-Fenster)."""
    s = panel[ccy].dropna()
    rows = []
    for month in range(1, 13):
        vals = s[s.index.month == month].tail(SEASONALITY_YEARS)
        n = len(vals)
        pos = int((vals > 0).sum())
        neg = int((vals < 0).sum())
        rows.append({
            "month": month,
            "mean_ret": float(vals.mean()) if n else np.nan,
            "hit_years": max(pos, neg) if n else 0,
            "n_years": n,
        })
    return pd.DataFrame(rows).set_index("month")


def compute_seasonality_factor(ccy: str, as_of: pd.Timestamp, panel: pd.DataFrame) -> dict:
    """Rohwerte + Score des Saisonalitäts-Faktors für den Monat von as_of."""
    stats = monthly_stats(ccy, panel)
    m = int(as_of.month)
    row = stats.loc[m]
    n, hit, mean_ret = int(row["n_years"]), int(row["hit_years"]), row["mean_ret"]

    active = n >= SEASONALITY_YEARS and hit >= SEASONALITY_MIN_HIT_YEARS and pd.notna(mean_ret)
    score = float(np.clip(mean_ret / SEASON_RET_FULL_SCALE, -1.0, 1.0)) if active else 0.0

    return {
        "season_month": m,
        "season_mean_ret": mean_ret,
        "season_hit_years": hit,
        "season_n_years": n,
        "season_active": bool(active),
        "season_score": score,
    }


if __name__ == "__main__":  # Selftest: Buckets + Filter-Wirkung
    as_of = pd.Timestamp.today().normalize()
    panel = build_ccy_monthly_returns(as_of)
    print(f"Panel: {len(panel)} Monate  {panel.index.min():%Y-%m} ... {panel.index.max():%Y-%m}\n")
    for ccy in G8:
        r = compute_seasonality_factor(ccy, as_of, panel)
        flag = "AKTIV " if r["season_active"] else "neutral"
        print(
            f"{ccy}: Monat {r['season_month']:2d}  mean {r['season_mean_ret']:+.3f}%  "
            f"hit {r['season_hit_years']}/{r['season_n_years']}  {flag} score {r['season_score']:+.2f}"
        )
    stats = monthly_stats("AUD", panel)
    aktiv = ((stats["hit_years"] >= SEASONALITY_MIN_HIT_YEARS) & (stats["n_years"] >= SEASONALITY_YEARS)).sum()
    print(f"\nAUD: {aktiv} von 12 Monaten erfuellen den Konsistenz-Filter")
