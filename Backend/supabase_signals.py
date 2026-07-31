"""Supabase-Anbindung des Screeners — `signals` (Journal-Inbox + Lebenszyklus)
und `screener_state` (kleiner Key-Value-Speicher für Laufzeitzustand).

Die `signals`-Tabelle ist seit dem Lebenszyklus-Umbau die **Quelle der Wahrheit**
für den Screener-Zustand (siehe lifecycle_state.py):
  - status 'new' / 'watchlist'      -> Linie ist TRIGGERED (offener HIT)
  - status 'journaled' / 'dismissed'-> Linie ist CONSUMED (verbraucht)

Seit dem Setup-Umbau erzeugt jeder HIT zusaetzlich einen Outlook (Tabelle
`outlooks`, source='gva', verknuepft ueber outlooks.signal_id). Der Outlook ist
die Detailebene UEBER dem Signal: dieselbe Sache, nur mit These, Checkliste und
Zielen. Das passiert hier im Backend und nicht im Frontend, damit es auch dann
geschieht, wenn der Browser tagelang nicht geoeffnet wird.

Bewusst KEIN Backfill fuer historische Signale: ein einmaliger Lauf ueber die
Signal-Historie wuerde den Outlook mit alten, laengst erledigten Setups fluten
und die Ansicht unbrauchbar machen. Nur neue Hits ab Deploy legen einen an;
Altbestand bleibt ohne Outlook und funktioniert im Cockpit unveraendert weiter
(die Anreicherung entfaellt dort einfach).

Schreibpfade bleiben entkoppelt vom Screener-Kern:
  - HIT-Inserts laufen fire-and-forget in einem eigenen Thread.
  - Fehlt die Konfiguration (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY),
    passiert schlicht nichts — Telegram & Co. bleiben unberührt.
  - Schlaegt der Outlook-Insert fehl, wird nur geloggt; Signal und Alert
    bleiben davon unberuehrt.

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

# Offene Signale sind naturgemaess wenige: das Sticky-Modell kennt genau EINEN
# offenen HIT je Paar, bei 28 Paaren also hoechstens 28. Das Fenster ist reiner
# Ausreisser-Schutz (z.B. Altbestand aus einer Phase ohne /api/mark) und darf
# begrenzt bleiben — im Gegensatz zu CONSUMED, siehe fetch_consumed_rows.
OPEN_SIGNAL_LIMIT = 500

# Seitengroesse fuer den vollstaendigen Consumed-Abruf. PostgREST kappt pro
# Request; deshalb wird ueber den Range-Header geblaettert.
_PAGE_SIZE = 1000
# Harte Abbruchbedingung, damit ein kaputtes Range-Verhalten keine Endlosschleife
# baut. 50 Seiten = 50'000 Zeilen; darueber ist etwas anderes faul.
_MAX_PAGES = 50


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


def diagnose() -> tuple[bool, str]:
    """Kann der Screener Signale und Outlooks schreiben?

    Bisher scheiterte das lautlos: _insert bricht ohne user_id einfach ab und
    schreibt eine Zeile ins Render-Log. Der Telegram-Alert kommt trotzdem, weil
    er einen anderen Zugang nutzt — im Cockpit und im Outlook fehlt der Hit
    dann aber ersatzlos, ohne dass irgendwo etwas rot wird.

    Rückgabe: (ok, Grund). `ok=True` heisst, dass URL, Schlüssel UND user_id
    stehen — nicht, dass der letzte Insert geklappt hat.
    """
    url, key = _config()
    if not url:
        return False, ("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen — "
                       "Signale und Outlooks werden nicht geschrieben")
    if not _resolve_user_id(url, key):
        return False, ("keine user_id: SIGNALS_USER_ID setzen oder einmalig "
                       "in der App einloggen, damit der Lookup greift")
    return True, "ok"


def to_iso_date(value) -> str | None:
    """Linien-Bildungsdatum auf ISO 'YYYY-MM-DD' normalisieren.

    Der Live-Pfad liefert das Datum aus analyzer.py als 'DD.MM.YYYY', der
    Nachtrag-Pfad aus collect_hits bereits als ISO. In der DB soll genau EIN
    Format liegen, sonst zeigt die UI zwei verschiedene an.
    Unbekanntes Format -> None (Feld bleibt leer, nie kaputte Daten schreiben).
    """
    if not value:
        return None
    text = str(value).strip()
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]  # schon ISO
    try:
        tag, monat, jahr = text.split(".")
        return f"{int(jahr):04d}-{int(monat):02d}-{int(tag):02d}"
    except Exception:
        return None


def _de_date(iso: str | None) -> str | None:
    """ISO 'YYYY-MM-DD' -> 'DD.MM.YYYY' für Texte, die Kerim liest."""
    if not iso or len(iso) < 10:
        return None
    jahr, monat, tag = iso[:4], iso[5:7], iso[8:10]
    return f"{tag}.{monat}.{jahr}"


def _thesis_text(pair: str, side: str, level: float, iso_date: str | None,
                 detected_late: bool) -> str:
    """Vorbelegte These des automatisch erzeugten Outlooks.

    Bewusst nur die harten Fakten des Hits — die eigene Einschätzung schreibt
    Kerim selbst dazu. Beispiel:
      "GVA SHORT-Linie @ 1.08421 getroffen (Linie vom 12.07.2026)"
    """
    stufe = f"{round(float(level), 5):g}"
    text = f"GVA {side.upper()}-Linie @ {stufe} getroffen"
    tag = _de_date(iso_date)
    if tag:
        text += f" (Linie vom {tag})"
    if detected_late:
        text += " — nachträglich erkannt (Backend war offline)"
    return text


def _insert_outlook(url: str, key: str, user_id: str, signal_id: str, pair: str,
                    side: str, level: float, snapshot: dict | None,
                    detected_late: bool, iso_date: str | None):
    """Zum Signal gehörenden Outlook anlegen (Detailebene über dem Signal).

    Läuft im Backend und nicht im Frontend, damit auch dann ein Outlook
    entsteht, wenn der Browser tagelang nicht geöffnet wird.

    status='observation': Das gemeinsame Vokabular (frontend-next/lib/setup/
    lifecycle.ts) kennt für den frischen Hit den Zustand `getroffen` — der hat
    aber bewusst KEINE Outlook-Entsprechung, weil er der Moment vor jeder
    Entscheidung ist. Der nächstgelegene speicherbare Outlook-Zustand ist
    'observation' (= `beobachtung`, "gesehen, wird beobachtet"). Der
    Lebenszyklus selbst hängt weiterhin am Signal ('new' = TRIGGERED), der
    Outlook-Status wird erst durch eine echte Entscheidung führend.

    Alle NOT-NULL-Spalten werden explizit mit leeren Werten belegt, damit die
    Zeile unabhängig von den DB-Defaults gültig ist.

    Fehler werden nur geloggt: Der Signal-Insert und der Telegram-Alert sind
    bereits durch und dürfen davon nicht berührt werden.
    """
    row = {
        "user_id": user_id,
        "signal_id": signal_id,
        "source": "gva",
        "symbol": pair,
        "direction": side.lower(),          # 'short' | 'long'
        "thesis": _thesis_text(pair, side, level, iso_date, detected_late),
        "confidence": 3,                    # neutral — Kerim bewertet selbst
        "status": "observation",
        "cot_bias": snapshot,               # bereits gebauter fundamental_snapshot
        "interesting_zone": level,
        "confluences": [],
        "tags": [],
        "journaled_to": [],
        "strategy_checklist": [],
        "fundamental_outlook": "",
    }
    try:
        r = requests.post(
            f"{url}/rest/v1/outlooks",
            json=row,
            headers=_headers(key, {"Prefer": "return=minimal"}),
            timeout=10,
        )
        if r.status_code >= 300:
            print(f"outlooks: Insert fehlgeschlagen ({r.status_code}): {r.text[:200]}")
    except Exception as e:
        print(f"outlooks: Insert-Fehler: {e}")


def _insert(pair: str, side: str, level: float, snapshot: dict | None,
            detected_late: bool = False, line_formed_date=None):
    url, key, user_id = _context()
    if not url:
        if is_configured():
            print("signals: keine user_id (SIGNALS_USER_ID setzen oder erst einloggen) -> übersprungen")
        return
    iso_date = to_iso_date(line_formed_date)
    row = {
        "user_id": user_id,
        "source": "gva",
        "pair": pair,
        "line_type": side.lower(),  # 'short' | 'long'
        "line_level": level,
        "fundamental_snapshot": snapshot,
        "status": "new",
        "detected_late": bool(detected_late),
        "line_formed_date": iso_date,
    }
    signal_id = None
    try:
        # return=representation statt minimal: die neue Signal-ID wird als
        # Fremdschlüssel für den Outlook gebraucht.
        r = requests.post(
            f"{url}/rest/v1/signals",
            json=row,
            headers=_headers(key, {"Prefer": "return=representation"}),
            timeout=10,
        )
        if r.status_code >= 300:
            print(f"signals: Insert fehlgeschlagen ({r.status_code}): {r.text[:200]}")
            return
        data = r.json()
        if isinstance(data, list) and data:
            signal_id = data[0].get("id")
        elif isinstance(data, dict):
            signal_id = data.get("id")
    except Exception as e:
        print(f"signals: Insert-Fehler: {e}")
        return

    if not signal_id:
        # Signal steht, nur die ID fehlt (z.B. Prefer wurde ignoriert). Ohne ID
        # kein Outlook — das Cockpit funktioniert dann eben ohne Anreicherung.
        print("signals: Insert ohne zurückgegebene ID -> kein Outlook angelegt")
        return

    _insert_outlook(url, key, user_id, signal_id, pair, side, level, snapshot,
                    bool(detected_late), iso_date)


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
                     detected_late: bool = False, line_formed_date=None):
    """Fire-and-forget: INSERT (Signal + zugehoeriger Outlook) im Daemon-Thread."""
    threading.Thread(
        target=_insert,
        args=(pair, side, level, snapshot, detected_late, line_formed_date),
        daemon=True,
    ).start()


# Felder, die der Lebenszyklus braucht. Bewusst schmal gehalten — der
# Consumed-Abruf laedt die komplette Historie.
_LIFECYCLE_SELECT = (
    "id,pair,line_type,line_level,status,hit_at,detected_late,line_formed_date"
)
_CONSUMED_SELECT = "pair,line_type,line_level,status"


def fetch_open_signal_rows(limit: int = OPEN_SIGNAL_LIMIT) -> list | None:
    """Offene Signale (new/watchlist), neueste zuerst.

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
                "select": _LIFECYCLE_SELECT,
                "user_id": f"eq.{user_id}",
                "source": "eq.gva",
                "status": f"in.({','.join(TRIGGERED_STATUSES)})",
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
        print(f"signals: Laden offener Signale fehlgeschlagen: {e}")
        return None


