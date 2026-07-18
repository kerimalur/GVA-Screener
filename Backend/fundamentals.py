"""Fundamental-Bias je Waehrung -> je Pair.

Quellen:
  - FRED API  : Langfristzins (OECD 10Y) + CPI-Index -> Real-Zins, Zins-Drehung
                (offizielle API, Key aus Env FRED_API_KEY — fredgraph.csv ist
                seit ~2026-07 fuer Cloud-IPs blockiert, siehe fred_api.py)
  - CFTC COT  : Netto-Positionierung Non-Commercials -> Z-Score (Umkehr-Warnung)
  - OANDA     : Risk-Regime (SPX/AUDJPY/Gold) + Oel-Trend (CAD/AUD/NZD) + Saisonalitaet

Design: pro Waehrung Sub-Scores -> Pair-Bias = Base - Quote.
Fehlende Daten -> Faktor neutral (degradiert sauber, kein Crash).
"""
import time

from fred_api import fred_observations

CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]

# FRED OECD-Laendercodes je Waehrung (fuer IRLTLT01xx / CPALTT01xx Serien).
FRED_CC = {
    "USD": "US", "EUR": "EZ", "GBP": "GB", "JPY": "JP",
    "AUD": "AU", "NZD": "NZ", "CAD": "CA", "CHF": "CH",
}

def fred_series(sid: str):
    """FRED-Serie als Liste (datum_str, float), neueste zuletzt. '.' = fehlend."""
    return fred_observations(sid)


def long_term_rate(ccy: str):
    """Aktueller OECD-Langfristzins (10Y, monatlich) + Aenderung ueber ~3 Monate."""
    cc = FRED_CC.get(ccy)
    if not cc:
        return None, None
    data = fred_series(f"IRLTLT01{cc}M156N")
    if not data:
        return None, None
    latest = data[-1][1]
    prev = data[-4][1] if len(data) >= 4 else data[0][1]
    return latest, latest - prev  # Level, 3M-Aenderung (>0 = steigend = hawkish)


def cpi_yoy(ccy: str):
    """CPI YoY % aus OECD-Index-Serie (selbst gerechnet, robuster als YoY-Serie)."""
    cc = FRED_CC.get(ccy)
    if not cc:
        return None
    data = fred_series(f"CPALTT01{cc}M661N")  # Index, monatlich
    if len(data) < 13:
        return None
    latest = data[-1][1]
    year_ago = data[-13][1]
    if year_ago == 0:
        return None
    return (latest / year_ago - 1) * 100


def selftest():
    print("Waehrung |  10Y  | 3M-Chg |  CPI YoY | Real-Zins")
    print("-" * 52)
    for c in CURRENCIES:
        rate, chg = long_term_rate(c)
        cpi = cpi_yoy(c)
        real = (rate - cpi) if (rate is not None and cpi is not None) else None
        def f(x): return f"{x:6.2f}" if x is not None else "  n/a "
        print(f"   {c}   | {f(rate)} | {f(chg)} | {f(cpi)} | {f(real)}")
        time.sleep(0.3)


if __name__ == "__main__":
    selftest()
