import os
import time
import threading
from datetime import datetime, timezone

import pandas as pd
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from data_pipeline import fetch_daily_oanda, resample_3d_bars, resample_weekly_bars, fetch_live_prices, simple_candles, recent_gvas, daily_for_candles
from analyzer import analyze_gva_zones
import macro
import supabase_signals
import lifecycle_state
import late_hits

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
# "live" = letzter Snapshot hat echte OANDA-Preise bekommen. False bedeutet:
# gerechnet wurde mit dem Tagesschluss aus den Zonen (Fallback) — das MUSS im
# Frontend sichtbar sein, sonst sehen die Pip-Distanzen live aus, sind es aber nicht.
LIVE_CACHE = {"data": [], "updated": None, "live": False}

# Abgeschlossene compute_zones-Durchlaeufe seit Prozessstart. Sobald > 0 ist der
# Kaltstart vorbei: fehlende Zonen sind dann ein Datenproblem einzelner Paare,
# kein "startet noch" — das Frontend unterscheidet genau daran.
ZONES_RUNS = {"completed": 0}

REFRESH_INTERVAL = 60 * 15  # Zonen-Neuberechnung: 15 Minuten
PRICE_INTERVAL = 30         # Live-Preis + HIT-Check: 30 Sekunden
MACRO_INTERVAL = 60 * 60 * 6  # Makro (FRED/CFTC/Kalender): alle 6h, ändert sich langsam

# Makro & Stärke (Power Index / Matrix / Datenzentrum / Kalender) — unabhängig vom Screener.
MACRO_CACHE = {"currencies": [], "calendar": [], "updated": None}

STATE_FILE = lifecycle_state.default_state_file()
_state_lock = threading.Lock()


def save_state():
    """Zustand als CACHE in state.json schreiben.

    Die Wahrheit liegt in Supabase (`signals`) — Render hat kein persistentes
    Dateisystem. Die Datei hilft nur lokal und wenn Supabase kurz wegbricht;
    fehlt sie, verhaelt sich der Screener identisch.
    """
    lifecycle_state.write_cache_file(STATE_FILE, TRIGGERED, CONSUMED)


def load_state():
    """TRIGGERED/CONSUMED/ALERT_CACHE aus Supabase aufbauen (Cache als Fallback)."""
    global TRIGGERED, CONSUMED, ALERT_CACHE
    triggered, consumed, alert_cache, source = lifecycle_state.load_lifecycle(STATE_FILE)
    TRIGGERED = triggered
    CONSUMED = consumed
    ALERT_CACHE = alert_cache
    consumed_count = sum(len(v) for sides in CONSUMED.values() for v in sides.values())
    # Consumed-Zahl bewusst im Log: waechst sie nicht mehr, obwohl Trades
    # dazukommen, wurde der Abruf irgendwo abgeschnitten (siehe
    # supabase_signals.fetch_consumed_rows — paginiert, ohne Limit).
    print(
        f"Lebenszyklus geladen ({source}): {len(TRIGGERED)} offene HITs, "
        f"{consumed_count} verbrauchte Linien ueber {len(CONSUMED)} Paare"
    )
    save_state()


def reconcile_state():
    """Laufenden Zustand gegen Supabase abgleichen (alle 15 min im Zonen-Loop).

    Faengt Statuswechsel ab, die nicht ueber /api/mark laufen (z.B. direkt im
    Journal). Damit kann kein Paar dauerhaft sticky in TRIGGERED haengen.
    """
    rows = supabase_signals.fetch_lifecycle_rows()
    if rows is None:
        return
    with _state_lock:
        changed = lifecycle_state.reconcile(TRIGGERED, CONSUMED, ALERT_CACHE, rows)
    if changed:
        save_state()
        print("Lebenszyklus abgeglichen (Supabase -> Laufzeit)")


