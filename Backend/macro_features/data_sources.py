"""Rohdaten-Fetcher mit lokalem CSV-Cache (kein API-Key nötig).

Quellen:
  - CFTC Socrata API (publicreporting.cftc.gov): Legacy futures-only +
    Traders in Financial Futures (TFF) — volle Historie je Contract-Code.
  - FRED CSV-Export (fredgraph.csv): Leitzins-/Geldmarktserien UND
    FX-Tageskurse (Fed H.10, DEX*-Serien, >17 Jahre).

Alle Funktionen liefern ROHE Historie (chronologisch); as-of-Filter passiert
bewusst erst in den Faktor-Modulen, damit dieselben gecachten Daten für jeden
Backtest-Zeitpunkt wiederverwendbar sind.
"""
from __future__ import annotations

import io
import time

import pandas as pd
import requests

from .config import CACHE_DIR, CACHE_MAX_AGE_HOURS

SOCRATA_LEGACY = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"
SOCRATA_TFF = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}"

_SOCRATA_PAGE = 5000
_TIMEOUT_S = 90
_RETRIES = 3


def _get_with_retry(url: str, params: dict | None = None) -> requests.Response:
    """GET mit Retry+Backoff — CFTC/FRED drosseln Cloud-IPs (GitHub-Runner)."""
    last_exc: Exception | None = None
    for attempt in range(_RETRIES):
        try:
            r = requests.get(url, params=params, timeout=_TIMEOUT_S)
            r.raise_for_status()
            return r
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as e:
            last_exc = e
            if attempt < _RETRIES - 1:
                time.sleep(5 * (attempt + 1))
    raise last_exc  # type: ignore[misc]


def _cache_path(name: str):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{name}.csv"


def _cache_fresh(path) -> bool:
    if not path.exists():
        return False
    age_h = (time.time() - path.stat().st_mtime) / 3600
    return age_h < CACHE_MAX_AGE_HOURS


def _cached(name: str, loader) -> pd.DataFrame:
    """CSV-Cache um einen Loader; leere Ergebnisse werden nicht gecacht."""
    path = _cache_path(name)
    if _cache_fresh(path):
        return pd.read_csv(path, parse_dates=["date"])
    try:
        df = loader()
    except Exception:
        if path.exists():
            # Fetch geplatzt (Timeout/Drosselung) → lieber alter Cache als Crash
            return pd.read_csv(path, parse_dates=["date"])
        raise
    if not df.empty:
        df.to_csv(path, index=False)
    elif path.exists():
        # Fetch fehlgeschlagen → lieber alter Cache als gar nichts
        return pd.read_csv(path, parse_dates=["date"])
    return df


def _socrata_fetch(url: str, code: str, fields: dict[str, str]) -> pd.DataFrame:
    """Paginiertes Socrata-JSON → DataFrame[date, *fields.values()]."""
    rows: list[dict] = []
    offset = 0
    while True:
        params = {
            "cftc_contract_market_code": code,
            "$select": ",".join(["report_date_as_yyyy_mm_dd"] + list(fields)),
            "$order": "report_date_as_yyyy_mm_dd",
            "$limit": _SOCRATA_PAGE,
            "$offset": offset,
        }
        r = _get_with_retry(url, params=params)
        batch = r.json()
        rows.extend(batch)
        if len(batch) < _SOCRATA_PAGE:
            break
        offset += _SOCRATA_PAGE
    if not rows:
        return pd.DataFrame(columns=["date", *fields.values()])
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["report_date_as_yyyy_mm_dd"])
    for src, dst in fields.items():
        df[dst] = pd.to_numeric(df.get(src), errors="coerce")
    df = df[["date", *fields.values()]].sort_values("date").reset_index(drop=True)
    # Socrata liefert je (code, datum) teils Mehrfachzeilen (Options-Varianten) —
    # futures-only Datensatz sollte eindeutig sein, Duplikate sicherheitshalber weg.
    return df.drop_duplicates(subset="date", keep="last").reset_index(drop=True)


def fetch_cot_legacy(code: str) -> pd.DataFrame:
    """Legacy futures-only: NonComm/Comm/NonRept Long+Short, Open Interest."""
    fields = {
        "noncomm_positions_long_all": "noncomm_long",
        "noncomm_positions_short_all": "noncomm_short",
        "comm_positions_long_all": "comm_long",
        "comm_positions_short_all": "comm_short",
        "nonrept_positions_long_all": "nonrept_long",
        "nonrept_positions_short_all": "nonrept_short",
        "open_interest_all": "open_interest",
    }
    return _cached(f"cot_legacy_{code}", lambda: _socrata_fetch(SOCRATA_LEGACY, code, fields))


def fetch_cot_tff(code: str) -> pd.DataFrame:
    """TFF (ab 2006): Dealer/AssetMgr/LevFunds Long+Short."""
    fields = {
        "dealer_positions_long_all": "dealer_long",
        "dealer_positions_short_all": "dealer_short",
        "asset_mgr_positions_long": "asset_long",
        "asset_mgr_positions_short": "asset_short",
        "lev_money_positions_long": "lev_long",
        "lev_money_positions_short": "lev_short",
    }
    return _cached(f"cot_tff_{code}", lambda: _socrata_fetch(SOCRATA_TFF, code, fields))


def fetch_fred(sid: str) -> pd.DataFrame:
    """FRED-Serie → DataFrame[date, value] (nur numerische Beobachtungen)."""

    def load() -> pd.DataFrame:
        r = _get_with_retry(FRED_CSV.format(sid=sid))
        df = pd.read_csv(io.StringIO(r.text))
        df.columns = ["date", "value"]
        df["date"] = pd.to_datetime(df["date"])
        df["value"] = pd.to_numeric(df["value"], errors="coerce")
        return df.dropna(subset=["value"]).reset_index(drop=True)

    return _cached(f"fred_{sid}", load)


def fetch_prices(pair: str, fred_sid: str) -> pd.DataFrame:
    """FX-Tageskurs (FRED H.10, bereits in Pair-Notation) → DataFrame[date, close]."""
    df = fetch_fred(fred_sid).rename(columns={"value": "close"})
    return df


if __name__ == "__main__":  # Smoke-Test: je Quelle eine Serie
    for label, df in [
        ("COT legacy EUR", fetch_cot_legacy("099741")),
        ("COT TFF EUR", fetch_cot_tff("099741")),
        ("FRED FEDFUNDS", fetch_fred("FEDFUNDS")),
        ("FX EURUSD", fetch_prices("EURUSD", "DEXUSEU")),
    ]:
        first = df["date"].min() if not df.empty else "-"
        last = df["date"].max() if not df.empty else "-"
        print(f"{label:16s}: {len(df):6d} Zeilen  {first} … {last}")
