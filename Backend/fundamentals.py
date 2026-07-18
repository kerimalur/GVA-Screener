"""Fundamental-Bias je Waehrung -> je Pair.

Quellen:
  - FRED API  : Langfristzins (OECD 10Y) -> Zins-Drehung
                (offizielle API, Key aus Env FRED_API_KEY — fredgraph.csv ist
                seit ~2026-07 fuer Cloud-IPs blockiert, siehe fred_api.py)
  - BIS API   : CPI YoY je Waehrung (keyless, siehe bis_api.py) -> Real-Zins.
                Die alte OECD-Quelle CPALTT01* auf FRED ist endgueltig tot.
  - CFTC COT  : Netto-Positionierung Non-Commercials -> Z-Score (Umkehr-Warnung)
  - OANDA     : Risk-Regime (SPX/AUDJPY/Gold) + Oel-Trend (CAD/AUD/NZD) + Saisonalitaet

Design: pro Waehrung Sub-Scores -> Pair-Bias = Base - Quote.
Fehlende Daten -> Faktor neutral (degradiert sauber, kein Crash).
"""
import time

from bis_api import bis_cpi_yoy
from fred_api import fred_observations

CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]

# FRED OECD-Laendercodes je Waehrung (fuer IRLTLT01xx-10Y-Serien).
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
    """CPI YoY % aus BIS (WS_LONG_CPI Serie 771, fertiges YoY) oder None.

    AUD/NZD publizieren quartalsweise — release-bedingt aelterer Stichtag,
    innerhalb der 400-Tage-Schwelle gueltig (siehe bis_api.py).
    """
    return bis_cpi_yoy(ccy)


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
