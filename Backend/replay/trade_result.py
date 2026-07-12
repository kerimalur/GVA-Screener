"""Trade-Ergebnis-Simulation für bewertete Replay-Hits.

Entry = Close am Hit-Tag. SL = High/Low der GVA-Signal-Kerze (3D) ± 5 Pips
Buffer. TP = 1:3 Risk:Reward. Simulation läuft über die täglichen Kerzen
nach dem Entry; SL und TP am selben Tag -> konservativ SL (Worst Case).
Nach 20 Handelstagen ohne Ausgang -> Timeout zum letzten Close.
"""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from .gva_history import fetch_daily, pip_size_of

SL_BUFFER_PIPS = 5.0
RR_TARGET = 3.0
TIMEOUT_DAYS = 20  # Handelstage

# genug Kalendertage laden, um 20 Handelstage + Feiertage abzudecken
_FETCH_CALENDAR_DAYS = 45


def simulate_trade(instrument: str, hit: dict) -> dict | None:
    """Simuliert den Trade eines Hits gegen price_daily.

    hit braucht: hit_date, direction, signal_high, signal_low.
    Rückgabe None, wenn keine Preisdaten am Hit-Tag existieren.
    """
    pip = pip_size_of(instrument)
    direction = hit["direction"].upper()
    hit_date = hit["hit_date"]

    until = (date.fromisoformat(hit_date) + timedelta(days=_FETCH_CALENDAR_DAYS)).isoformat()
    daily = fetch_daily(instrument, hit_date, until)
    if daily.empty or pd.Timestamp(hit_date) not in daily.index:
        return None

    entry = float(daily.loc[pd.Timestamp(hit_date), "close"])

    if direction == "SHORT":
        sl = float(hit["signal_high"]) + SL_BUFFER_PIPS * pip
        risk = sl - entry
        tp = entry - RR_TARGET * risk
    else:
        sl = float(hit["signal_low"]) - SL_BUFFER_PIPS * pip
        risk = entry - sl
        tp = entry + RR_TARGET * risk

    if risk <= 0:
        # Entry liegt bereits jenseits des SL (Signal-Kerze durchschlagen) —
        # kein sinnvoller Trade konstruierbar.
        return {
            "entry_price": round(entry, 5), "sl_price": round(sl, 5), "tp_price": None,
            "result": "INVALID", "result_pips": 0.0, "result_rr": 0.0, "exit_date": hit_date,
        }

    after = daily[daily.index > pd.Timestamp(hit_date)]
    result, exit_price, exit_date = "TIMEOUT", None, None

    for n, (ts, row) in enumerate(after.iterrows()):
        if n >= TIMEOUT_DAYS:
            break
        hi, lo = float(row["high"]), float(row["low"])
        if direction == "SHORT":
            sl_hit = hi >= sl
            tp_hit = lo <= tp
        else:
            sl_hit = lo <= sl
            tp_hit = hi >= tp
        if sl_hit:  # beides am selben Tag -> konservativ SL
            result, exit_price, exit_date = "LOSS", sl, ts.date().isoformat()
            break
        if tp_hit:
            result, exit_price, exit_date = "WIN", tp, ts.date().isoformat()
            break
        exit_price, exit_date = float(row["close"]), ts.date().isoformat()

    if exit_price is None:  # keine Kerzen nach dem Entry vorhanden
        exit_price, exit_date = entry, hit_date

    sign = -1.0 if direction == "SHORT" else 1.0
    pnl = sign * (exit_price - entry)
    result_pips = pnl / pip
    result_rr = pnl / risk

    return {
        "entry_price": round(entry, 5),
        "sl_price": round(sl, 5),
        "tp_price": round(tp, 5),
        "result": result,
        "result_pips": round(result_pips, 1),
        "result_rr": round(result_rr, 2),
        "exit_date": exit_date,
    }
