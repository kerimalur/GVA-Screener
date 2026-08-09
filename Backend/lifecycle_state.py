"""Lebenszyklus-Zustand des Screeners — TRIGGERED / CONSUMED / ALERT_CACHE.

**Quelle der Wahrheit ist Supabase (Tabelle `signals`), nicht `state.json`.**
Render (Free) hat kein persistentes Dateisystem: jeder Deploy, Restart oder
Recycle löscht die Datei. Ohne Reset verstummt der Screener (alles bleibt
sticky HIT), mit Reset feuert er erneut auf längst getradete Setups. Beide
Zustände sind am Bildschirm nicht unterscheidbar — deshalb liegt der Zustand
jetzt in der DB, die den Neustart überlebt.

Status-Mapping (bestehende Zeilen bleiben unverändert gültig, kein Rewrite):
  'new'       -> TRIGGERED, pending=False   (frischer HIT, unentschieden)
  'watchlist' -> TRIGGERED, pending=True    (beobachtet)
  'journaled' -> CONSUMED                   (Trade genommen)
  'dismissed' -> CONSUMED                   (verworfen / im Scanner "Fertig")

`state.json` bleibt als reiner Cache erhalten (nützlich lokal und wenn Supabase
gerade nicht erreichbar ist), ist aber nie mehr die Wahrheit. Beim Zusammenführen
gilt die konservative Regel: **im Zweifel consumed** — lieber ein Alert zu wenig
als eine Flut auf Linien, die längst gehandelt wurden.

Ein offener HIT, der nie journaled/dismissed wird, bliebe sonst für immer
sticky im Board stehen ("GVA gehittet" zeigt Wochen später noch Setups, die
längst durchgelaufen sind). Deshalb gilt zusätzlich: **älter als
HIT_EXPIRY_DAYS = kein aktiver Trigger mehr**, unabhängig vom Status (new
oder watchlist). Das ist kein "consumed" - die Linie bleibt handelbar, falls
der Preis sie später erneut beruehrt, sie verschwindet nur aus der aktiven
Anzeige, wenn sie zu alt ist, um noch als aktuelles Setup zu gelten.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

import supabase_signals

# Ab diesem Alter gilt ein offener HIT nicht mehr als aktives Setup - siehe
# Modulkopf. Bewusst als eigene Konstante, nicht an CONSUMED gekoppelt: die
# Linie ist nicht "erledigt", nur nicht mehr aktuell genug fuers Live-Board.
HIT_EXPIRY_DAYS = 7


def _ist_abgelaufen(hit_at) -> bool:
    """True, wenn `hit_at` laenger als HIT_EXPIRY_DAYS zurückliegt.

    Ohne verwertbares Datum gilt der Hit als NICHT abgelaufen - eine
    Datenlücke soll ein Setup nicht stumm aus der Anzeige werfen.
    """
    if not hit_at:
        return False
    try:
        ts = datetime.fromisoformat(str(hit_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts) > timedelta(days=HIT_EXPIRY_DAYS)

# Fallback fuer Altzeilen ohne `line_formed_date` (vor der Migration
# `signals_line_formed_date` gab es die Spalte nicht). Reine Anzeige-
# Information; select_lines() arbeitet ausschliesslich mit Level + Side.
_UNKNOWN_DATE = None


def _round(level) -> float:
    return round(float(level), 5)


def _side_of(row: dict) -> str | None:
    lt = (row.get("line_type") or "").upper()
    return lt if lt in ("SHORT", "LONG") else None


def state_from_rows(rows: list[dict]) -> tuple[dict, dict, dict]:
    """Signals-Zeilen -> (TRIGGERED, CONSUMED, ALERT_CACHE).

    `rows` muss nach hit_at absteigend sortiert sein — pro Paar gewinnt damit
    der jüngste offene HIT. Eine Linie, die bereits consumed ist, wird nie als
    TRIGGERED zurückgegeben (defensiv gegen widersprüchliche Historie).
    """
    consumed: dict[str, dict[str, set]] = {}
    triggered: dict[str, dict] = {}
    alert_cache: dict[str, float] = {}

    for row in rows:
        side = _side_of(row)
        pair = row.get("pair")
        if not pair or side is None or row.get("line_level") is None:
            continue
        if row.get("status") in supabase_signals.CONSUMED_STATUSES:
            consumed.setdefault(pair, {}).setdefault(side, set()).add(_round(row["line_level"]))

    for row in rows:
        side = _side_of(row)
        pair = row.get("pair")
        status = row.get("status")
        if not pair or side is None or row.get("line_level") is None:
            continue
        if status not in supabase_signals.TRIGGERED_STATUSES:
            continue
        if pair in triggered:
            continue  # jüngste Zeile hat gewonnen (Sortierung hit_at desc)
        if _ist_abgelaufen(row.get("hit_at")):
            continue  # älter als HIT_EXPIRY_DAYS -> kein aktives Setup mehr
        level = _round(row["line_level"])
        if level in consumed.get(pair, {}).get(side, set()):
            continue  # Linie wurde später verbraucht -> kein offener HIT
        triggered[pair] = {
            "side": side,
            "level": level,
            # Bildungsdatum ueberlebt den Neustart, seit signals es speichert.
            "date": row.get("line_formed_date") or _UNKNOWN_DATE,
            "pending": status == "watchlist",
            "detected_late": bool(row.get("detected_late")),
            # Fuer reconcile(): dort laeuft der Prozess evtl. tagelang durch,
            # ohne dass state_from_rows erneut aufgerufen wird - die Ablauf-
            # Pruefung braucht daher ihr eigenes hit_at im laufenden Zustand.
            "hit_at": row.get("hit_at"),
        }
        # Alert-Dedupe vorbelegen: nach dem Neustart darf derselbe offene HIT
        # nicht erneut nach Telegram gehen.
        alert_cache[f"{pair}_{side}"] = level

    return triggered, consumed, alert_cache


def read_cache_file(path: str) -> tuple[dict, dict]:
    """`state.json` lesen -> (TRIGGERED, CONSUMED). Fehlt/kaputt = leer."""
    try:
        with open(path) as f:
            d = json.load(f)
    except FileNotFoundError:
        return {}, {}
    except Exception as e:
        print(f"lifecycle: Cache-Datei unlesbar ({e}) -> ignoriert")
        return {}, {}
    triggered = d.get("triggered") or {}
    consumed = {
        p: {s: {_round(v) for v in levels} for s, levels in sides.items()}
        for p, sides in (d.get("consumed") or {}).items()
    }
    return triggered, consumed


def write_cache_file(path: str, triggered: dict, consumed: dict) -> None:
    """`state.json` schreiben — reiner Cache, keine Quelle der Wahrheit.
    Format unverändert (pair -> side -> Levelliste), damit alte Dateien
    weiterhin gelesen werden können."""
    try:
        data = {
            "triggered": triggered,
            "consumed": {
                p: {s: sorted(levels) for s, levels in sides.items()}
                for p, sides in consumed.items()
            },
        }
        with open(path, "w") as f:
            json.dump(data, f)
    except Exception as e:
        print(f"lifecycle: Cache-Datei schreiben fehlgeschlagen: {e}")


def merge_consumed(target: dict, extra: dict) -> None:
    """`extra` in `target` vereinigen (in-place). Consumed wird nie vergessen."""
    for pair, sides in extra.items():
        for side, levels in sides.items():
            target.setdefault(pair, {}).setdefault(side, set()).update(
                _round(v) for v in levels
            )


def load_lifecycle(state_file: str) -> tuple[dict, dict, dict, str]:
    """Zustand beim Start aufbauen.

    Rückgabe: (TRIGGERED, CONSUMED, ALERT_CACHE, quelle)
    quelle ist 'supabase' oder 'cache' — nur fürs Log.
    """
    file_triggered, file_consumed = read_cache_file(state_file)
    # Offene Signale kommen aus einem begrenzten Fenster, verbrauchte Linien
    # vollstaendig — ein Limit auf CONSUMED wuerde alte Linien wieder freigeben.
    rows = supabase_signals.fetch_lifecycle_rows()

    if rows is None:
        # Supabase nicht konfiguriert/erreichbar -> Cache ist alles, was wir haben.
        return file_triggered, file_consumed, {}, "cache"

    triggered, consumed, alert_cache = state_from_rows(rows)
    merge_consumed(consumed, file_consumed)

    # Migration state.json -> Supabase: Ein Paar, das die Datei als offenen HIT
    # kennt, Supabase aber nicht, ist unklar (Signal-Insert war damals nicht
    # konfiguriert oder ging verloren). Im Zweifel CONSUMED, damit beim ersten
    # Start nach dem Deploy kein Alert-Sturm auf alte Linien entsteht.
    for pair, trig in file_triggered.items():
        if pair in triggered:
            continue
        side = (trig.get("side") or "").upper()
        level = trig.get("level")
        if side in ("SHORT", "LONG") and level is not None:
            consumed.setdefault(pair, {}).setdefault(side, set()).add(_round(level))

    return triggered, consumed, alert_cache, "supabase"


def reconcile(triggered: dict, consumed: dict, alert_cache: dict,
              rows: list[dict] | None) -> bool:
    """Laufenden Zustand gegen Supabase abgleichen (in-place).

    Schliesst den Lebenszyklus auch dann, wenn ein Signal ausserhalb von
    /api/mark seinen Status ändert (z.B. direkt im Journal). Damit kann kein
    Paar dauerhaft in TRIGGERED hängen bleiben, ohne dass eine Nutzeraktion
    oder ein Consume es löst.

    Rückgabe: True, wenn sich etwas geändert hat.
    """
    if rows is None:
        return False  # nicht erreichbar -> laufenden Zustand nicht anfassen

    _db_triggered, db_consumed, db_cache = state_from_rows(rows)
    changed = False

    before = {p: {s: set(v) for s, v in sides.items()} for p, sides in consumed.items()}
    merge_consumed(consumed, db_consumed)
    if consumed != before:
        changed = True

    for pair in list(triggered.keys()):
        trig = triggered[pair]
        side = trig.get("side")
        level = trig.get("level")
        if side is None or level is None:
            continue
        if _round(level) in consumed.get(pair, {}).get(side, set()):
            triggered.pop(pair, None)
            alert_cache.pop(f"{pair}_{side}", None)
            changed = True
            continue
        # Der Prozess kann tagelang durchlaufen, ohne neu zu starten - ohne
        # diese Prüfung würde load_lifecycle()'s Ablaufregel nur beim
        # (seltenen) Neustart greifen und ein alter HIT bliebe im Board
        # sticky stehen, bis irgendwann ein Consume kommt.
        if _ist_abgelaufen(trig.get("hit_at")):
            triggered.pop(pair, None)
            alert_cache.pop(f"{pair}_{side}", None)
            changed = True

    # Offene HITs aus der DB, die der Prozess nicht kennt (z.B. Insert-Lag),
    # nur im Alert-Cache vermerken — kein Wiederbeleben alter Trigger.
    for k, v in db_cache.items():
        if k not in alert_cache:
            alert_cache[k] = v

    return changed


def default_state_file() -> str:
    return os.path.join(os.path.dirname(__file__), "state.json")
