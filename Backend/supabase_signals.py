"""Supabase-Anbindung des Screeners — `signals` (Journal-Inbox + Lebenszyklus)
und `screener_state` (kleiner Key-Value-Speicher für Laufzeitzustand).

Die `signals`-Tabelle ist seit dem Lebenszyklus-Umbau die **Quelle der Wahrheit**
für den Screener-Zustand (siehe lifecycle_state.py):
  - status 'new' / 'watchlist'      -> Linie ist TRIGGERED (offener HIT)
  - status 'journaled' / 'dismissed'-> Linie ist CONSUMED (verbraucht)

Schreibpfade bleiben entkoppelt vom Screener-Kern:
  - HIT-Inserts laufen fire-and-forget in einem eigenen Thread.
  - Fehlt die Konfiguration (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY),
    passiert schlicht nichts — Telegram & Co. bleiben unberührt.

user_id: Single-User-App. Entweder explizit via SIGNALS_USER_ID gesetzt oder
einmalig über die Auth-Admin-API ermittelt (erster User) und gecacht.
"""
import os
import threading
from datetime import datetime, timezone

import requests

_USER_ID_CACHE = {"id": None, "tried": False}
_LOCK = threading.Lock()

# Status-Mapping Signal -> Lebenszyklus. Bewusst hier, damit Backend und
# lifecycle_state dieselbe Definition benutzen.
TRIGGERED_STATUSES = ("new", "watchlist")
CONSUMED_STATUSES = ("journaled", "dismissed")


def _config():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None, None
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


def _context():
    """(url, key, user_id) oder (None, None, None), wenn nicht nutzbar."""
    url, key = _config()
    if not url:
        return None, None, None
    user_id = _resolve_user_id(url, key)
    if not user_id:
        return None, None, None
    return url, key, user_id


def is_configured() -> bool:
    return _config()[0] is not None


def _insert(pair: str, side: str, level: float, snapshot: dict | None,
            detected_late: bool = False):
    url, key, user_id = _context()
    if not url:
        if is_configured():
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
        "detected_late": bool(detected_late),
    }
    try:
        r = requests.post(
            f"{url}/rest/v1/signals",
            json=row,
            headers=_headers(key, {"Prefer": "return=minimal"}),
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


def record_hit_async(pair: str, side: str, level: float, snapshot: dict | None,
                     detected_late: bool = False):
    """Fire-and-forget: INSERT in eigenem Daemon-Thread."""
    threading.Thread(
        target=_insert,
        args=(pair, side, level, snapshot, detected_late),
        daemon=True,
    ).start()


def fetch_signal_rows(limit: int = 1000) -> list | None:
    """Alle GVA-Signale des Users (neueste zuerst) für den Lebenszyklus-Aufbau.

    Rückgabe:
      list  -> Zeilen (auch leere Liste = gültig, es gibt schlicht keine)
      None  -> Supabase nicht konfiguriert oder Abruf fehlgeschlagen.
               Der Aufrufer MUSS diesen Fall vom leeren Ergebnis unterscheiden,
               sonst würde ein Netzfehler den Zustand stillschweigend leeren.
    """
    url, key, user_id = _context()
    if not url:
        return None
    try:
        r = requests.get(
            f"{url}/rest/v1/signals",
            params={
                "select": "id,pair,line_type,line_level,status,hit_at,detected_late",
                "user_id": f"eq.{user_id}",
                "source": "eq.gva",
                "order": "hit_at.desc",
                "limit": str(limit),
            },
            headers=_headers(key),
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else None
    except Exception as e:
        print(f"signals: Laden fehlgeschlagen: {e}")
        return None


def update_signal_status(pair: str, side: str, status: str) -> bool:
    """Offenes Signal des Paars auf `status` setzen (idempotent).

    Trifft nur Zeilen, die noch offen sind (new/watchlist) — ein bereits vom
    Frontend gesetzter Status (z.B. 'journaled') wird nicht überschrieben.
    """
    url, key, user_id = _context()
    if not url:
        return False
    try:
        r = requests.patch(
            f"{url}/rest/v1/signals",
            params={
                "user_id": f"eq.{user_id}",
                "pair": f"eq.{pair}",
                "line_type": f"eq.{side.lower()}",
                "status": f"in.({','.join(TRIGGERED_STATUSES)})",
            },
            json={"status": status, "updated_at": datetime.now(timezone.utc).isoformat()},
            headers=_headers(key, {"Prefer": "return=minimal"}),
            timeout=10,
        )
        if r.status_code >= 300:
            print(f"signals: Status-Update fehlgeschlagen ({r.status_code}): {r.text[:200]}")
            return False
        return True
    except Exception as e:
        print(f"signals: Status-Update-Fehler: {e}")
        return False


def update_signal_status_async(pair: str, side: str, status: str):
    """Fire-and-forget-Variante — darf den Request-Pfad nie blockieren."""
    threading.Thread(
        target=update_signal_status, args=(pair, side, status), daemon=True
    ).start()


# ---------------------------------------------------------------------------
# screener_state: Key-Value-Zustand, der Render-Restarts überleben muss.
# ---------------------------------------------------------------------------

def get_state_value(key_name: str):
    """Wert aus `screener_state` oder None (nicht gesetzt / nicht erreichbar)."""
    url, key, _ = _context()
    if not url:
        return None
    try:
        r = requests.get(
            f"{url}/rest/v1/screener_state",
            params={"select": "value", "key": f"eq.{key_name}", "limit": "1"},
            headers=_headers(key),
            timeout=10,
        )
        r.raise_for_status()
        rows = r.json()
        return rows[0]["value"] if rows else None
    except Exception as e:
        print(f"screener_state: Laden von '{key_name}' fehlgeschlagen: {e}")
        return None


def set_state_value(key_name: str, value) -> bool:
    """Upsert in `screener_state` (Primary Key = key)."""
    url, key, _ = _context()
    if not url:
        return False
    try:
        r = requests.post(
            f"{url}/rest/v1/screener_state",
            json={
                "key": key_name,
                "value": value,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            headers=_headers(key, {
                "Prefer": "resolution=merge-duplicates,return=minimal",
            }),
            timeout=10,
        )
        if r.status_code >= 300:
            print(f"screener_state: Schreiben von '{key_name}' fehlgeschlagen "
                  f"({r.status_code}): {r.text[:200]}")
            return False
        return True
    except Exception as e:
        print(f"screener_state: Schreib-Fehler bei '{key_name}': {e}")
        return False
