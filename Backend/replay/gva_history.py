"""Historische GVA-Hit-Rekonstruktion aus `price_daily` (Supabase).

Statt Live-OANDA-Daten (begrenzte Historie) werden die Tageskerzen aus
Supabase geladen und mit EXAKT derselben Business-Day-Matrix wie in
`data_pipeline.fetch_and_resample_3d` auf 3D-Kerzen resampled
(Anker 2026-04-21, np.busday_count // 3). Die Muster-/Linien-Logik ist
1:1 aus `analyzer.analyze_gva_zones` portiert — aber statt nur die aktuell
aktiven Linien zurückzugeben, wird JEDER Hit (Berührung einer Linie)
chronologisch gesammelt.

analyzer.py / data_pipeline.py bleiben unverändert.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from ml.db import select_all

# Identisch zu data_pipeline.py — der bewiesene TV-Anker (Dienstag).
BUSDAY_ANCHOR = np.datetime64("2026-04-21")

# Muster-Parameter — identisch zu compute_zones() in main.py.
TOL_PIPS = 2.5
SIZE_MULT = 1.3

# Vorlauf vor dem angefragten Zeitraum, damit Linien die vor dem Zeitraum
# gebildet wurden (und im Zeitraum gehittet werden) existieren.
WARMUP_DAYS = 183  # ~6 Monate


def normalize_pair(pair: str) -> str:
    """'EURUSD' / 'EUR/USD' / 'EUR_USD' -> 'EUR_USD' (price_daily-Notation)."""
    p = pair.upper().replace("/", "_")
    if "_" not in p and len(p) == 6:
        p = p[:3] + "_" + p[3:]
    return p


def pip_size_of(instrument: str) -> float:
    return 0.01 if "JPY" in instrument else 0.0001


def fetch_daily(instrument: str, date_from: str, date_to: str) -> pd.DataFrame:
    """Tageskerzen aus price_daily, chronologisch. Index = DatetimeIndex."""
    rows = select_all(
        "price_daily",
        {
            "select": "date,open,high,low,close",
            "instrument": f"eq.{instrument}",
            # zwei Filter auf derselben Spalte -> Listen-Param (requests serialisiert beide)
            "date": [f"gte.{date_from}", f"lte.{date_to}"],
            "order": "date.asc",
        },
    )
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["time"] = pd.to_datetime(df["date"])
    df = df.dropna(subset=["open", "high", "low", "close"])
    for col in ("open", "high", "low", "close"):
        df[col] = df[col].astype(float)
    df = df.set_index("time").sort_index()
    return df[["open", "high", "low", "close"]]


def resample_3d(df: pd.DataFrame) -> pd.DataFrame:
    """EXAKT dieselbe 3D-Logik wie data_pipeline.fetch_and_resample_3d:
    Wochenenden raus, Business-Day-Matrix mit Anker 2026-04-21, // 3."""
    if df.empty:
        return df
    df = df[df.index.dayofweek < 5].copy()
    dates = df.index.values.astype("datetime64[D]")
    df["block_id"] = np.busday_count(BUSDAY_ANCHOR, dates) // 3
    df_3d = df.groupby("block_id").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last"}
    )
    df_3d.index = df.groupby("block_id").apply(lambda x: x.index.min())
    return df_3d.sort_index().dropna()


