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
from .gva_history import normalize_pair


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


def _pair_bias_wide(bq: int, qq: int) -> str:
    """Weite Regel NUR für Replay-Hits (Kerims Vorgabe): auch Q2/Q4 zählen als
    Richtung, nur Q3 ist neutral. Relativer Vergleich der beiden Quintile —
    Basis stärker (höheres Q) => long, schwächer => short, gleich => neutral.
    Das Währungs-Ranking bleibt bewusst bei der strikten Q5/Q1-Regel."""
    if bq > qq:
        return "long"
    if bq < qq:
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


def fundamental_track(instrument: str, weeks: int = 52) -> dict:
    """Pro Pair: die letzten `weeks` Wochen-Q-Scores (as-of, Baseline) beider
    Währungen + ob der Markt danach 1W/4W in Bias-Richtung lief. Reine
    Inspektion (kein Backtest-Engine) — zeigt, wie gut der Score kalibriert war.

    Bias-Richtung: _pair_bias(base_q, quote_q). ret = Close-to-Close des Pairs
    über 1 bzw. 4 Wochen ab Wochen-Start. Treffer = Vorzeichen passt zum Bias
    (neutral => kein Treffer-Zähler).
    """
    from data_pipeline import fetch_daily_oanda

    inst = normalize_pair(instrument)
    flat = inst.replace("_", "")
    base, quote = flat[:3], flat[3:6]
    # Vorlauf für die 4W-Forward-Fenster der jüngsten Wochen
    lo = (pd.Timestamp.today() - pd.Timedelta(weeks=weeks + 6)).normalize()
    hi = pd.Timestamp.today().normalize()
    series = ranking_series(inst, str(lo.date()), str(hi.date()))
    if not series:
        return {"pair": inst, "base_ccy": base, "quote_ccy": quote, "weeks": [], "summary": {}}

    daily = fetch_daily_oanda(inst, count=5000)
    close = daily["close"] if not daily.empty else pd.Series(dtype=float)

    def close_at(ts: pd.Timestamp) -> float | None:
        if close.empty:
            return None
        sub = close[close.index >= ts]
        return float(sub.iloc[0]) if not sub.empty else None

    rows: list[dict] = []
    for r in series:
        wk = pd.Timestamp(r["week_start"])
        c0 = close_at(wk)
        bias = r["bias"]
        row = {
            "week_start": r["week_start"],
            "base_q": r["base"]["quintile"],
            "base_score": r["base"]["score"],
            "quote_q": r["quote"]["quintile"],
            "quote_score": r["quote"]["score"],
            "bias": bias,
        }
        for label, wks in (("1w", 1), ("4w", 4)):
            cN = close_at(wk + pd.Timedelta(weeks=wks)) if c0 is not None else None
            if c0 is None or cN is None or c0 == 0:
                row[f"ret_{label}"] = None
                row[f"hit_{label}"] = None
                continue
            ret = (cN - c0) / c0
            row[f"ret_{label}"] = round(ret * 100, 2)  # Prozent
            if bias == "long":
                row[f"hit_{label}"] = ret > 0
            elif bias == "short":
                row[f"hit_{label}"] = ret < 0
            else:
                row[f"hit_{label}"] = None  # neutral zählt nicht
        rows.append(row)

    rows = rows[-weeks:]

    def summarize(label: str) -> dict:
        decided = [r[f"hit_{label}"] for r in rows if r[f"hit_{label}"] is not None]
        n = len(decided)
        hits = sum(1 for h in decided if h)
        return {"n": n, "hits": hits, "rate": round(hits / n * 100, 1) if n else None}

    return {
        "pair": inst,
        "base_ccy": base,
        "quote_ccy": quote,
        "weeks": rows,
        "summary": {"h1": summarize("1w"), "h4": summarize("4w")},
    }


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
            # Replay-Hits: weite Regel (Q2/Q4 zählen, nur Q3 neutral)
            "bias": _pair_bias_wide(b["quintile"], q["quintile"]),
        }
    except Exception:
        return None  # Ranking ist Zusatzinfo — Hits müssen auch ohne laden
