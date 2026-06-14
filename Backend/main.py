import os
import time
import threading
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from data_pipeline import fetch_and_resample_3d
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

# Vorberechnete Screener-Daten. Der Endpoint liest NUR aus diesem Cache,
# damit Requests sofort antworten. Der Hintergrund-Thread aktualisiert ihn.
SCREENER_CACHE = {"data": [], "updated": None}
REFRESH_INTERVAL = 60 * 15  # 15 Minuten

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

def run_screener():
    market_data = []
    for pair in PAIRS:
        try:
            df_3d = fetch_and_resample_3d(pair, count=5000)
            if df_3d.empty:
                continue

            short_lvl, short_date, long_lvl, long_date, price, last_touched = analyze_gva_zones(df_3d, pair, tol_pips=2.5, size_mult=1.3)
            
            pip_size = 0.01 if "JPY" in pair else 0.0001
            status = "NEUTRAL"
            
            dist_short = (short_lvl - price) / pip_size if short_lvl else 9999.0
            dist_long = (price - long_lvl) / pip_size if long_lvl else 9999.0
            
            min_dist = min(dist_short, dist_long)
            distance_pips = round(min_dist, 1) if min_dist != 9999.0 else None

            if distance_pips is not None:
                if distance_pips <= 2.5:
                    status = "HIT"
                    
                    # Überprüfung, welche spezifische Line getroffen wurde & Alarmierung
                    if dist_short <= 2.5 and short_lvl:
                        cache_key = f"{pair}_SHORT"
                        if ALERT_CACHE.get(cache_key) != short_lvl:
                            msg = f"🚨 *GVA LINE HIT!* 🚨\n\n*Pair:* {pair}\n*Typ:* SHORT LINE\n*Marktpreis:* {round(price, 5)}\n*Line Level:* {round(short_lvl, 5)}\n*Formiert am:* {short_date}"
                            send_telegram_alert(msg)
                            ALERT_CACHE[cache_key] = short_lvl
                            
                    elif dist_long <= 2.5 and long_lvl:
                        cache_key = f"{pair}_LONG"
                        if ALERT_CACHE.get(cache_key) != long_lvl:
                            msg = f"🚨 *GVA LINE HIT!* 🚨\n\n*Pair:* {pair}\n*Typ:* LONG LINE\n*Marktpreis:* {round(price, 5)}\n*Line Level:* {round(long_lvl, 5)}\n*Formiert am:* {long_date}"
                            send_telegram_alert(msg)
                            ALERT_CACHE[cache_key] = long_lvl
                            
                elif distance_pips <= 100.0:
                    status = "PREPARE"

            market_data.append({
                "pair": pair,
                "price": round(price, 5),
                "short": round(short_lvl, 5) if short_lvl else None,
                "short_date": short_date,
                "long": round(long_lvl, 5) if long_lvl else None,
                "long_date": long_date,
                "status": status,
                "distance": distance_pips,
                "last_touched": last_touched
            })

        except Exception as e:
            print(f"Fehler bei {pair}: {e}")
        
        time.sleep(0.1)
        
    return market_data

def _refresh_loop():
    """Laeuft im Hintergrund-Thread: berechnet den Screener neu und cached ihn."""
    while True:
        try:
            data = run_screener()
            SCREENER_CACHE["data"] = data
            SCREENER_CACHE["updated"] = time.time()
            print(f"Screener-Cache aktualisiert: {len(data)} Paare")
        except Exception as e:
            print(f"Screener-Refresh Fehler: {e}")
        time.sleep(REFRESH_INTERVAL)


@app.on_event("startup")
def start_background_refresh():
    threading.Thread(target=_refresh_loop, daemon=True).start()


@app.get("/api/screener")
def get_screener():
    # Antwortet sofort aus dem Cache. Beim ersten Start evtl. noch leer,
    # bis der Hintergrund-Thread den ersten Durchlauf fertig hat.
    return SCREENER_CACHE["data"]


@app.get("/api/health")
def health():
    return {"status": "ok", "pairs": len(SCREENER_CACHE["data"]), "updated": SCREENER_CACHE["updated"]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)