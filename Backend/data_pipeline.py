import os
import threading
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
# Eintrag: (Zeitstempel, DataFrame, TTL) — Fehlschläge werden kurz negativ
# gecacht, damit ein OANDA-Ausfall nicht 20 Pairs × 10 s Timeout seriell kostet.
_DAILY_CACHE: dict[tuple[str, int], tuple[float, pd.DataFrame, float]] = {}
_DAILY_TTL_SEC = 300.0
_DAILY_FAIL_TTL_SEC = 30.0

# Single-Flight je (instrument, count): das Performance-Panel im Ranking fragt
# D+W für ~20 Pairs gleichzeitig ab. Ohne Lock löst jeder dieser Aufrufe einen
# eigenen 5000-Kerzen-Fetch aus (GIL + Render-CPU → minutenlang). Mit Lock holt
# der erste, die anderen warten und nehmen das Cache-Ergebnis.
_DAILY_LOCKS: dict[tuple[str, int], threading.Lock] = {}
_DAILY_LOCKS_GUARD = threading.Lock()


def _daily_lock(cache_key: tuple[str, int]) -> threading.Lock:
    with _DAILY_LOCKS_GUARD:
        lock = _DAILY_LOCKS.get(cache_key)
        if lock is None:
            lock = threading.Lock()
            _DAILY_LOCKS[cache_key] = lock
        return lock


def _daily_cached(cache_key: tuple[str, int]):
    """Gültiger Cache-Eintrag oder None (auch negativ gecachte Fehlschläge)."""
    cached = _DAILY_CACHE.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < cached[2]:
        return cached[1]
    return None


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
    hit = _daily_cached(cache_key)
    if hit is not None:
        return hit

    with _daily_lock(cache_key):
        # Zweiter Blick unter dem Lock: wer gewartet hat, nimmt das Ergebnis
        # des ersten Aufrufs statt selbst nochmal OANDA zu fragen.
        hit = _daily_cached(cache_key)
        if hit is not None:
            return hit
        return _fetch_daily_oanda_uncached(instrument, count, cache_key)


def _fetch_daily_oanda_uncached(instrument: str, count: int,
                                cache_key: tuple[str, int]) -> pd.DataFrame:
    """Der eigentliche OANDA-Call. Nur aus fetch_daily_oanda unter Lock."""
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
        empty = pd.DataFrame()
        _DAILY_CACHE[cache_key] = (time.monotonic(), empty, _DAILY_FAIL_TTL_SEC)
        return empty

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
        _DAILY_CACHE[cache_key] = (time.monotonic(), df, _DAILY_FAIL_TTL_SEC)
        return df
    df = df.set_index('time')
    df = df[df.index.dayofweek < 5].copy()  # Wochenend-Artefakte raus
    df = df.sort_index()
    _DAILY_CACHE[cache_key] = (time.monotonic(), df, _DAILY_TTL_SEC)
    return df


def daily_for_candles(instrument: str, since: str = "") -> pd.DataFrame:
    """Tageskerzen für den Performance-Chart (Währungs-Ranking).

    Nimmt die warme 5000er-Cache des Scanners, wenn sie steht — sonst nur so
    viele Kerzen, wie `since` wirklich braucht. Ein Signal von vor 6 Wochen
    braucht keine 20 Jahre Historie; das war auf Render der Hauptgrund für die
    minutenlangen Ladezeiten des Performance-Panels."""
    warm = _daily_cached((instrument, 5000))
    if warm is not None:
        return warm
    count = 5000
    if since:
        try:
            tage = (pd.Timestamp.now().normalize() - pd.to_datetime(since)).days
            # +60 Kalendertage Puffer, damit die W-Resample-Randwoche sauber ist
            count = int(min(5000, max(120, tage + 60)))
        except Exception:
            count = 5000
    return fetch_daily_oanda(instrument, count=count)


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


def recent_gvas(shorts: list | None, longs: list | None, limit: int = 3) -> list:
    """Letzte `limit` geformte (noch aktive) GVA-Linien eines Paares, nach
    Bildungsdatum absteigend — reine Anzeige-Hilfe für den Detail-Popup
    (manuelle Setup-Verifikation).

    KEINE Erkennungslogik: waehlt nur aus den bereits vom Analyzer erkannten,
    noch nicht getroffenen Linien (ZONES `shorts`/`longs`). Datum ist
    'DD.MM.YYYY' aus analyzer.py; nicht parsbare Daten wandern ans Ende."""
    items = (
        [{"type": "SHORT", "level": x["level"], "date": x["date"]} for x in (shorts or [])]
        + [{"type": "LONG", "level": x["level"], "date": x["date"]} for x in (longs or [])]
    )

    def _key(it: dict):
        try:
            return pd.to_datetime(it["date"], format="%d.%m.%Y")
        except Exception:
            return pd.Timestamp.min

    items.sort(key=_key, reverse=True)
    return [
        {"type": it["type"], "level": round(float(it["level"]), 5), "date": it["date"]}
        for it in items[:limit]
    ]


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