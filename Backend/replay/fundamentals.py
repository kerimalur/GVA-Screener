"""As-of-Währungs-Ranking für Replay-Hits.

Für ein historisches Hit-Datum: Baseline-Score (Zins+Saison, identisch zur
ML-Engine) + Konfidenz-Quintil beider Pair-Währungen — nur mit Daten, die
damals real verfügbar waren (macro_features-Panel ist as-of-sauber).

Panel wird einmal pro Prozess gebaut (lru_cache); auf Render kostet der
erste Aufruf nach Kaltstart die Daten-Fetches, danach Lookups in ms.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd

from macro_features.panel import build_feature_panel
from ml_engine.baseline import baseline_scores
from ml_engine.run_weekly import QUANTILE_WINDOW_WEEKS, quintile_of


@lru_cache(maxsize=1)
def _panel() -> pd.DataFrame:
    return build_feature_panel()


def _side(panel: pd.DataFrame, week: pd.Timestamp, ccy: str) -> dict | None:
    rows = panel[(panel["week_start"] == week) & (panel["ccy"] == ccy)]
    if rows.empty:
        return None
    score = float(baseline_scores(rows)[0])
    hist_cut = week - pd.Timedelta(weeks=QUANTILE_WINDOW_WEEKS)
    hist = panel[(panel["week_start"] >= hist_cut) & (panel["week_start"] < week)]
    q = quintile_of(score, np.asarray(baseline_scores(hist)))
    return {"ccy": ccy, "score": round(score, 4), "quintile": q}


def _pair_bias(bq: int, qq: int) -> str:
    """Rückenwind-Logik identisch zu derivePairIdeas (frontend lib/ml/ranking.ts)."""
    b5, b1, q5, q1 = bq == 5, bq == 1, qq == 5, qq == 1
    if (b5 and q5) or (b1 and q1):
        return "neutral"  # beide Seiten gleich extrem → kein relativer Vorteil
    if b5 and q1:
        return "long"
    if b1 and q5:
        return "short"
    if b5 or q1:
        return "long"
    if b1 or q5:
        return "short"
    return "neutral"


def ranking_series(instrument: str, date_from: str, date_to: str) -> list[dict]:
    """Alle Wochen-Rankings eines Pairs im Zeitraum — fürs Vorab-Laden im
    Backtest-Lab (ein Request statt ein Lookup pro Trade-Datum)."""
    try:
        panel = _panel()
        flat = instrument.replace("_", "")
        base, quote = flat[:3], flat[3:6]
        lo = pd.Timestamp(date_from)
        hi = pd.Timestamp(date_to)
        weeks = sorted(w for w in panel["week_start"].unique() if lo <= w <= hi)
        out = []
        for week in weeks:
            b = _side(panel, week, base)
            q = _side(panel, week, quote)
            if b is None or q is None:
                continue
            out.append({
                "week_start": str(pd.Timestamp(week).date()),
                "base": b,
                "quote": q,
                "bias": _pair_bias(b["quintile"], q["quintile"]),
            })
        return out
    except Exception:
        return []


def ranking_snapshot(instrument: str, hit_date: str) -> dict | None:
    """As-of-Ranking beider Pair-Währungen zur Woche des Hits; None bei Fehlern."""
    try:
        panel = _panel()
        d = pd.Timestamp(hit_date)
        week = (d - pd.Timedelta(days=int(d.weekday()))).normalize()  # Montag der Hit-Woche
        weeks = panel["week_start"]
        if not (weeks == week).any():
            past = weeks[weeks <= week]
            if past.empty:
                return None
            week = past.max()
        flat = instrument.replace("_", "")
        base, quote = flat[:3], flat[3:6]
        b = _side(panel, week, base)
        q = _side(panel, week, quote)
        if b is None or q is None:
            return None
        return {
            "week_start": str(week.date()),
            "base": b,
            "quote": q,
            "bias": _pair_bias(b["quintile"], q["quintile"]),
        }
    except Exception:
        return None  # Ranking ist Zusatzinfo — Hits müssen auch ohne laden
