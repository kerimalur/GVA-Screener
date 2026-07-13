"""Supabase-Zugriff der Engine — nutzt ml.db (PostgREST) + insert_ignore."""
from __future__ import annotations

import requests

from ml.db import _config, _headers, insert, select_all, update  # noqa: F401


def insert_ignore(table: str, rows: list[dict] | dict, on_conflict: str) -> None:
    """Insert-only: Duplikate (PK-Konflikt) werden ignoriert, nie überschrieben."""
    url, key = _config()
    r = requests.post(
        f"{url}/rest/v1/{table}",
        json=rows,
        params={"on_conflict": on_conflict},
        headers=_headers(key, {"Prefer": "return=minimal,resolution=ignore-duplicates"}),
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"{table} insert_ignore fehlgeschlagen ({r.status_code}): {r.text[:300]}")