def select_lines(pair: str):
    """Naechste noch nicht verbrauchte Short- und Long-Line fuer ein Paar."""
    z = ZONES.get(pair, {})
    consumed = CONSUMED.get(pair, {})
    cs = consumed.get("SHORT", set())
    cl = consumed.get("LONG", set())
    short = next((x for x in z.get("shorts", []) if round(x["level"], 5) not in cs), None)
    long = next((x for x in z.get("longs", []) if round(x["level"], 5) not in cl), None)
    return short, long

def cockpit_deep_link(pair: str) -> str:
    """Markdown-Zeile mit Deep-Link ins Cockpit auf das Pair, vom Handy
    per Tap erreichbar. Leer, wenn FRONTEND_URL fehlt — der Alert geht dann
    ohne Link raus, statt ganz auszufallen (Anforderung: Link weglassen statt
    Alert verwerfen)."""
    base = os.getenv('FRONTEND_URL', '').rstrip('/')
    if not base:
        return ""
    return f"\n\n[📲 Im Cockpit öffnen]({base}/cockpit?pair={pair})"


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
    # Timeframe der Linie (3D oder W) — Altbestand ohne Tag gilt als 3D.
    short_tf = short.get("tf", "3D") if short else None
    long_tf = long.get("tf", "3D") if long else None

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
            tf = short_tf if short_hit else long_tf

            # Sticky setzen + Alert (nur bei echten Live-Ticks).
            if fire_alerts:
                TRIGGERED[pair] = {
                    "side": side, "level": round(level, 5), "date": date,
                    "tf": tf, "pending": False, "detected_late": False,
                }
                cache_key = f"{pair}_{side}"
                if ALERT_CACHE.get(cache_key) != level:
                    msg = f"🚨 *GVA LINE HIT!* 🚨\n\n*Pair:* {pair}\n*Typ:* {side} LINE ({tf})\n*Live-Preis:* {round(price, 5)}\n*Line Level:* {round(level, 5)}\n*Formiert am:* {date}"
                    send_telegram_alert(msg + cockpit_deep_link(pair))
                    # Additiv: HIT auch als Signal in Supabase ablegen (Journal-Inbox).
                    # Fire-and-forget im eigenen Thread, no-op ohne Konfiguration.
                    snapshot = supabase_signals.build_snapshot(pair, MACRO_CACHE["currencies"])
                    supabase_signals.record_hit_async(
                        pair, side, level, snapshot, line_formed_date=date
                    )
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
        "short_tf": short_tf,
        "long": round(long_lvl, 5) if long_lvl else None,
        "long_date": long_date,
        "long_tf": long_tf,
        "status": status,
        "triggered": pair in TRIGGERED,
        "pending": bool(TRIGGERED.get(pair, {}).get("pending")),
        "distance": distance_pips,
        "last_touched": zone.get("last_touched"),
        # Letzte 3 geformte (noch aktive) GVA-Linien fuer die manuelle
        # Setup-Verifikation im Detail-Popup. Rein additiv, keine Erkennungslogik.
        "recent_gvas": recent_gvas(zone.get("shorts", []), zone.get("longs", [])),
        # True = Preis stammt NICHT von OANDA, sondern vom letzten Tagesschluss.
        # Das Frontend markiert solche Karten mit "~" vor der Pip-Distanz.
        "stale": not fire_alerts,
        # True = HIT wurde nachtraeglich aus der Kerzen-Historie erkannt (Downtime).
        "detected_late": bool(TRIGGERED.get(pair, {}).get("detected_late")),
    }


