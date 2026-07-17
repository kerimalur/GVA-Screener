import os
import json
import time
import threading
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from data_pipeline import fetch_and_resample_3d, fetch_live_prices
from analyzer import analyze_gva_zones
import macro
import supabase_signals

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

# ML-Modul (LightGBM Direction-Prediction) — eigenständiger Router, siehe ml/
from ml.routes import ml_router  # noqa: E402
app.include_router(ml_router, prefix="/ml")

# Replay-Modul (historische GVA-Hits + manuelle Backtest-Bewertung), siehe replay/
from replay.routes import replay_router  # noqa: E402
app.include_router(replay_router, prefix="/replay")

# Globaler Cache, um mehrfache Telegram-Alerts bei Refreshes zu blockieren
# Key: "PAIR_SHORT" oder "PAIR_LONG" -> Value: line_level (float)
ALERT_CACHE = {}

# Letzter Live-Preis je Paar -> fuer Kreuzungs-Erkennung (Line gequert?).
PREV_PRICE = {}

# GVA-Zonen pro Paar: ALLE noch nicht getroffenen Lines (nach Naehe sortiert).
# pair -> {"shorts": [{level,date}], "longs": [...], "daily_close", "last_touched"}
ZONES = {}

# Sticky-HIT: sobald eine Line beruehrt wurde, bleibt das Paar HIT bis der
# User "Fertig" drueckt. pair -> {"side": "SHORT"/"LONG", "level": float,
# "date": str, "pending": bool}
TRIGGERED = {}

# Verbrauchte Lines (jede Line nur 1x nutzbar). Nach "Fertig" landet das
# Level hier und wird bei der Line-Auswahl uebersprungen.
# pair -> {"SHORT": set(level), "LONG": set(level)}
CONSUMED = {}

# Merged Output (Zonen + Live-Preis), den der Endpoint zurueckgibt.
LIVE_CACHE = {"data": [], "updated": None}

REFRESH_INTERVAL = 60 * 15  # Zonen-Neuberechnung: 15 Minuten
PRICE_INTERVAL = 30         # Live-Preis + HIT-Check: 30 Sekunden
MACRO_INTERVAL = 60 * 60 * 6  # Makro (FRED/CFTC/Kalender): alle 6h, ändert sich langsam

# Makro & Stärke (Power Index / Matrix / Datenzentrum / Kalender) — unabhängig vom Screener.
MACRO_CACHE = {"currencies": [], "calendar": [], "updated": None}

STATE_FILE = os.path.join(os.path.dirname(__file__), "state.json")
_state_lock = threading.Lock()


def save_state():
    """TRIGGERED + CONSUMED persistieren (ueberlebt Neustart waehrend Laufzeit)."""
    try:
        data = {
            "triggered": TRIGGERED,
            "consumed": {p: {s: sorted(v) for s, v in sides.items()} for p, sides in CONSUMED.items()},
        }
        with open(STATE_FILE, "w") as f:
            json.dump(data, f)
    except Exception as e:
        print(f"save_state Fehler: {e}")


def load_state():
    global TRIGGERED, CONSUMED
    try:
        with open(STATE_FILE) as f:
            d = json.load(f)
        TRIGGERED = d.get("triggered", {})
        CONSUMED = {p: {s: set(v) for s, v in sides.items()} for p, sides in d.get("consumed", {}).items()}
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"load_state Fehler: {e}")


