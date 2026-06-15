import os
import time
import threading
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from data_pipeline import fetch_and_resample_3d, fetch_live_prices
from analyzer import analyze_gva_zones

load_dotenv()

PAIRS = [
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", 
    "EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "CADJPY", "CHFJPY", "EURAUD", 
    "EURCAD", "EURCHF", "EURNZD", "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD", 
    "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "NZDCAD", "NZDCHF", "NZDJPY"
]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Globaler Cache, um mehrfache Telegram-Alerts bei Refreshes zu blockieren
# Key: "PAIR_SHORT" oder "PAIR_LONG" -> Value: line_level (float)
ALERT_CACHE = {}

# GVA-Zonen pro Paar (schwer zu berechnen, aendern sich nur langsam).
# pair -> {short_lvl, short_date, long_lvl, long_date, last_touched}
ZONES = {}

# Merged Output (Zonen + Live-Preis), den der Endpoint zurueckgibt.
LIVE_CACHE = {"data": [], "updated": None}

REFRESH_INTERVAL = 60 * 15  # Zonen-Neuberechnung: 15 Minuten
PRICE_INTERVAL = 30         # Live-Preis + HIT-Check: 30 Sekunden

def send_telegram_alert(text: str):
    token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"Telegram-Fehler: {e}")

def evaluate_pair(pair: str, price: float, zone: dict, fire_alerts: bool = True) -> dict:
    """Bewertet EIN Paar gegen seine Zonen mit dem gegebenen Preis.
    Berechnet Distanz/Status und feuert bei HIT (optional) den Telegram-Alert."""
    short_lvl = zone.get("short_lvl")
    long_lvl = zone.get("long_lvl")
    short_date = zone.get("short_date")
    long_date = zone.get("long_date")

    pip_size = 0.01 if "JPY" in pair else 0.0001
    status = "NEUTRAL"

    dist_short = (short_lvl - price) / pip_size if short_lvl else 9999.0
    dist_long = (price - long_lvl) / pip_size if long_lvl else 9999.0

    min_dist = min(dist_short, dist_long)
    distance_pips = round(min_dist, 1) if min_dist != 9999.0 else None

    if distance_pips is not None:
        if distance_pips <= 2.5:
            status = "HIT"

            if dist_short <= 2.5 and short_lvl:
                cache_key = f"{pair}_SHORT"
                if fire_alerts and ALERT_CACHE.get(cache_key) != short_lvl:
                    msg = f"🚨 *GVA LINE HIT!* 🚨\n\n*Pair:* {pair}\n*Typ:* SHORT LINE\n*Live-Preis:* {round(price, 5)}\n*Line Level:* {round(short_lvl, 5)}\n*Formiert am:* {short_date}"
                    send_telegram_alert(msg)
                    ALERT_CACHE[cache_key] = short_lvl

            elif dist_long <= 2.5 and long_lvl:
                cache_key = f"{pair}_LONG"
                if fire_alerts and ALERT_CACHE.get(cache_key) != long_lvl:
                    msg = f"🚨 *GVA LINE HIT!* 🚨\n\n*Pair:* {pair}\n*Typ:* LONG LINE\n*Live-Preis:* {round(price, 5)}\n*Line Level:* {round(long_lvl, 5)}\n*Formiert am:* {long_date}"
                    send_telegram_alert(msg)
                    ALERT_CACHE[cache_key] = long_lvl

        elif distance_pips <= 100.0:
            status = "PREPARE"

    # Welche Line ist am naechsten? -> Richtung auf die man achten muss.
    near = None
    if status != "NEUTRAL":
        near = "SHORT" if abs(dist_short) <= abs(dist_long) else "LONG"

    return {
        "pair": pair,
        "near": near,
        "price": round(price, 5),
        "short": round(short_lvl, 5) if short_lvl else None,
        "short_date": short_date,
        "long": round(long_lvl, 5) if long_lvl else None,
        "long_date": long_date,
        "status": status,
        "distance": distance_pips,
        "last_touched": zone.get("last_touched"),
    }


def compute_zones():
    """Schwerer Durchlauf (15 min): berechnet die GVA-Zonen je Paar neu.
    Keine Alerts hier - die feuern live im Preis-Loop."""
    for pair in PAIRS:
        try:
            df_3d = fetch_and_resample_3d(pair, count=5000)
            if df_3d.empty:
                continue

            short_lvl, short_date, long_lvl, long_date, price, last_touched = analyze_gva_zones(df_3d, pair, tol_pips=2.5, size_mult=1.3)

            ZONES[pair] = {
                "short_lvl": short_lvl,
                "short_date": short_date,
                "long_lvl": long_lvl,
                "long_date": long_date,
                "last_touched": last_touched,
                "daily_close": price,  # Fallback-Preis bis Live-Tick kommt
            }
        except Exception as e:
            print(f"Zonen-Fehler bei {pair}: {e}")
        time.sleep(0.1)


def build_live_snapshot():
    """Leichter Durchlauf (30s): Live-Preise holen + gegen Zonen bewerten."""
    prices = fetch_live_prices(PAIRS)
    market_data = []
    for pair in PAIRS:
        zone = ZONES.get(pair)
        if not zone:
            continue
        live = prices.get(pair)
        price = live["mid"] if live else zone.get("daily_close")
        if price is None:
            continue
        market_data.append(evaluate_pair(pair, price, zone, fire_alerts=bool(live)))
    LIVE_CACHE["data"] = market_data
    LIVE_CACHE["updated"] = time.time()


def _zones_loop():
    while True:
        try:
            compute_zones()
            print(f"Zonen aktualisiert: {len(ZONES)} Paare")
        except Exception as e:
            print(f"Zonen-Loop Fehler: {e}")
        time.sleep(REFRESH_INTERVAL)


def _price_loop():
    # Warten bis die ersten Zonen da sind, dann alle 30s Live-Preise ziehen.
    while not ZONES:
        time.sleep(2)
    while True:
        try:
            build_live_snapshot()
        except Exception as e:
            print(f"Preis-Loop Fehler: {e}")
        time.sleep(PRICE_INTERVAL)


@app.on_event("startup")
def start_background_refresh():
    threading.Thread(target=_zones_loop, daemon=True).start()
    threading.Thread(target=_price_loop, daemon=True).start()


@app.get("/api/screener")
def get_screener():
    # Sofort aus dem Live-Cache. Beim ersten Start evtl. leer,
    # bis Zonen berechnet und der erste Live-Tick durch ist.
    return LIVE_CACHE["data"]


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "zones": len(ZONES),
        "pairs": len(LIVE_CACHE["data"]),
        "updated": LIVE_CACHE["updated"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)