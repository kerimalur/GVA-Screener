"""Makro & Stärke: Daten für Power Index, Stärke Matrix, Datenzentrum, Kalender.

Alle Quellen gratis & ohne API-Key:
  - FRED CSV          : 10Y-Zins, CPI -> Real-Zins, Zins-Drehung -> Stärke-Score (via fundamentals.py)
  - CFTC Socrata JSON : Commercials Netto-Position (52 Wochen) je Währung
  - faireconomy       : ForexFactory-Wochenkalender (keyfrei)

Degradiert sauber: schlägt eine Quelle fehl, bleiben die STATIC-Werte stehen
(kein Crash, Endpoint liefert immer ein vollständiges Objekt).
Die Ausgabe-Objekte matchen 1:1 das Frontend-Interface G8Currency.
"""
import math
import time
from datetime import datetime, timezone

import requests

import fundamentals

ORDER = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]

# CFTC Legacy Futures-Only Report (Socrata). Filter über market_and_exchange_names.
SOCRATA = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"
COT_CONTRACT = {
    "EUR": "EURO FX",
    "GBP": "BRITISH POUND",
    "JPY": "JAPANESE YEN",
    "AUD": "AUSTRALIAN DOLLAR",
    "NZD": "NEW ZEALAND DOLLAR",
    "CAD": "CANADIAN DOLLAR",
    "CHF": "SWISS FRANC",
    "USD": "U.S. DOLLAR INDEX",
}

# ForexFactory-Wochenkalender (keyfrei, via faireconomy CDN).
FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
IMPACT_MAP = {"High": 3, "Medium": 2, "Low": 1, "Holiday": 0}


def _gen_cot(s, e, amp, k):
    out = []
    for i in range(52):
        t = i / 51
        base = s + (e - s) * t
        wave = math.sin(i * 0.55 + k) * amp + math.sin(i * 0.23 + k * 1.7) * amp * 0.5
        out.append(round(base + wave))
    return out


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


# Vollständige Fallback-/Basisdaten (Leitzins + Texte sind editorial/selten änderbar;
# score/cpi/tenY/realRate/chg/cot werden bei Erfolg von echten Quellen überschrieben).
STATIC = [
    {"code": "CAD", "name": "Kanada", "rate": 4.25, "score": 8.5, "chg": 1.2, "realRate": 2.25, "cpi": 2.0, "tenY": 3.30, "cot": _gen_cot(-6, -52, 5, 1),
     "gdpRole": "Robustes BIP-Wachstum stützt CAD; rohstoffgetriebene Konjunktur reagiert stark auf Ölpreis.",
     "tradeRole": "Hoher Handelsbilanzüberschuss durch Energie-Exporte (v.a. in die USA) wirkt CAD-positiv."},
    {"code": "NZD", "name": "Neuseeland", "rate": 5.25, "score": 6.2, "chg": 0.8, "realRate": 3.05, "cpi": 2.2, "tenY": 4.40, "cot": _gen_cot(6, -22, 4, 2),
     "gdpRole": "Solides BIP, aber kleine Volkswirtschaft — empfindlich gegenüber globaler Risikostimmung.",
     "tradeRole": "Agrar-/Milchexporte dominieren die Handelsbilanz; China-Nachfrage ist der Haupttreiber."},
    {"code": "AUD", "name": "Australien", "rate": 4.10, "score": 4.1, "chg": 1.5, "realRate": 0.50, "cpi": 3.6, "tenY": 4.00, "cot": _gen_cot(4, -30, 4, 3),
     "gdpRole": "BIP eng an Rohstoffzyklus (Eisenerz, Kohle) gekoppelt; China-Wachstum entscheidend.",
     "tradeRole": "Großer Exportüberschuss bei Industriemetallen stützt AUD in Risk-On-Phasen."},
    {"code": "USD", "name": "USA", "rate": 5.00, "score": 1.5, "chg": -0.4, "realRate": 1.90, "cpi": 3.1, "tenY": 4.28, "cot": _gen_cot(32, -18, 6, 4),
     "gdpRole": "Größte Volkswirtschaft; BIP-Stärke + hoher Realzins ziehen Kapital an (USD-Reservestatus).",
     "tradeRole": "Strukturelles Handelsdefizit, aber als Reservewährung von Kapitalflüssen statt Handel getrieben."},
    {"code": "GBP", "name": "Großbritannien", "rate": 4.50, "score": 0.3, "chg": 0.6, "realRate": 1.10, "cpi": 3.4, "tenY": 4.12, "cot": _gen_cot(-24, 0, 5, 5),
     "gdpRole": "Dienstleistungslastiges BIP; moderate Wachstumsdynamik hält GBP nahe neutral.",
     "tradeRole": "Handelsdefizit bei Gütern, teils ausgeglichen durch Finanzdienstleistungs-Exporte."},
    {"code": "EUR", "name": "Eurozone", "rate": 3.75, "score": -0.8, "chg": -1.1, "realRate": 1.35, "cpi": 2.4, "tenY": 2.51, "cot": _gen_cot(-42, 2, 6, 6),
     "gdpRole": "Schwaches BIP-Momentum (v.a. Industrie) belastet EUR; fragmentierte Konjunktur.",
     "tradeRole": "Exportüberschuss (Deutschland) ist EUR-stützend, aber von Energiekosten gedämpft."},
    {"code": "CHF", "name": "Schweiz", "rate": 1.25, "score": -6.0, "chg": -0.9, "realRate": 0.15, "cpi": 1.1, "tenY": 0.68, "cot": _gen_cot(-4, 20, 4, 7),
     "gdpRole": "Stabiles BIP, niedrige Inflation; CHF eher Safe-Haven als wachstumsgetrieben.",
     "tradeRole": "Hoher Exportüberschuss (Pharma, Uhren); SNB interveniert gegen zu starken CHF."},
    {"code": "JPY", "name": "Japan", "rate": 0.50, "score": -9.2, "chg": -2.0, "realRate": -2.50, "cpi": 3.0, "tenY": 0.98, "cot": _gen_cot(-12, 88, 7, 8),
     "gdpRole": "Schwaches BIP + negativer Realzins belasten JPY massiv (Carry-Trade-Finanzierung).",
     "tradeRole": "Importabhängig bei Energie; Handelsbilanz schwankt mit Ölpreis und Yen-Schwäche."},
]

