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

Grenze der Methode: OANDA liefert nur abgeschlossene Tageskerzen. Ein Treffer
wird also spätestens mit dem nächsten Tagesschluss (NY 17:00) nachgetragen,
nicht sekundengenau. Genau dafür ist er als "nachträglich erkannt" markiert.
"""
from __future__ import annotations

import pandas as pd

from analyzer import GVA_SIZE_FACTOR, GVA_TOL_PCT
from replay.gva_history import collect_hits, refine_hit_day

# Key in `screener_state` — muss die Downtime überleben, deshalb Supabase.
LAST_SCAN_KEY = "last_backfill_scan"


def find_late_hits(
    df_3d: pd.DataFrame,
    daily: pd.DataFrame,
    instrument: str,
    since_day: str,
    consumed: dict | None = None,
    size_factor: float = GVA_SIZE_FACTOR,
    tol_pct: float = GVA_TOL_PCT,
) -> list[dict]:
    """Alle Linien-Treffer ab `since_day` (ISO-Datum, inklusiv), die noch nicht
    verbraucht sind — chronologisch aufsteigend.

    `consumed` = {"SHORT": {level, ...}, "LONG": {...}} (Level auf 5 Stellen
    gerundet, identisch zu select_lines). Treffer auf bereits consumed Linien
    werden hier ausgefiltert und erzeugen damit weder Signal noch Alert.
    """
    if df_3d is None or df_3d.empty or daily is None or daily.empty:
        return []

    consumed = consumed or {}
    # refine_hit_day sucht innerhalb des 3D-Blocks (Blockstart bis +6 Tage) und
    # liefert nie ein frueheres Datum. Alles, was selbst im spaetesten Fall vor
    # dem Fenster laege, wird ohne pandas-Slice verworfen — sonst wuerde die
    # Verfeinerung ueber die komplette 20-Jahres-Historie laufen.
    cutoff_block = (
        pd.Timestamp(since_day) - pd.Timedelta(days=6)
    ).date().isoformat()

    out: list[dict] = []
    for hit in collect_hits(df_3d, instrument, size_factor, tol_pct):
        if hit["hit_block_date"] < cutoff_block:
            continue
        day = refine_hit_day(hit, daily)
        if day < since_day:
            continue
        level = round(float(hit["level"]), 5)
        if level in consumed.get(hit["direction"], set()):
            continue
        out.append({**hit, "level": level, "hit_date": day})

    out.sort(key=lambda h: h["hit_date"])
    return out


def alert_text(pair: str, hit: dict) -> str:
    """Telegram-Text für einen nachträglich erkannten Hit — bewusst anders
    formuliert als der Live-Alert, damit er nie wie ein frischer Hit aussieht."""
    return (
        "⏱ *GVA LINE HIT — NACHTRÄGLICH ERKANNT* ⏱\n\n"
        f"*Pair:* {pair}\n"
        f"*Typ:* {hit['direction']} LINE\n"
        f"*Line Level:* {round(hit['level'], 5)}\n"
        f"*Getroffen am:* {hit['hit_date']}\n"
        f"*Formiert am:* {hit.get('line_formed_date', '–')}\n\n"
        "_Aus der Kerzen-Historie nachgetragen (Backend war offline). "
        "Preis kann inzwischen weit weg sein — vor dem Trade prüfen._"
    )
