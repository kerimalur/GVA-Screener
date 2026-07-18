"""Offizielle FRED-API (series/observations) — ersetzt fredgraph.csv.

Hintergrund (2026-07): der CSV-Export wird fuer Cloud-IPs blockiert
(Timeouts auf Render/GitHub-Runnern und lokal). Die offizielle API
antwortet zuverlaessig, braucht aber einen kostenlosen Key.

Key AUSSCHLIESSLICH aus Env FRED_API_KEY — nie hardcoden, nie die
Request-URL loggen (sie enthaelt den Key). Rate-Limit: 120 Requests/min
pro Key; die Backend-Aufrufer holen Serien sequenziell und bleiben weit
darunter. Bei 429/5xx/Netzfehler ein Retry, sonst leere Liste —
alle Aufrufer degradieren sauber (Faktor neutral / alter Cache).
"""
import os
import time

import requests

API_URL = "https://api.stlouisfed.org/fred/series/observations"


def fred_observations(sid: str, timeout: int = 30):
    """Serie als Liste (datum_str, float), chronologisch aufsteigend.

    [] bei fehlendem Key, toter Serie oder API-Fehler ('.'-Werte werden
    uebersprungen) — gleiche Semantik wie der alte CSV-Parser.
    """
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        print(f"FRED {sid}: FRED_API_KEY fehlt in der Env — Serie uebersprungen")
        return []

    for attempt in range(2):
        if attempt:
            time.sleep(2)
        try:
            r = requests.get(
                API_URL,
                params={
                    "series_id": sid,
                    "api_key": api_key,
                    "file_type": "json",
                    "limit": 100000,
                },
                timeout=timeout,
            )
        except Exception as e:
            print(f"FRED {sid}: Netzwerk/Timeout ({type(e).__name__})")
            continue

        if r.status_code != 200:
            msg = ""
            try:
                msg = str(r.json().get("error_message", ""))[:120]
            except Exception:
                pass
            print(f"FRED {sid}: HTTP {r.status_code} {msg}".strip())
            if r.status_code == 429 or r.status_code >= 500:
                continue
            return []  # 400 = unbekannte/eingestellte Serie oder Key-Problem

        try:
            observations = r.json().get("observations", [])
        except Exception:
            print(f"FRED {sid}: Antwort kein gueltiges JSON")
            return []

        out = []
        for o in observations:
            date = o.get("date", "")
            val = (o.get("value") or "").strip()
            if val in (".", "", "NaN") or len(date) != 10:
                continue
            try:
                out.append((date, float(val)))
            except ValueError:
                continue
        return out

    return []
