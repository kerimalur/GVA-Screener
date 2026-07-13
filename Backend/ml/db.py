"""Supabase-REST-Zugriff fürs ML-Modul (gleiches Muster wie supabase_signals.py).

Kein Python-SDK — schlichtes requests gegen PostgREST. Service-Role-Key
umgeht RLS. Fehlt die Konfiguration, werfen die Funktionen RuntimeError
(das ML-Modul ist ohne Supabase nutzlos, anders als der Signal-Hook).
"""
import os

import requests

PAGE_SIZE = 1000


def _config():
    # strip(): Copy-Paste-Newlines/Spaces in Secrets (GitHub Actions) sind
    # ein klassischer Fehler — %0a im Hostnamen lässt DNS scheitern.
    url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen — ML-Modul braucht Supabase."
        )
    return url.rstrip("/"), key


def _headers(key: str, extra: dict | None = None) -> dict:
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def select_all(table: str, params: dict) -> list[dict]:
    """Paginiertes SELECT (PostgREST cappt bei 1000 Zeilen/Request)."""
    url, key = _config()
    out: list[dict] = []
    offset = 0
    while True:
        r = requests.get(
            f"{url}/rest/v1/{table}",
            params={**params, "limit": PAGE_SIZE, "offset": offset},
            headers=_headers(key),
            timeout=60,
        )
        r.raise_for_status()
        rows = r.json()
        out.extend(rows)
        if len(rows) < PAGE_SIZE:
            return out
        offset += PAGE_SIZE


def insert(table: str, rows: list[dict] | dict, upsert_on: str | None = None) -> None:
    url, key = _config()
    prefer = "return=minimal"
    params = {}
    if upsert_on:
        prefer += ",resolution=merge-duplicates"
        params["on_conflict"] = upsert_on
    r = requests.post(
        f"{url}/rest/v1/{table}",
        json=rows,
        params=params,
        headers=_headers(key, {"Prefer": prefer}),
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"{table} insert fehlgeschlagen ({r.status_code}): {r.text[:300]}")


def delete(table: str, match: dict) -> None:
    url, key = _config()
    r = requests.delete(
        f"{url}/rest/v1/{table}",
        params=match,
        headers=_headers(key, {"Prefer": "return=minimal"}),
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"{table} delete fehlgeschlagen ({r.status_code}): {r.text[:300]}")


def update(table: str, match: dict, patch: dict) -> None:
    url, key = _config()
    r = requests.patch(
        f"{url}/rest/v1/{table}",
        json=patch,
        params=match,
        headers=_headers(key, {"Prefer": "return=minimal"}),
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"{table} update fehlgeschlagen ({r.status_code}): {r.text[:300]}")
