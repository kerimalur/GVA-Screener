"""BIS SDMX-API (stats.bis.org, keyless) — CPI YoY fuer alle 8 Waehrungen.

Spiegelt frontend-next/lib/sources/bis.ts + lib/jobs/updateBis.ts:
Flow WS_LONG_CPI, Serie 771 = year-on-year changes in per cent (fertiges
YoY, kein Selbstrechnen), Area-Codes identisch zum Frontend-Mapping.

EIN Request holt alle 8 Waehrungen; In-Prozess-Cache 6h (schont das
BIS-Rate-Limit und passt zum 6h-Makro-Loop). AUD/NZD publizieren
quartalsweise — der letzte Wert ist dann ~3–6 Monate alt: release-bedingt,
NICHT stale. Erst >400 Tage gilt eine Serie als tot (None), identisch zur
Frontend-Frische-Regel (freshnessOf in lib/calc/realYield.ts).
"""
import time
from datetime import datetime, timedelta, timezone

import requests

# identisch zu frontend-next/lib/jobs/updateBis.ts BIS_AREA_BY_CCY
BIS_AREA_BY_CCY = {
    "USD": "US", "EUR": "XM", "GBP": "GB", "JPY": "JP",
    "CHF": "CH", "AUD": "AU", "NZD": "NZ", "CAD": "CA",
}
_CCY_BY_AREA = {a: c for c, a in BIS_AREA_BY_CCY.items()}
_AREAS_KEY = "+".join(BIS_AREA_BY_CCY.values())

_URL = f"https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LONG_CPI/1.0/M.{_AREAS_KEY}.771"
_CACHE_TTL_S = 6 * 3600
_DEAD_AFTER_DAYS = 400

_cache: dict = {"ts": 0.0, "data": None}  # data: dict ccy -> [(date, yoy), ...] chronologisch


def _fetch_cpi_series(timeout: int = 30):
    """Alle 8 CPI-YoY-Serien in einem Request. None bei Fehler (Log ohne URL)."""
    start = (datetime.now(timezone.utc) - timedelta(days=550)).strftime("%Y-%m")
    try:
        r = requests.get(
            _URL,
            params={"format": "csv", "detail": "dataonly", "startPeriod": start},
            timeout=timeout,
        )
        r.raise_for_status()
    except Exception as e:
        print(f"BIS CPI: Fetch-Fehler ({type(e).__name__})")
        return None

    lines = r.text.strip().splitlines()
    if len(lines) < 2:
        return None
    header = [h.strip() for h in lines[0].split(",")]
    try:
        i_area = header.index("REF_AREA")
        i_period = header.index("TIME_PERIOD")
        i_value = header.index("OBS_VALUE")
    except ValueError:
        print("BIS CPI: unerwarteter CSV-Header")
        return None

    out: dict = {}
    for line in lines[1:]:
        cols = line.split(",")
        if len(cols) <= max(i_area, i_period, i_value):
            continue
        area = cols[i_area].strip()
        period = cols[i_period].strip()
        ccy = _CCY_BY_AREA.get(area)
        # Monats-Perioden 'YYYY-MM'; 'NaN' (BIS-Datenluecken) ueberspringen
        if not ccy or len(period) != 7 or period[4] != "-":
            continue
        try:
            value = float(cols[i_value].strip())
        except ValueError:
            continue
        out.setdefault(ccy, []).append((f"{period}-01", value))

    if not out:
        return None
    for arr in out.values():
        arr.sort()
    return out


def bis_cpi_yoy(ccy: str):
    """Letzter CPI-YoY-%-Wert der Waehrung; None wenn Serie fehlt oder tot (>400 T).

    Quartalswerte (AUD/NZD) sind innerhalb der 400-Tage-Schwelle gueltig —
    aelterer Stichtag ist dort release-bedingt, kein Fehler.
    """
    now = time.time()
    if _cache["data"] is None or now - _cache["ts"] > _CACHE_TTL_S:
        data = _fetch_cpi_series()
        if data is not None:
            _cache["ts"] = now
            _cache["data"] = data
        elif _cache["data"] is None:
            return None
        # sonst: Fetch geplatzt -> alter Cache bleibt gueltig (graceful)

    series = (_cache["data"] or {}).get(ccy)
    if not series:
        return None
    date_str, value = series[-1]
    last = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    if (datetime.now(timezone.utc) - last).days > _DEAD_AFTER_DAYS:
        return None
    return value
