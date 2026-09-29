"""Wirtschaftskalender aus dem MetaTrader -> Supabase (29.09.2026).

Der MQL5-Dienst KerimosKalender.mq5 schreibt alle fuenf Minuten den
MT5-Kalender (Ist, Prognose, Vorwert) der acht Hauptwaehrungen in eine Datei
im gemeinsamen Ordner aller Terminals. Diese Datei laedt die Bruecke nach
trading.mt5_kalender. KerimOS ordnet die Zeilen dort den Forex-Factory-
Terminen zu und holt sich daraus das Ist fuers Makro-Terminal.

Warum der Umweg ueber eine Datei: das Python-Paket MetaTrader5 kennt keine
Kalender-Funktionen, nur MQL5 kommt an CalendarValueHistory heran.

Hochgeladen wird nur, was sich seit dem letzten Mal geaendert hat. Beim
ersten Durchgang nach dem Start ist das die ganze Historie (einige tausend
Zeilen, in Stuecken zu 500), danach meist eine Handvoll.
"""
from __future__ import annotations

import csv
import json
import os
import time
from datetime import datetime, timezone

DATEI = os.path.join(
    os.environ.get("APPDATA", ""), "MetaQuotes", "Terminal", "Common", "Files",
    "kerimos_kalender.csv",
)
TABELLE = "mt5_kalender"
TAKT_SEKUNDEN = 300
# Ist die Datei aelter, laeuft der Dienst nicht mehr — einmal melden.
ALT_SEKUNDEN = 3600
STUECK = 500

_zustand: dict = {"lauf": 0.0, "mtime": None, "meldung": None}
_fingerabdruck: dict[int, str] = {}


def _zahl(s: str | None) -> float | None:
    s = (s or "").strip()
    return float(s) if s else None


def lies(pfad: str = DATEI) -> list[dict]:
    """Die Datei als Zeilen fuer die Tabelle. Kaputte Zeilen fallen weg."""
    zeilen: list[dict] = []
    # FILE_ANSI schreibt in der Windows-Codepage, nicht in UTF-8.
    with open(pfad, encoding="cp1252", errors="replace", newline="") as f:
        for z in csv.DictReader(f, delimiter=";"):
            try:
                t = datetime.strptime(z["time_utc"].strip(), "%Y.%m.%d %H:%M").replace(tzinfo=timezone.utc)
                zeilen.append({
                    "value_id": int(z["value_id"]),
                    "event_id": int(z["event_id"]),
                    "ccy": z["ccy"].strip(),
                    "name": z["name"].strip(),
                    "importance": z["importance"].strip() or None,
                    "event_time": t.isoformat(),
                    "actual": _zahl(z["actual"]),
                    "forecast": _zahl(z["forecast"]),
                    "previous": _zahl(z["previous"]),
                    "revised": _zahl(z["revised"]),
                    "multiplier": z["multiplier"].strip() or None,
                    "unit": z["unit"].strip() or None,
                })
            except (KeyError, ValueError, AttributeError):
                continue
    return zeilen


def _einmal(text: str) -> str | None:
    """Dieselbe Meldung nicht alle fuenf Minuten wiederholen."""
    if _zustand["meldung"] == text:
        return None
    _zustand["meldung"] = text
    return text


def hochladen(db, trocken: bool, erzwingen: bool = False, pfad: str = DATEI) -> str | None:
    """Ein Takt. Rueckgabe: Meldung fuers Log oder None, wenn nichts zu sagen ist."""
    jetzt = time.time()
    if not erzwingen and jetzt - _zustand["lauf"] < TAKT_SEKUNDEN:
        return None
    _zustand["lauf"] = jetzt

    if not os.path.exists(pfad):
        return _einmal(f"Kalender: {pfad} fehlt — laeuft der Dienst KerimosKalender im MetaTrader?")
    mtime = os.path.getmtime(pfad)
    if jetzt - mtime > ALT_SEKUNDEN:
        alt = _einmal(f"Kalender: Datei seit {int((jetzt - mtime) / 60)} Minuten nicht erneuert — Dienst KerimosKalender pruefen.")
        if mtime == _zustand["mtime"]:
            return alt
    if mtime == _zustand["mtime"] and not erzwingen:
        return None

    zeilen = lies(pfad)
    neu = []
    for z in zeilen:
        fp = json.dumps(z, sort_keys=True)
        if _fingerabdruck.get(z["value_id"]) != fp:
            neu.append((z, fp))

    if trocken:
        return f"[trocken] Kalender: {len(zeilen)} Zeilen, {len(neu)} neu oder geaendert"

    stempel = datetime.now(timezone.utc).isoformat()
    for i in range(0, len(neu), STUECK):
        stueck = neu[i:i + STUECK]
        db.table(TABELLE).upsert([{**z, "geholt_am": stempel} for z, _ in stueck],
                                 on_conflict="value_id").execute()
        # Erst nach dem Schreiben merken — bricht ein Stueck ab, kommt es
        # beim naechsten Takt wieder.
        for z, fp in stueck:
            _fingerabdruck[z["value_id"]] = fp
    _zustand["mtime"] = mtime
    _zustand["meldung"] = None
    return f"Kalender: {len(neu)} von {len(zeilen)} Zeilen hochgeladen" if neu else None