def _load_scan_state() -> dict:
    """Scan-Zeitstempel je Paar laden (ein Supabase-Roundtrip).

    Migration: ist der alte globale Wert gesetzt, gilt er als Startwert fuer
    alle Paare, die noch keinen eigenen haben. Ohne das wuerde nach dem Deploy
    jedes Paar als "erster Lauf" gelten und der Nachtrag einmalig stumm bleiben.
    """
    stored = supabase_signals.get_state_value(late_hits.LAST_SCAN_BY_PAIR_KEY)
    state = {k: v for k, v in stored.items()} if isinstance(stored, dict) else {}

    # Den Alt-Key nur lesen, solange ueberhaupt ein Paar ohne eigenen Wert ist —
    # im Normalbetrieb bleibt es damit bei EINEM Lesevorgang pro Lauf.
    if any(pair not in state for pair in PAIRS):
        legacy = supabase_signals.get_state_value(late_hits.LAST_SCAN_KEY)
        if isinstance(legacy, dict):
            legacy = legacy.get("at")
        if legacy:
            for pair in PAIRS:
                state.setdefault(pair, str(legacy))
    return state


def _since_day(scan_state: dict, pair: str) -> str | None:
    """ISO-Datum, ab dem nachtraeglich erkannte Hits fuer DIESES Paar zaehlen.

    None = fuer dieses Paar gab es noch nie einen erfolgreichen Lauf: dann wird
    bewusst NICHTS nachgetragen, sonst braeche die komplette Historie als
    Alert-Sturm herein.
    """
    stored = scan_state.get(pair)
    if not stored:
        return None
    return str(stored)[:10]  # 'YYYY-MM-DD'


def _save_scan_state(scan_state: dict, scanned_ok: list[str]):
    """Fenster NUR fuer die Paare schliessen, die in diesem Lauf sauber
    durchgelaufen sind (ein Supabase-Roundtrip fuer alle)."""
    if not scanned_ok:
        return
    now = datetime.now(timezone.utc).isoformat()
    for pair in scanned_ok:
        scan_state[pair] = now
    supabase_signals.set_state_value(late_hits.LAST_SCAN_BY_PAIR_KEY, scan_state)


def _newest_touch(*touches):
    """Juengster Touch aus mehreren Timeframes (3D / W). Datumsformat ist
    'DD.MM.YYYY' aus analyzer.py; unparsbare Eintraege verlieren."""
    valid = [t for t in touches if t]
    if not valid:
        return None

    def _key(t: dict):
        try:
            return pd.to_datetime(t.get("touched_date", ""), format="%d.%m.%Y")
        except Exception:
            return pd.Timestamp.min

    return max(valid, key=_key)


def _handle_late_hits(pair: str, df_3d, daily, since_day: str | None, df_w=None):
    """Nachtraeglich erkannten Hit eines Paars verarbeiten (Arbeitspaket B).

    Erkennung kommt komplett aus replay.gva_history.collect_hits — keine zweite
    Hit-Logik. Hier wird nur entschieden, ob daraus ein Signal + Alert wird.
    Beide Timeframes (3D und Woche) werden nachgetragen; der juengste Treffer
    ueber beide gewinnt.
    """
    if since_day is None:
        return
    with _state_lock:
        if pair in TRIGGERED:
            return  # offener HIT -> sticky, nichts nachtragen
        consumed = {s: set(v) for s, v in CONSUMED.get(pair, {}).items()}

    found = late_hits.find_late_hits(df_3d, daily, pair, since_day, consumed, tf="3D")
    if df_w is not None and not df_w.empty:
        found += late_hits.find_late_hits(
            df_w, daily, pair, since_day, consumed, tf="W")
        found.sort(key=lambda h: h["hit_date"])
    if not found:
        return

    # Bewusst NUR der juengste Treffer des Fensters: das Sticky-Modell kennt
    # genau einen offenen HIT je Paar. Aeltere Treffer desselben Paars im selben
    # Fenster gehen damit endgueltig verloren — das Fenster rueckt mit dem
    # naechsten erfolgreichen Lauf nach und holt sie nicht mehr ein. Betrifft nur
    # den seltenen Fall mehrtaegiger Downtime mit mehreren Treffern auf einem
    # Paar; siehe Modul-Docstring von late_hits.py.
    hit = found[-1]
    side, level = hit["direction"], hit["level"]
    cache_key = f"{pair}_{side}"

    with _state_lock:
        if pair in TRIGGERED:
            return
        if level in CONSUMED.get(pair, {}).get(side, set()):
            return
        if ALERT_CACHE.get(cache_key) == level:
            return  # derselbe Hit wurde schon gemeldet
        TRIGGERED[pair] = {
            "side": side,
            "level": level,
            "date": hit.get("line_formed_date"),
            "tf": hit.get("tf", "3D"),
            "pending": False,
            "detected_late": True,
        }
        ALERT_CACHE[cache_key] = level

    save_state()
    send_telegram_alert(late_hits.alert_text(pair, hit) + cockpit_deep_link(pair))
    snapshot = supabase_signals.build_snapshot(pair, MACRO_CACHE["currencies"])
    supabase_signals.record_hit_async(
        pair, side, level, snapshot,
        detected_late=True, line_formed_date=hit.get("line_formed_date"),
    )
    print(f"Nachtraeglich erkannt: {pair} {side} {hit.get('tf', '3D')} @ {level} "
          f"(Hit-Tag {hit['hit_date']})")