def collect_hits(df_3d: pd.DataFrame, instrument: str) -> list[dict]:
    """Portierte analyze_gva_zones-Loop, die jeden Hit sammelt.

    Reihenfolge je Kerze wie im Original: erst Hits gegen aktive Linien
    prüfen, dann berührte Linien entfernen, dann neue Linien bilden.
    Jede Linie wird genau einmal gehittet (danach entfernt).
    """
    if df_3d.empty or len(df_3d) < 2:
        return []

    tol = TOL_PIPS * pip_size_of(instrument)
    active_shorts: list[dict] = []
    active_longs: list[dict] = []
    hits: list[dict] = []

    for i in range(1, len(df_3d)):
        prev = df_3d.iloc[i - 1]
        curr = df_3d.iloc[i]
        curr_time = df_3d.index[i]

        prev_bull = prev["close"] > prev["open"]
        prev_bear = prev["close"] < prev["open"]
        curr_bull = curr["close"] > curr["open"]
        curr_bear = curr["close"] < curr["open"]

        prev_body = abs(prev["close"] - prev["open"])
        curr_body = abs(curr["close"] - curr["open"])
        valid_size = curr_body >= (prev_body * SIZE_MULT)
        valid_gap = abs(prev["close"] - curr["open"]) <= tol

        for x in active_shorts:
            if curr["high"] >= x["level"]:
                hits.append(
                    {
                        "direction": "SHORT",
                        "level": float(x["level"]),
                        "line_formed_date": x["date"].date().isoformat(),
                        "hit_block_date": curr_time.date().isoformat(),
                        "signal_high": float(x["signal_high"]),
                        "signal_low": float(x["signal_low"]),
                    }
                )
        for x in active_longs:
            if curr["low"] <= x["level"]:
                hits.append(
                    {
                        "direction": "LONG",
                        "level": float(x["level"]),
                        "line_formed_date": x["date"].date().isoformat(),
                        "hit_block_date": curr_time.date().isoformat(),
                        "signal_high": float(x["signal_high"]),
                        "signal_low": float(x["signal_low"]),
                    }
                )

        active_shorts = [x for x in active_shorts if curr["high"] < x["level"]]
        active_longs = [x for x in active_longs if curr["low"] > x["level"]]

        # Zone EXAKT auf dem Open der Signal-Kerze; High/Low der Signal-Kerze
        # werden für die spätere SL-Berechnung mitgeführt.
        if prev_bull and curr_bear and valid_gap and valid_size:
            active_shorts.append(
                {"level": curr["open"], "date": curr_time,
                 "signal_high": curr["high"], "signal_low": curr["low"]}
            )
        if prev_bear and curr_bull and valid_gap and valid_size:
            active_longs.append(
                {"level": curr["open"], "date": curr_time,
                 "signal_high": curr["high"], "signal_low": curr["low"]}
            )

    return hits


def refine_hit_day(hit: dict, daily: pd.DataFrame) -> str:
    """Tagesgenauer Hit-Tag innerhalb des 3D-Blocks: erster Tag (ab Block-
    Start), an dem die Linie tatsächlich berührt wurde. Fallback: Block-Datum."""
    block_start = pd.Timestamp(hit["hit_block_date"])
    window = daily.loc[block_start : block_start + pd.Timedelta(days=6)]
    for ts, row in window.iterrows():
        if hit["direction"] == "SHORT" and row["high"] >= hit["level"]:
            return ts.date().isoformat()
        if hit["direction"] == "LONG" and row["low"] <= hit["level"]:
            return ts.date().isoformat()
    return hit["hit_block_date"]


def reconstruct_hits(
    pair: str, date_from: str, date_to: str, warmup_days: int = WARMUP_DAYS
) -> list[dict]:
    """Alle GVA-Hits eines Pairs im Zeitraum, chronologisch — rein technisch
    (nur Linien-Logik, bewusst ohne Fundamentals)."""
    instrument = normalize_pair(pair)
    warmup_start = (date.fromisoformat(date_from) - timedelta(days=warmup_days)).isoformat()

    daily = fetch_daily(instrument, warmup_start, date_to)
    if daily.empty:
        return []

    df_3d = resample_3d(daily)
    all_hits = collect_hits(df_3d, instrument)

    # Tagesgenau verfeinern + auf den angefragten Zeitraum filtern
    hits: list[dict] = []
    for h in all_hits:
        hit_day = refine_hit_day(h, daily)
        if not (date_from <= hit_day <= date_to):
            continue
        hits.append({**h, "hit_date": hit_day, "instrument": instrument})
    hits.sort(key=lambda h: h["hit_date"])
    return hits


def find_hit(pair: str, hit_date: str, direction: str, level: float | None = None) -> dict | None:
    """Einzelnen Hit für /evaluate re-rekonstruieren (Level + Signal-Kerze).

    Großzügiges Warmup (2 Jahre): die getroffene Linie kann lange vor dem
    Hit gebildet worden sein. Bei mehreren Hits gleicher Richtung am selben
    Tag disambiguiert `level` (Toleranz 0.5 Pips)."""
    d = date.fromisoformat(hit_date)
    hits = reconstruct_hits(
        pair,
        (d - timedelta(days=7)).isoformat(),
        (d + timedelta(days=7)).isoformat(),
        warmup_days=730,
    )
    tol = 0.5 * pip_size_of(normalize_pair(pair))
    candidates = [
        h for h in hits
        if h["hit_date"] == hit_date and h["direction"] == direction.upper()
    ]
    if level is not None:
        for h in candidates:
            if abs(h["level"] - level) <= tol:
                return h
    return candidates[0] if candidates else None