CAL_FALLBACK = [
    {"time": "Heute, 14:30", "ccy": "USD", "impact": 3, "event": "Core CPI (MoM)", "actual": "—", "forecast": "0.3%", "previous": "0.4%"},
    {"time": "Morgen, 09:30", "ccy": "CHF", "impact": 3, "event": "SNB Zinsentscheid", "actual": "—", "forecast": "1.50%", "previous": "1.50%"},
]


def static_currencies():
    """Tiefe Kopie der Basisdaten (für Endpoint, solange der Loop noch nicht lief)."""
    return [dict(c, cot=list(c["cot"])) for c in STATIC]


def fetch_cot(ccy):
    """52 Wochen Commercials-Netto (long − short) in Tausend Kontrakten, chronologisch."""
    contract = COT_CONTRACT.get(ccy)
    if not contract:
        return None
    params = {
        "$select": "report_date_as_yyyy_mm_dd,comm_positions_long_all,comm_positions_short_all",
        "$where": f"market_and_exchange_names like '%{contract}%'",
        "$order": "report_date_as_yyyy_mm_dd DESC",
        "$limit": "52",
    }
    try:
        r = requests.get(SOCRATA, params=params, timeout=20)
        r.raise_for_status()
        rows = r.json()
    except Exception as e:
        print(f"COT Fehler {ccy}: {e}")
        return None
    if not rows:
        return None
    series = []
    for row in rows:
        try:
            lo = float(row.get("comm_positions_long_all") or 0)
            sh = float(row.get("comm_positions_short_all") or 0)
        except (TypeError, ValueError):
            continue
        series.append(round((lo - sh) / 1000.0))
    if not series:
        return None
    series.reverse()  # älteste -> neueste
    if len(series) < 52:
        series = [series[0]] * (52 - len(series)) + series
    return series[-52:]


def compute_currency(base):
    """Ein STATIC-Eintrag, angereichert mit echten FRED-/CFTC-Werten (Fallback = STATIC)."""
    c = dict(base, cot=list(base["cot"]))
    ccy = c["code"]
    try:
        ten, chg3m = fundamentals.long_term_rate(ccy)
        cpi = fundamentals.cpi_yoy(ccy)
        if ten is not None:
            c["tenY"] = round(ten, 2)
        if cpi is not None:
            c["cpi"] = round(cpi, 1)
            c["realRate"] = round(c["rate"] - cpi, 2)
        # Score-Heuristik: Real-Zins + Zins-Drehung, geklemmt auf -10..+10.
        if cpi is not None or chg3m is not None:
            score = c["realRate"] * 1.4 + (chg3m or 0) * 2.0
            c["score"] = round(_clamp(score, -10, 10), 1)
        if chg3m is not None:
            c["chg"] = round(chg3m, 1)
    except Exception as e:
        print(f"compute_currency Fehler {ccy}: {e}")
    cot = fetch_cot(ccy)
    if cot:
        c["cot"] = cot
    return c


def build_macro():
    """Alle 8 Währungen mit echten Daten (langsam: FRED+CFTC). Für den 6h-Loop."""
    out = []
    for base in STATIC:
        out.append(compute_currency(base))
        time.sleep(0.2)  # höflich gegenüber den Gratis-APIs
    return {"currencies": out, "updated": time.time()}


def _fmt_time(iso):
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(timezone.utc)
        return d.strftime("%d. %b %H:%M")
    except Exception:
        return str(iso) if iso else ""


def fetch_calendar():
    """ForexFactory-Wochenkalender (keyfrei) -> Frontend-Eventformat."""
    try:
        r = requests.get(FF_URL, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        rows = r.json()
    except Exception as e:
        print(f"Kalender Fehler: {e}")
        return CAL_FALLBACK
    out = []
    for ev in rows:
        cur = ev.get("country") or ev.get("currency")
        impact = IMPACT_MAP.get(ev.get("impact"), 1)
        if impact == 0:
            continue
        out.append({
            "time": _fmt_time(ev.get("date")),
            "ccy": cur or "?",
            "impact": impact,
            "event": ev.get("title", ""),
            "actual": ev.get("actual") or "—",
            "forecast": ev.get("forecast") or "—",
            "previous": ev.get("previous") or "—",
        })
    out.sort(key=lambda x: -x["impact"])
    return out[:40] or CAL_FALLBACK


def selftest():
    print("== Makro Selbsttest ==")
    data = build_macro()
    for c in data["currencies"]:
        print(f"{c['code']}  score={c['score']:5}  tenY={c['tenY']:5}  cpi={c['cpi']:4}  cot[-1]={c['cot'][-1]}")
    cal = fetch_calendar()
    print(f"Kalender: {len(cal)} Events")
    for e in cal[:5]:
        print(f"  {e['time']:16} {e['ccy']:4} [{e['impact']}] {e['event']}")


if __name__ == "__main__":
    selftest()