def fetch_consumed_rows() -> list | None:
    """ALLE verbrauchten Linien (journaled/dismissed) — ohne Limit, paginiert.

    Ein Limit wäre hier ein Zeitzünder: fällt eine alte consumed-Linie aus dem
    Fenster, gilt sie wieder als frei und erzeugt Alert + Karte auf ein längst
    getradetes Setup. Deshalb wird über den Range-Header geblättert, bis alles
    da ist. Gleiche None-Semantik wie fetch_open_signal_rows.
    """
    url, key, user_id = _context()
    if not url:
        return None
    params = {
        "select": _CONSUMED_SELECT,
        "user_id": f"eq.{user_id}",
        "source": "eq.gva",
        "status": f"in.({','.join(CONSUMED_STATUSES)})",
        # Stabile Sortierung: ohne order kann PostgREST zwischen zwei Seiten
        # umsortieren und Zeilen doppelt liefern oder auslassen.
        "order": "id.asc",
    }
    rows: list = []
    offset = 0
    try:
        for _ in range(_MAX_PAGES):
            r = requests.get(
                f"{url}/rest/v1/signals",
                params=params,
                headers=_headers(key, {
                    "Range-Unit": "items",
                    "Range": f"{offset}-{offset + _PAGE_SIZE - 1}",
                }),
                timeout=20,
            )
            r.raise_for_status()
            chunk = r.json()
            if not isinstance(chunk, list):
                return None
            rows.extend(chunk)
            if len(chunk) < _PAGE_SIZE:
                return rows
            offset += _PAGE_SIZE
        print(
            f"signals: Consumed-Abruf nach {_MAX_PAGES} Seiten abgebrochen "
            f"({len(rows)} Zeilen) — Historie unerwartet gross, bitte prüfen"
        )
        return rows
    except Exception as e:
        print(f"signals: Laden verbrauchter Linien fehlgeschlagen: {e}")
        return None


def fetch_lifecycle_rows() -> list | None:
    """Offene + verbrauchte Zeilen für den Lebenszyklus-Aufbau.

    Reihenfolge ist bedeutsam: offene Signale zuerst (nach hit_at absteigend),
    damit state_from_rows pro Paar den jüngsten offenen HIT wählt.
    None sobald EINE der beiden Abfragen scheitert — ein halber Zustand wäre
    schlimmer als gar keiner (fehlende consumed-Zeilen = Alert auf alte Linien).
    """
    open_rows = fetch_open_signal_rows()
    if open_rows is None:
        return None
    consumed_rows = fetch_consumed_rows()
    if consumed_rows is None:
        return None
    return list(open_rows) + list(consumed_rows)


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