def compute_zones():
    """Schwerer Durchlauf (15 min): berechnet die GVA-Zonen je Paar neu und
    traegt Hits nach, die waehrend einer Downtime live verpasst wurden.

    Das Nachtrag-Fenster wird pro Paar gefuehrt: faellt ein Paar in diesem Lauf
    aus, bleibt SEIN Fenster offen, waehrend die anderen weiterruecken.
    """
    reconcile_state()
    scan_state = _load_scan_state()
    scanned_ok: list[str] = []
    failed: list[str] = []

    for pair in PAIRS:
        try:
            # Tageskerzen einmal holen (5-min-Cache) — 3D fuer die Zonen,
            # daily fuer die tagesgenaue Verfeinerung der nachgetragenen Hits.
            daily = fetch_daily_oanda(pair, count=5000)
            if daily.empty:
                failed.append(pair)
                print(f"Zonen: keine Tageskerzen fuer {pair} — Nachtrag-Fenster bleibt offen")
                continue
            df_3d = resample_3d_bars(daily)
            if df_3d.empty:
                failed.append(pair)
                print(f"Zonen: keine 3D-Kerzen fuer {pair} — Nachtrag-Fenster bleibt offen")
                continue

            # Parameter kommen aus analyzer.py (Pine v5.9.1: 15% Toleranz, Faktor 1.4).
            # GVAs entstehen auf ZWEI Timeframes (Kerim: 3D und Wochenchart) —
            # beide werden gescannt, jede Linie traegt ihr "tf"-Tag mit.
            df_w = resample_weekly_bars(daily)
            _, _, _, _, price, touched_3d, shorts_3d, longs_3d = analyze_gva_zones(
                df_3d, pair, tf="3D")
            touched_w, shorts_w, longs_w = None, [], []
            if not df_w.empty and len(df_w) >= 2:
                *_, touched_w, shorts_w, longs_w = analyze_gva_zones(df_w, pair, tf="W")

            # Zusammenfuehren + wieder nach Naehe zum Preis sortieren:
            # Shorts aufsteigend (naechste ueber Preis zuerst), Longs absteigend.
            all_shorts = sorted(shorts_3d + shorts_w, key=lambda x: x["level"])
            all_longs = sorted(longs_3d + longs_w, key=lambda x: -x["level"])

            # Juengster Touch aus beiden Timeframes (Datum 'DD.MM.YYYY')
            last_touched = _newest_touch(touched_3d, touched_w)

            ZONES[pair] = {
                "shorts": all_shorts,
                "longs": all_longs,
                "last_touched": last_touched,
                "daily_close": price,  # Fallback-Preis bis Live-Tick kommt
            }

            # Erst NACH dem Nachtrag als erfolgreich zaehlen — wirft der
            # Nachtrag, darf das Fenster dieses Paars nicht zugehen.
            _handle_late_hits(pair, df_3d, daily, _since_day(scan_state, pair), df_w)
            scanned_ok.append(pair)
        except Exception as e:
            failed.append(pair)
            print(f"Zonen-Fehler bei {pair}: {e} — Nachtrag-Fenster bleibt offen")
        time.sleep(0.1)

    _save_scan_state(scan_state, scanned_ok)

    # Zaehler markiert: mindestens ein vollstaendiger Zyklus ist durch. Das
    # Frontend verlaesst daraufhin den warmup-Zustand, auch wenn Paare fehlen —
    # sonst wuerde ein einziges dauerhaft kaputtes Paar das Board fuer immer
    # blockieren (27 funktionierende Paare unsichtbar).
    ZONES_RUNS["completed"] += 1
    if failed:
        print(
            f"Zonen-Lauf {ZONES_RUNS['completed']} fertig: {len(scanned_ok)}/{len(PAIRS)} Paare, "
            f"offen geblieben: {', '.join(failed)}"
        )


