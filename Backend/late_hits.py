"""Arbeitspaket B — nachträglich erkannte Hits ("Downtime-Lücke").

Die Live-Kreuzungs-Erkennung in `evaluate_pair` braucht einen Vortick
(`PREV_PRICE`). Nach jedem Restart ist der leer, und Render (Free) schläft nach
15 min ein — der Keep-Alive ist ein GitHub-Cron, der sich um 5–20 min verzögern
kann. Eine Linie, die in diesem Fenster durchquert wird und danach nicht
zurückkommt, wird live nie erkannt: kein Alert, kein Log, keine Spur.

Die 3D-Kerzen-Historie kennt die Downtime dagegen nicht. Deshalb prüfen wir bei
jedem Zonen-Refresh (15 min) mit **derselben** Erkennungslogik wie der Replay
(`replay.gva_history.collect_hits`), ob seit dem letzten Lauf eine Linie berührt
wurde. Keine zweite Hit-Logik — nur ein zweiter Zeitpunkt.

Grenzen der Methode — bewusst akzeptiert, damit sie hier dokumentiert und nicht
im Betrieb entdeckt werden:

1. OANDA liefert nur abgeschlossene Tageskerzen. Ein Treffer wird also
   spätestens mit dem nächsten Tagesschluss (NY 17:00) nachgetragen, nicht
   sekundengenau. Genau dafür ist er als "nachträglich erkannt" markiert.
2. Je Paar und Fenster wird **nur der jüngste** Treffer nachgetragen. Das
   Sticky-Modell kennt genau einen offenen HIT je Paar; ältere Treffer
   desselben Paars im selben Fenster gehen endgültig verloren, weil das
   Fenster mit dem nächsten erfolgreichen Lauf nachrückt. In der Praxis ist
   das der seltene Fall einer mehrtägigen Downtime mit mehreren Treffern auf
   demselben Paar.
"""
from __future__ import annotations

import pandas as pd

from analyzer import GVA_SIZE_FACTOR, GVA_TOL_PCT
from replay.gva_history import collect_hits, refine_hit_day

# Alt-Key aus dem ersten Wurf: EIN globaler Zeitstempel für alle Paare. Wird nur
# noch gelesen, um beim ersten Lauf nach dem Deploy die Pair-Zeitstempel zu
# füllen (sonst gälte jedes Paar fälschlich als "erster Lauf" und der Nachtrag
# bliebe einmalig stumm).
LAST_SCAN_KEY = "last_backfill_scan"

# Aktueller Key: {pair: iso_timestamp}. Bewusst EIN Key mit Dict statt 28
# Einzel-Keys — das sind pro Zonen-Refresh ein Lesevorgang und ein Schreibvorgang
# statt 56 Roundtrips. Nötig ist die Aufschlüsselung, weil ein global
# fortgeschriebener Zeitstempel das Fenster auch für Paare schliesst, die im
# selben Lauf ausgefallen sind — deren verpasste Hits wären dann für immer weg.
LAST_SCAN_BY_PAIR_KEY = "last_backfill_scan_by_pair"


def find_late_hits(
    df_blocks: pd.DataFrame,
    daily: pd.DataFrame,
    instrument: str,
    since_day: str,
    consumed: dict | None = None,
    size_factor: float = GVA_SIZE_FACTOR,
    tol_pct: float = GVA_TOL_PCT,
    tf: str = "3D",
) -> list[dict]:
    """Alle Linien-Treffer ab `since_day` (ISO-Datum, inklusiv), die noch nicht
    verbraucht sind — chronologisch aufsteigend.

    `df_blocks` sind die Kerzen des jeweiligen Timeframes (3D-Bloecke ODER
    Wochenkerzen), `tf` benennt ihn ("3D"/"W"). Jeder Treffer traegt das Tag
    im Ergebnis mit, damit Alert und Signal den Timeframe ausweisen koennen.

    `consumed` = {"SHORT": {level, ...}, "LONG": {...}} (Level auf 5 Stellen
    gerundet, identisch zu select_lines). Treffer auf bereits consumed Linien
    werden hier ausgefiltert und erzeugen damit weder Signal noch Alert.
    """
    if df_blocks is None or df_blocks.empty or daily is None or daily.empty:
        return []

    consumed = consumed or {}
    # Ein 3D-Block spannt bis zu 6 Kalendertage, eine Wochenkerze bis zu 7.
    block_days = 7 if str(tf).upper() == "W" else 6
    # refine_hit_day sucht innerhalb des Blocks (Blockstart bis +block_days) und
    # liefert nie ein frueheres Datum. Alles, was selbst im spaetesten Fall vor
    # dem Fenster laege, wird ohne pandas-Slice verworfen — sonst wuerde die
    # Verfeinerung ueber die komplette 20-Jahres-Historie laufen.
    cutoff_block = (
        pd.Timestamp(since_day) - pd.Timedelta(days=block_days)
    ).date().isoformat()

    out: list[dict] = []
    for hit in collect_hits(df_blocks, instrument, size_factor, tol_pct):
        if hit["hit_block_date"] < cutoff_block:
            continue
        day = refine_hit_day(hit, daily, block_days)
        if day < since_day:
            continue
        level = round(float(hit["level"]), 5)
        if level in consumed.get(hit["direction"], set()):
            continue
        out.append({**hit, "level": level, "hit_date": day, "tf": tf})

    out.sort(key=lambda h: h["hit_date"])
    return out


def alert_text(pair: str, hit: dict) -> str:
    """Telegram-Text für einen nachträglich erkannten Hit — bewusst anders
    formuliert als der Live-Alert, damit er nie wie ein frischer Hit aussieht."""
    return (
        "⏱ *GVA LINE HIT — NACHTRÄGLICH ERKANNT* ⏱\n\n"
        f"*Pair:* {pair}\n"
        f"*Typ:* {hit['direction']} LINE ({hit.get('tf', '3D')})\n"
        f"*Line Level:* {round(hit['level'], 5)}\n"
        f"*Getroffen am:* {hit['hit_date']}\n"
        f"*Formiert am:* {hit.get('line_formed_date', '–')}\n\n"
        "_Aus der Kerzen-Historie nachgetragen (Backend war offline). "
        "Preis kann inzwischen weit weg sein — vor dem Trade prüfen._"
    )
