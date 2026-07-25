"""Supabase-Zugriff der Engine — nutzt ml.db (PostgREST) + insert_ignore."""
from __future__ import annotations

import requests

from ml.db import _config, _headers, insert, select_all, update  # noqa: F401


def select_limited(table: str, params: dict, limit: int = 1000) -> list[dict]:
    """EIN SELECT mit hartem Limit — ohne die Pagination von `select_all`.

    `select_all` blättert immer bis zum Ende durch. Bei ml_experiments (>20k
    Zeilen inkl. metrics-JSON) ist das teuer, wenn nur die Spitze der
    hall_score-Rangliste gebraucht wird.
    """
    url, key = _config()
    r = requests.get(
        f"{url}/rest/v1/{table}",
        params={**params, "limit": limit},
        headers=_headers(key),
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def insert_ignore(table: str, rows: list[dict] | dict, on_conflict: str) -> int:
    """Insert-only: Duplikate (PK-Konflikt) werden ignoriert, nie überschrieben.

    Gibt die Anzahl der TATSÄCHLICH neu geschriebenen Zeilen zurück. `return=
    representation` + `resolution=ignore-duplicates` heisst: PostgREST liefert
    nur die wirklich eingefügten Zeilen (ON CONFLICT DO NOTHING → verworfene
    Duplikate stehen NICHT im Response-Body). So werden stille 0-Zeilen-Läufe
    sichtbar, statt als 2xx durchzurutschen.
    """
    url, key = _config()
    r = requests.post(
        f"{url}/rest/v1/{table}",
        json=rows,
        params={"on_conflict": on_conflict},
        headers=_headers(key, {"Prefer": "return=representation,resolution=ignore-duplicates"}),
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"{table} insert_ignore fehlgeschlagen ({r.status_code}): {r.text[:300]}")
    written = r.json()
    return len(written) if isinstance(written, list) else 0
