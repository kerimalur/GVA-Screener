import os
import requests
import pandas as pd
import numpy as np
from dotenv import load_dotenv

load_dotenv()
OANDA_API_KEY = os.getenv('OANDA_API_KEY')
OANDA_URL = os.getenv('OANDA_URL', 'https://api-fxpractice.oanda.com/v3')
OANDA_ACCOUNT_ID = os.getenv('OANDA_ACCOUNT_ID')


def fetch_live_prices(instruments: list) -> dict:
    """Holt Live-Bid/Ask fuer ALLE Paare in EINEM Request.
    Rueckgabe: {"EURUSD": {"bid": .., "ask": .., "mid": ..}, ...}"""
    if not OANDA_API_KEY or not OANDA_ACCOUNT_ID:
        print("FEHLER: OANDA_API_KEY oder OANDA_ACCOUNT_ID fehlt.")
        return {}

    oanda_instruments = [i[:3] + "_" + i[3:] if "_" not in i else i for i in instruments]
    headers = {"Authorization": f"Bearer {OANDA_API_KEY}"}
    params = {"instruments": ",".join(oanda_instruments)}
    url = f"{OANDA_URL}/accounts/{OANDA_ACCOUNT_ID}/pricing"

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print(f"OANDA Pricing Fehler: {e}")
        return {}

    out = {}
    for p in response.json().get("prices", []):
        pair = p.get("instrument", "").replace("_", "")
        bids = p.get("bids") or []
        asks = p.get("asks") or []
        if bids and asks:
            bid = float(bids[0]["price"])
            ask = float(asks[0]["price"])
            out[pair] = {"bid": bid, "ask": ask, "mid": (bid + ask) / 2}
    return out

# 3D-Anker: ein von TradingView verifizierter Block-START. TradingView zählt
# KALENDER-Wochentage (Mo-Fr) in 3er-Gruppen — Feiertage ohne Kerze (25.12.,
# 01.01.) zählen als Slot MIT, ein Block kann also nur 2 echte Kerzen haben.
# Empirisch bewiesen per Pine-Log-Dump 01/2025-07/2026 (alle 132 Blockstarts,
# inkl. 2-Kerzen-Bloecke {24.12.,26.12.} und {02.01.,05.01.}):
# GVA_BACKTEST_ROADMAP.md Phase 1. 2026-07-09 ist ein bestaetigter Blockstart.
GVA_3D_ANCHOR = pd.Timestamp('2026-07-09')


def fetch_daily_oanda(instrument: str, count: int = 5000) -> pd.DataFrame:
    """Saubere Tageskerzen von OANDA (NY-Alignment 17 Uhr, ohne Wochenenden).
    Index = normalisiertes Datum, chronologisch. Basis für Scanner UND Replay."""
    if not OANDA_API_KEY:
        print("FEHLER: OANDA_API_KEY fehlt in der .env Datei.")
        return pd.DataFrame()

    headers = {
        "Authorization": f"Bearer {OANDA_API_KEY}",
        "Accept-Datetime-Format": "UNIX",
    }
    oanda_instrument = instrument[:3] + "_" + instrument[3:] if "_" not in instrument else instrument
    params = {
        "granularity": "D", "count": count, "price": "M",
        "dailyAlignment": 17, "alignmentTimezone": "America/New_York",
    }
    try:
        response = requests.get(f"{OANDA_URL}/instruments/{oanda_instrument}/candles",
                                headers=headers, params=params, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print(f"OANDA API Request Fehler bei {instrument}: {e}")
        return pd.DataFrame()

    candles = []
    for candle in response.json().get('candles', []):
        if candle['complete']:
            # +12h zwingt den Start der NY-Session auf den echten Handelstag
            true_date = pd.to_datetime(float(candle['time']), unit='s') + pd.Timedelta(hours=12)
            candles.append({
                'time': true_date.normalize(),
                'open': float(candle['mid']['o']), 'high': float(candle['mid']['h']),
                'low': float(candle['mid']['l']), 'close': float(candle['mid']['c']),
                'volume': int(candle['volume']),
            })
    df = pd.DataFrame(candles)
    if df.empty:
        return df
    df = df.set_index('time')
    df = df[df.index.dayofweek < 5].copy()  # Wochenend-Artefakte raus
    return df.sort_index()


def resample_3d_bars(df_daily: pd.DataFrame, anchor: pd.Timestamp = GVA_3D_ANCHOR) -> pd.DataFrame:
    """3D-Kerzen wie TradingView: 3er-Gruppen ueber KALENDER-Wochentage (Mo-Fr),
    phasiert am Anker. Feiertags-Slots ohne Kerze zaehlen mit (TV-Regel, siehe
    Kommentar am Anker) — ein Block kann deshalb weniger als 3 Kerzen haben."""
    if df_daily.empty:
        return df_daily
    df = df_daily.sort_index().copy()
    # Wochentags-Index jeder Kerze relativ zum Anker (negativ = vor dem Anker);
    # numpy-// floort auch negative Werte -> Blockgrenzen stimmen rueckwirkend.
    days = df.index.values.astype('datetime64[D]')
    idx = np.busday_count(np.datetime64(pd.Timestamp(anchor).date()), days)
    df['block_id'] = idx // 3
    df_3d = df.groupby('block_id').agg({
        'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum',
    })
    df_3d.index = df.groupby('block_id').apply(lambda x: x.index.min())
    return df_3d.sort_index().dropna()


def fetch_and_resample_3d(instrument: str, count: int = 5000) -> pd.DataFrame:
    df = fetch_daily_oanda(instrument, count)
    if df.empty:
        return df
    return resample_3d_bars(df)