"""Historische GVA-Hit-Rekonstruktion — EXAKT dieselbe Kerzen- und Muster-
Basis wie der Live-Scanner, damit Replay == Scanner == TradingView.

Tageskerzen kommen von OANDA (data_pipeline.fetch_daily_oanda, NY-Alignment),
3D-Kerzen entstehen per resample_3d_bars (je 3 aufeinanderfolgende echte
Handelstage, TV-Gruppierung). Muster-/Level-Logik ist 1:1 aus
analyzer.analyze_gva_zones (Pine Script v4.0) — nur wird hier JEDER Hit
chronologisch gesammelt statt nur die aktiven Linien.
"""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from analyzer import GVA_SIZE_FACTOR, GVA_TOL_PCT
from data_pipeline import fetch_daily_oanda, resample_3d_bars


def normalize_pair(pair: str) -> str:
    """'EURUSD' / 'EUR/USD' / 'EUR_USD' -> 'EUR_USD'."""
    p = pair.upper().replace("/", "_")
    if "_" not in p and len(p) == 6:
        p = p[:3] + "_" + p[3:]
    return p


def pip_size_of(instrument: str) -> float:
    return 0.01 if "JPY" in instrument else 0.0001


def collect_hits(
    df_3d: pd.DataFrame,
    instrument: str,
    size_factor: float = GVA_SIZE_FACTOR,
    tol_pct: float = GVA_TOL_PCT,
) -> list[dict]:
    """Portierte analyze_gva_zones-Loop, die jeden Hit sammelt.

    Reihenfolge je Kerze wie im Original: erst Hits gegen aktive Linien
    prüfen, dann berührte Linien entfernen, dann neue Linien bilden.
    Jede Linie wird genau einmal gehittet (danach entfernt).

    size_factor/tol_pct sind im Replay stimmbar (Default = Live-Scanner-Werte),
    damit Kerim die GVA-Erkennung gegen TradingView kalibrieren kann.
    """
    if df_3d.empty or len(df_3d) < 2:
        return []

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
        valid_size = prev_body > 0 and curr_body >= (prev_body * size_factor)
        tol = prev_body * tol_pct
        bot_match = abs(min(prev["open"], prev["close"]) - min(curr["open"], curr["close"])) <= tol
        top_match = abs(max(prev["open"], prev["close"]) - max(curr["open"], curr["close"])) <= tol

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

        # Level = Body-Top/Boden der Signal-Kerze B (Pine: top_B/bot_B);
        # High/Low der Signal-Kerze werden für die SL-Berechnung mitgeführt.
        if prev_bull and curr_bear and valid_size and top_match:
            active_shorts.append(
                {"level": max(curr["open"], curr["close"]), "date": curr_time,
                 "signal_high": curr["high"], "signal_low": curr["low"]}
            )
        if prev_bear and curr_bull and valid_size and bot_match:
            active_longs.append(
                {"level": min(curr["open"], curr["close"]), "date": curr_time,
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
    pair: str,
    date_from: str,
    date_to: str,
    size_factor: float = GVA_SIZE_FACTOR,
    tol_pct: float = GVA_TOL_PCT,
) -> list[dict]:
    """Alle GVA-Hits eines Pairs im Zeitraum, chronologisch — rein technisch
    (nur Linien-Logik). Linien werden aus der VOLLEN OANDA-Historie gebildet
    (automatischer Vorlauf), die Hits danach auf den Zeitraum gefiltert."""
    instrument = normalize_pair(pair)
    daily = fetch_daily_oanda(instrument, count=5000)
    if daily.empty:
        return []

    df_3d = resample_3d_bars(daily)
    all_hits = collect_hits(df_3d, instrument, size_factor, tol_pct)

    # Tagesgenau verfeinern + auf den angefragten Zeitraum filtern
    hits: list[dict] = []
    for h in all_hits:
        hit_day = refine_hit_day(h, daily)
        if not (date_from <= hit_day <= date_to):
            continue
        hits.append({**h, "hit_date": hit_day, "instrument": instrument})
    hits.sort(key=lambda h: h["hit_date"])
    return hits


def find_hit(
    pair: str,
    hit_date: str,
    direction: str,
    level: float | None = None,
    size_factor: float = GVA_SIZE_FACTOR,
    tol_pct: float = GVA_TOL_PCT,
) -> dict | None:
    """Einzelnen Hit für /evaluate re-rekonstruieren (Level + Signal-Kerze).
    Bei mehreren Hits gleicher Richtung am selben Tag disambiguiert `level`."""
    d = date.fromisoformat(hit_date)
    hits = reconstruct_hits(
        pair,
        (d - timedelta(days=7)).isoformat(),
        (d + timedelta(days=7)).isoformat(),
        size_factor,
        tol_pct,
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