def select_lines(pair: str):
    """Naechste noch nicht verbrauchte Short- und Long-Line fuer ein Paar."""
    z = ZONES.get(pair, {})
    consumed = CONSUMED.get(pair, {})
    cs = consumed.get("SHORT", set())
    cl = consumed.get("LONG", set())
    short = next((x for x in z.get("shorts", []) if round(x["level"], 5) not in cs), None)
    long = next((x for x in z.get("longs", []) if round(x["level"], 5) not in cl), None)
    return short, long

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
    """Bewertet EIN Paar gegen die naechsten Lines mit dem gegebenen Preis.
    Sticky-HIT: einmal getroffen bleibt das Paar HIT bis der User 'Fertig' drueckt."""
    short, long = select_lines(pair)
    short_lvl = short["level"] if short else None
    long_lvl = long["level"] if long else None
    short_date = short["date"] if short else None
    long_date = long["date"] if long else None

    pip_size = 0.01 if "JPY" in pair else 0.0001

    dist_short = (short_lvl - price) / pip_size if short_lvl else 9999.0
    dist_long = (price - long_lvl) / pip_size if long_lvl else 9999.0
    min_dist = min(abs(dist_short), abs(dist_long))
    distance_pips = round(min_dist, 1) if min_dist != 9999.0 else None

    trig = TRIGGERED.get(pair)

    if trig:
        # Bereits getroffen -> bleibt HIT (sticky), keine neue Erkennung/Alert.
        status = "HIT"
        near = trig["side"]
        pending = bool(trig.get("pending"))
    else:
        status = "NEUTRAL"
        pending = False

        # HIT = Line exakt beruehrt/gekreuzt (innerhalb 0.1 Pip oder seit
        # letztem Tick gequert -> faengt auch schnelle Spruenge ab).
        prev = PREV_PRICE.get(pair)
        band = 0.1 * pip_size

        def line_touched(level):
            if level is None:
                return False
            if abs(price - level) <= band:
                return True
            if prev is None:
                return False
            return (prev - level) * (price - level) < 0

        short_hit = line_touched(short_lvl)
        long_hit = line_touched(long_lvl)

        if short_hit or long_hit:
            status = "HIT"
            side = "SHORT" if short_hit else "LONG"
            level = short_lvl if short_hit else long_lvl
            date = short_date if short_hit else long_date

            # Sticky setzen + Alert (nur bei echten Live-Ticks).
            if fire_alerts:
                TRIGGERED[pair] = {"side": side, "level": level, "date": date, "pending": False}
                cache_key = f"{pair}_{side}"
                if ALERT_CACHE.get(cache_key) != level:
                    msg = f"🚨 *GVA LINE HIT!* 🚨\n\n*Pair:* {pair}\n*Typ:* {side} LINE\n*Live-Preis:* {round(price, 5)}\n*Line Level:* {round(level, 5)}\n*Formiert am:* {date}"
                    send_telegram_alert(msg)
                    # Additiv: HIT auch als Signal in Supabase ablegen (Journal-Inbox).
                    # Fire-and-forget im eigenen Thread, no-op ohne Konfiguration.
                    snapshot = supabase_signals.build_snapshot(pair, MACRO_CACHE["currencies"])
                    supabase_signals.record_hit_async(pair, side, level, snapshot)
                    ALERT_CACHE[cache_key] = level
                save_state()
            near = side
        elif distance_pips is not None and distance_pips <= 100.0:
            status = "PREPARE"
            near = "SHORT" if abs(dist_short) <= abs(dist_long) else "LONG"
        else:
            near = None

    # Vortick-Preis nur bei echten Live-Ticks merken (nicht beim Fallback).
    if fire_alerts:
        PREV_PRICE[pair] = price

    return {
        "pair": pair,
        "near": near,
        "price": round(price, 5),
        "short": round(short_lvl, 5) if short_lvl else None,
        "short_date": short_date,
        "long": round(long_lvl, 5) if long_lvl else None,
        "long_date": long_date,
        "status": status,
        "triggered": pair in TRIGGERED,
        "pending": bool(TRIGGERED.get(pair, {}).get("pending")),
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

            # Parameter kommen aus analyzer.py (Pine v4: 5% Body-Toleranz, Faktor 1.4)
            short_lvl, short_date, long_lvl, long_date, price, last_touched, all_shorts, all_longs = analyze_gva_zones(df_3d, pair)

            ZONES[pair] = {
                "shorts": all_shorts,
                "longs": all_longs,
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


def _macro_loop():
    """Makro-Daten (FRED-Score, CFTC-COT, Kalender) alle 6h aktualisieren.
    Eigener Thread, völlig unabhängig vom Screener/Telegram-Pfad."""
    while True:
        try:
            data = macro.build_macro()
            MACRO_CACHE["currencies"] = data["currencies"]
            MACRO_CACHE["calendar"] = macro.fetch_calendar()
            MACRO_CACHE["updated"] = data["updated"]
            print(f"Makro aktualisiert: {len(MACRO_CACHE['currencies'])} Währungen, {len(MACRO_CACHE['calendar'])} Events")
        except Exception as e:
            print(f"Makro-Loop Fehler: {e}")
        time.sleep(MACRO_INTERVAL)


def _fundamentals_warmup():
    """Baut das 25J-Feature-Panel einmal vor (Kaltstart), damit der erste
    Fundamental-Track-/Replay-Bias-Request nicht minutenlang Daten zieht."""
    try:
        from replay.fundamentals import _panel
        t0 = time.time()
        panel = _panel()
        print(f"Fundamental-Panel vorgewärmt: {len(panel)} Zeilen in {time.time() - t0:.1f}s")
    except Exception as e:
        print(f"Panel-Warmup Fehler (nicht fatal): {e}")


@app.on_event("startup")
def start_background_refresh():
    load_state()
    threading.Thread(target=_zones_loop, daemon=True).start()
    threading.Thread(target=_price_loop, daemon=True).start()
    threading.Thread(target=_macro_loop, daemon=True).start()
    threading.Thread(target=_fundamentals_warmup, daemon=True).start()


@app.get("/api/screener")
def get_screener():
    # Sofort aus dem Live-Cache. Beim ersten Start evtl. leer,
    # bis Zonen berechnet und der erste Live-Tick durch ist.
    return LIVE_CACHE["data"]


class MarkRequest(BaseModel):
    pair: str
    action: str  # "pending" oder "done"


@app.post("/api/mark")
def mark(req: MarkRequest):
    """User-Aktion aus dem Popup auf ein getroffenes (HIT) Paar."""
    with _state_lock:
        trig = TRIGGERED.get(req.pair)
        if not trig:
            return {"ok": False, "reason": "not_triggered"}

        if req.action == "pending":
            trig["pending"] = True

        elif req.action == "done":
            # Line ist verbraucht (nur 1x nutzbar) -> blacklisten, HIT loeschen,
            # Alert-Dedup loeschen -> naechste Line wird automatisch gewaehlt.
            side = trig["side"]
            level = round(trig["level"], 5)
            CONSUMED.setdefault(req.pair, {}).setdefault(side, set()).add(level)
            TRIGGERED.pop(req.pair, None)
            ALERT_CACHE.pop(f"{req.pair}_{side}", None)
        else:
            return {"ok": False, "reason": "bad_action"}

        save_state()

    # Snapshot sofort neu bauen, damit das Frontend direkt aktualisiert ist.
    try:
        build_live_snapshot()
    except Exception as e:
        print(f"mark/snapshot Fehler: {e}")
    return {"ok": True}


@app.get("/api/fundamentals")
def get_fundamentals():
    """G8-Stärke/Zins/COT für Power Index, Stärke Matrix, Datenzentrum.
    Bis der erste Makro-Loop durch ist -> STATIC-Fallback (vollständiges Objekt)."""
    if not MACRO_CACHE["currencies"]:
        return {"currencies": macro.static_currencies(), "updated": None}
    return {"currencies": MACRO_CACHE["currencies"], "updated": MACRO_CACHE["updated"]}


@app.get("/api/calendar")
def get_calendar():
    """Wirtschaftskalender (ForexFactory, keyfrei). Fallback bis Loop durch ist."""
    if not MACRO_CACHE["calendar"]:
        return macro.CAL_FALLBACK
    return MACRO_CACHE["calendar"]


@app.get("/health")
@app.get("/doctor")  # Alias für bestehende Uptime-Pinger-Konfiguration
def health_ping():
    """Leichter Uptime-Ping (UptimeRobot/Render Keep-Alive): sofortiges 200,
    keine Cache-/DB-/Engine-Zugriffe — /api/health bleibt der Detail-Status."""
    return PlainTextResponse("ok")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "zones": len(ZONES),
        "pairs": len(LIVE_CACHE["data"]),
        "triggered": len(TRIGGERED),
        "updated": LIVE_CACHE["updated"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)