def build_live_snapshot():
    """Leichter Durchlauf (30s): Live-Preise holen + gegen Zonen bewerten.

    Faellt OANDA-Pricing aus, rechnen wir mit dem letzten Tagesschluss weiter —
    aber NICHT still: `live=False` global, `stale=True` je betroffener Karte.
    """
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
    LIVE_CACHE["live"] = bool(prices)


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
    """Live-Snapshot MIT Zustandskontext.

    Frueher kam hier nur das rohe Array — ein leeres Board beim Kaltstart war
    dadurch nicht von "diese Woche ist nichts los" zu unterscheiden. `updated`,
    `zones` und `live` machen genau das im Frontend sichtbar.
    """
    return {
        "data": LIVE_CACHE["data"],
        "updated": LIVE_CACHE["updated"],  # Unix-Sekunden oder null
        "zones": len(ZONES),
        "pairs_total": len(PAIRS),
        "live": bool(LIVE_CACHE["live"]),  # False = Preise vom Tagesschluss
        # False = Kaltstart laeuft noch ("Backend startet"). True + zones <
        # pairs_total = laeuft, aber einzelne Paare liefern keine Daten.
        "zones_complete_run": ZONES_RUNS["completed"] > 0,
        "zones_runs": ZONES_RUNS["completed"],
    }


class MarkRequest(BaseModel):
    pair: str
    action: str  # "pending" oder "done"


@app.post("/api/mark")
def mark(req: MarkRequest):
    """User-Aktion auf ein getroffenes (HIT) Paar.

    Signatur und Verhalten unveraendert (ScannerShell ruft das weiterhin so auf).
    Neu ist nur der Durchschrieb nach Supabase, damit der Lebenszyklus den
    Neustart ueberlebt: 'done' -> Signal wird consumed, 'pending' -> watchlist.
    Idempotent: ein bereits vom Cockpit gesetzter Status wird nicht ueberschrieben.
    """
    with _state_lock:
        trig = TRIGGERED.get(req.pair)
        if not trig:
            # Bereits geloest (z.B. Cockpit war schneller) -> trotzdem Erfolg
            # melden, damit doppelte Aufrufe die UI nie blockieren.
            if req.action in ("pending", "done"):
                return {"ok": True, "reason": "already_resolved"}
            return {"ok": False, "reason": "bad_action"}

        side = trig["side"]

        if req.action == "pending":
            trig["pending"] = True
            db_status = "watchlist"

        elif req.action == "done":
            # Line ist verbraucht (nur 1x nutzbar) -> blacklisten, HIT loeschen,
            # Alert-Dedup loeschen -> naechste Line wird automatisch gewaehlt.
            level = round(trig["level"], 5)
            CONSUMED.setdefault(req.pair, {}).setdefault(side, set()).add(level)
            TRIGGERED.pop(req.pair, None)
            ALERT_CACHE.pop(f"{req.pair}_{side}", None)
            # 'dismissed' (nicht 'journaled'): der Backend-Weg bedeutet nur
            # "Linie verbraucht". Ein echter Journal-Trade kommt aus dem Cockpit.
            db_status = "dismissed"
        else:
            return {"ok": False, "reason": "bad_action"}

        save_state()

    # Fire-and-forget — Supabase darf den Request nie ausbremsen.
    supabase_signals.update_signal_status_async(req.pair, side, db_status)

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


