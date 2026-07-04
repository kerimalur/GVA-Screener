"""Additiver Supabase-Hook: schreibt jeden GVA-HIT als Zeile in `signals`.

Komplett vom Screener-Kern entkoppelt:
  - Läuft fire-and-forget in einem eigenen Thread (blockiert nie den Preis-Loop).
  - Fehlt die Konfiguration (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY),
    passiert schlicht nichts — Telegram & Co. bleiben unberührt.

user_id: Single-User-App. Entweder explizit via SIGNALS_USER_ID gesetzt oder
einmalig über die Auth-Admin-API ermittelt (erster User) und gecacht.
"""
import os
import threading

import requests

_USER_ID_CACHE = {"id": None, "tried": False}
_LOCK = threading.Lock()


def _config():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None, None
    return url.rstrip("/"), key


def _resolve_user_id(url: str, key: str):
    """Kerims auth.users-ID: env-Override oder erster User via Admin-API."""
    env_id = os.getenv("SIGNALS_USER_ID")
    if env_id:
        return env_id
    with _LOCK:
        if _USER_ID_CACHE["tried"]:
            return _USER_ID_CACHE["id"]
        _USER_ID_CACHE["tried"] = True
        try:
            r = requests.get(
                f"{url}/auth/v1/admin/users",
                params={"page": 1, "per_page": 1},
                headers={"apikey": key, "Authorization": f"Bearer {key}"},
                timeout=10,
            )
            r.raise_for_status()
            users = r.json().get("users", [])
            if users:
                _USER_ID_CACHE["id"] = users[0]["id"]
        except Exception as e:
            print(f"signals: user-Lookup fehlgeschlagen: {e}")
        return _USER_ID_CACHE["id"]


def _insert(pair: str, side: str, level: float, snapshot: dict | None):
    url, key = _config()
    if not url:
        return  # nicht konfiguriert -> no-op
    user_id = _resolve_user_id(url, key)
    if not user_id:
        print("signals: keine user_id (SIGNALS_USER_ID setzen oder erst einloggen) -> übersprungen")
        return
    row = {
        "user_id": user_id,
        "source": "gva",
        "pair": pair,
        "line_type": side.lower(),  # 'short' | 'long'
        "line_level": level,
        "fundamental_snapshot": snapshot,
        "status": "new",
    }
    try:
        r = requests.post(
            f"{url}/rest/v1/signals",
            json=row,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            timeout=10,
        )
        if r.status_code >= 300:
            print(f"signals: Insert fehlgeschlagen ({r.status_code}): {r.text[:200]}")
    except Exception as e:
        print(f"signals: Insert-Fehler: {e}")


def build_snapshot(pair: str, macro_currencies: list) -> dict | None:
    """Fundamental-Snapshot beider Währungen aus dem Makro-Cache.
    Ohne cot-Array (52 Wochenwerte) — der Snapshot soll kompakt bleiben."""
    if not macro_currencies:
        return None
    base_code, quote_code = pair[:3], pair[3:6]
    by_code = {c.get("code"): c for c in macro_currencies}

    def slim(c):
        if not c:
            return None
        return {k: v for k, v in c.items() if k != "cot"}

    base, quote = slim(by_code.get(base_code)), slim(by_code.get(quote_code))
    if base is None and quote is None:
        return None
    return {"base": base, "quote": quote}


def record_hit_async(pair: str, side: str, level: float, snapshot: dict | None):
    """Fire-and-forget: INSERT in eigenem Daemon-Thread."""
    threading.Thread(
        target=_insert, args=(pair, side, level, snapshot), daemon=True
    ).start()
