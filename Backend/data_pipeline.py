import os
import time
import requests
import pandas as pd
import numpy as np
from dotenv import load_dotenv

load_dotenv()
OANDA_API_KEY = os.getenv('OANDA_API_KEY')
OANDA_URL = os.getenv('OANDA_URL', 'https://api-fxpractice.oanda.com/v3')
OANDA_ACCOUNT_ID = os.getenv('OANDA_ACCOUNT_ID')

# In-Prozess-TTL-Cache für Tageskerzen. D-Kerzen schließen nur 1×/Tag, aber der
# Replay-Raum fragt dasselbe Pair mehrfach ab (Hits + find_hit je Bewertung).
# Ohne Cache = jeder Aufruf ein voller OANDA-Fetch (Render-Kaltstart → langsam).
_DAILY_CACHE: dict[tuple[str, int], tuple[float, pd.DataFrame]] = {}
_DAILY_TTL_SEC = 300.0


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
    Index = normalisiertes Datum, chronologisch. Basis für Scanner UND Replay.
    Ergebnis wird 5 min pro (instrument, count) gecacht."""
    if not OANDA_API_KEY:
        print("FEHLER: OANDA_API_KEY fehlt in der .env Datei.")
        return pd.DataFrame()

    cache_key = (instrument, count)
    cached = _DAILY_CACHE.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < _DAILY_TTL_SEC:
        return cached[1]

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
    df = df.sort_index()
    _DAILY_CACHE[cache_key] = (time.monotonic(), df)
    return df


def gva_3d_block_ids(index: pd.DatetimeIndex, anchor: pd.Timestamp = GVA_3D_ANCHOR) -> np.ndarray:
    """Block-ID je Tageskerze nach der TV-Regel (Kalender-Wochentage, siehe
    Anker-Kommentar). Einzige Quelle der Gruppierung — Scanner, Replay und
    Debug-Endpoint muessen alle hierueber laufen."""
    # Wochentags-Index jeder Kerze relativ zum Anker (negativ = vor dem Anker);
    # numpy-// floort auch negative Werte -> Blockgrenzen stimmen rueckwirkend.
    days = index.values.astype('datetime64[D]')
    idx = np.busday_count(np.datetime64(pd.Timestamp(anchor).date()), days)
    return idx // 3


def resample_3d_bars(df_daily: pd.DataFrame, anchor: pd.Timestamp = GVA_3D_ANCHOR) -> pd.DataFrame:
    """3D-Kerzen wie TradingView: 3er-Gruppen ueber KALENDER-Wochentage (Mo-Fr),
    phasiert am Anker. Feiertags-Slots ohne Kerze zaehlen mit (TV-Regel, siehe
    Kommentar am Anker) — ein Block kann deshalb weniger als 3 Kerzen haben."""
    if df_daily.empty:
        return df_daily
    df = df_daily.sort_index().copy()
    df['block_id'] = gva_3d_block_ids(df.index, anchor)
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


def simple_candles(daily: pd.DataFrame, granularity: str = "D", since: str = "") -> list:
    """Vereinfachte OHLC-Liste für den Performance-Chart im Währungs-Ranking.

    'W' resampled die Tageskerzen auf Wochen (Freitags-Ende); `since` (ISO
    'YYYY-MM-DD') schneidet ab dem Signal-Start ab. Reine Transformation der
    bereits geholten Tageskerzen — testbar ohne OANDA/HTTP."""
    if daily is None or daily.empty:
        return []
    df = daily[["open", "high", "low", "close"]]
    if str(granularity).upper() == "W":
        df = df.resample("W-FRI").agg(
            {"open": "first", "high": "max", "low": "min", "close": "last"}
        ).dropna()
    if since:
        try:
            df = df[df.index >= pd.to_datetime(since)]
        except Exception:
            pass
    return [
        {
            "time": ts.strftime("%Y-%m-%d"),
            "open": round(float(row["open"]), 5),
            "high": round(float(row["high"]), 5),
            "low": round(float(row["low"]), 5),
            "close": round(float(row["close"]), 5),
        }
        for ts, row in df.iterrows()
    ]