@app.get("/api/candles")
def get_candles(pair: str, granularity: str = "D", since: str = ""):
    """Kursverlauf eines Pairs für den Performance-Chart im Währungs-Ranking.

    Reuse der warmen Tageskerzen-Cache des Scanners, sonst nur der von `since`
    benötigte Ausschnitt (daily_for_candles); 'W' wird daraus resampled.
    `since` (ISO 'YYYY-MM-DD') = Signal-Start. Datenquelle OANDA."""
    inst = pair.replace("/", "").replace("_", "").upper()
    try:
        daily = daily_for_candles(inst, since)
    except Exception as e:
        print(f"candles: OANDA-Fehler {pair}: {e}")
        return {"pair": pair, "granularity": str(granularity).upper(), "candles": []}
    return {
        "pair": pair,
        "granularity": str(granularity).upper(),
        "candles": simple_candles(daily, granularity, since),
    }


@app.get("/api/candles/batch")
def get_candles_batch(pairs: str, since: str = ""):
    """Kerzen mehrerer Pairs in EINEM Request — für das Performance-Panel.

    Das Panel braucht D+W für alle Kandidaten-Pairs (bis ~20). Als Einzelaufrufe
    waren das ~40 parallele Requests auf Render, jeder mit eigenem OANDA-Fetch —
    in Summe minutenlang. Hier läuft es sequenziell mit genau einem OANDA-Fetch
    je Pair, und spätere Pairs profitieren von der Cache des laufenden Requests.

    `pairs`: kommagetrennt, Eintrag optional mit eigenem Start als
    `EURUSD:2026-06-01` (jedes Signal hat einen anderen Startpunkt); ohne
    Doppelpunkt gilt `since`.
    Antwort: `{"pairs": {"EURUSD": {"D": [...], "W": [...]}, ...}}`"""
    out: dict[str, dict[str, list]] = {}
    for raw in pairs.split(",")[:30]:
        sym, _, own_since = raw.strip().partition(":")
        inst = sym.replace("/", "").replace("_", "").upper()
        if not inst or inst in out:
            continue
        start = own_since.strip() or since
        try:
            daily = daily_for_candles(inst, start)
        except Exception as e:
            print(f"candles/batch: OANDA-Fehler {inst}: {e}")
            continue
        if daily.empty:
            continue
        out[inst] = {
            "D": simple_candles(daily, "D", start),
            "W": simple_candles(daily, "W", start),
        }
    return {"pairs": out}


@app.get("/health")
@app.get("/doctor")  # Alias für bestehende Uptime-Pinger-Konfiguration
def health_ping():
    """Leichter Uptime-Ping (UptimeRobot/Render Keep-Alive): sofortiges 200,
    keine Cache-/DB-/Engine-Zugriffe — /api/health bleibt der Detail-Status."""
    return PlainTextResponse("ok")


@app.get("/api/health")
def health():
    # Signal-Ablage explizit ausweisen. Faellt sie aus, kommt der Telegram-Alert
    # trotzdem an (anderer Zugang) — Cockpit und Outlook bleiben aber leer, und
    # das war bisher nur im Render-Log zu sehen.
    signals_ok, signals_grund = supabase_signals.diagnose()
    return {
        "status": "ok",
        "zones": len(ZONES),
        "pairs": len(LIVE_CACHE["data"]),
        "pairs_total": len(PAIRS),
        "triggered": len(TRIGGERED),
        "consumed": sum(len(v) for sides in CONSUMED.values() for v in sides.values()),
        "live": bool(LIVE_CACHE["live"]),
        "updated": LIVE_CACHE["updated"],
        "signals_ok": signals_ok,
        "signals_reason": signals_grund,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)