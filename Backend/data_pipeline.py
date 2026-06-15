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

def fetch_and_resample_3d(instrument: str, count: int = 5000) -> pd.DataFrame:
    if not OANDA_API_KEY:
        print("FEHLER: OANDA_API_KEY fehlt in der .env Datei.")
        return pd.DataFrame()

    headers = {
        "Authorization": f"Bearer {OANDA_API_KEY}",
        "Accept-Datetime-Format": "UNIX"
    }
    
    oanda_instrument = instrument[:3] + "_" + instrument[3:] if "_" not in instrument else instrument
    
    params = {
        "granularity": "D",
        "count": count,
        "price": "M",
        "dailyAlignment": 17,
        "alignmentTimezone": "America/New_York"
    }
    
    try:
        response = requests.get(f"{OANDA_URL}/instruments/{oanda_instrument}/candles", headers=headers, params=params, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print(f"OANDA API Request Fehler bei {instrument}: {e}")
        return pd.DataFrame()
        
    data = response.json()
    
    candles = []
    for candle in data.get('candles', []):
        if candle['complete']:
            # +12 Stunden zwingt den Start der NY-Session auf den korrekten echten Handelstag
            true_date = pd.to_datetime(float(candle['time']), unit='s') + pd.Timedelta(hours=12)
            
            candles.append({
                'time': true_date.normalize(),
                'open': float(candle['mid']['o']),
                'high': float(candle['mid']['h']),
                'low': float(candle['mid']['l']),
                'close': float(candle['mid']['c']),
                'volume': int(candle['volume'])
            })
            
    df = pd.DataFrame(candles)
    if df.empty:
        return df
        
    df.set_index('time', inplace=True)
    
    # 1. Striktes Entfernen von Wochenend-Artefakten
    df = df[df.index.dayofweek < 5].copy()
    
    # 2. DIE BUSINESS-DAY MATRIX (Der TV-Klon)
    # Dein bewiesener Anker: Dienstag, 21.04.2026.
    anchor = np.datetime64('2026-04-21')
    
    # Wandle die Pandas-Daten in numpy-Tage um
    dates = df.index.values.astype('datetime64[D]')
    
    # np.busday_count berechnet die EXAKTE Anzahl an Werktagen (Mo-Fr) 
    # zwischen dem Anker und der aktuellen Kerze. 
    # Durch // 3 entsteht das perfekte 3-Tages-Raster ohne Brüche.
    df['block_id'] = np.busday_count(anchor, dates) // 3
    
    # 3. Aggregation des 3D-Blocks
    df_3d = df.groupby('block_id').agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum'
    })
    
    # Das Datum des 3D-Blocks ist zwingend der erste Werktag dieses Blocks
    df_3d.index = df.groupby('block_id').apply(lambda x: x.index.min())
    df_3d = df_3d.sort_index().dropna()
    
    return df_3d