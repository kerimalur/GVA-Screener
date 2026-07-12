"""Konfiguration des Macro-Feature-Moduls.

Look-ahead-Regeln (zentral, von allen Faktoren genutzt):
  - COT_RELEASE_LAG_DAYS: CFTC-Reports tragen Dienstags-Stand (report_date),
    veröffentlicht Freitag 15:30 ET → report_date + 3 Tage. Ein Report ist zu
    einem Zeitpunkt as_of nur nutzbar, wenn report_date + Lag <= as_of.
  - FRED_PUBLICATION_LAG_DAYS: OECD-Geldmarktserien (IRSTCI/IR3TIB) erscheinen
    mit ~1–2 Monaten Verzögerung und können leicht revidiert werden. FRED-CSV
    liefert nur revidierte Werte (Point-in-time bräuchte ALFRED + API-Key) —
    kompensiert durch konservativen 42-Tage-Lag nach Beobachtungsdatum.
    Leitzinsen selbst sind Fakten (revisionsarm); der Lag macht den späteren
    Backtest eher zu pessimistisch als zu optimistisch.
  - Saisonalität nutzt nur vollständig abgeschlossene Monate vor as_of.
"""
from pathlib import Path

G8 = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"]

# CFTC-Contract-Codes (identisch zu frontend-next/lib/constants/cftcContracts.ts)
CFTC_CODE = {
    "USD": "098662",  # U.S. Dollar Index (ICE)
    "EUR": "099741",
    "GBP": "096742",
    "JPY": "097741",
    "CHF": "092741",
    "AUD": "232741",
    "CAD": "090741",
    "NZD": "112741",
}

# FRED-Serien Leitzins / kurzfristiger Geldmarktsatz
# (identisch zu frontend-next/lib/constants/fredSeries.ts, category policy_rate)
FRED_POLICY_RATE = {
    "USD": "FEDFUNDS",
    "EUR": "ECBDFR",
    "GBP": "IRSTCI01GBM156N",
    "JPY": "IRSTCI01JPM156N",
    "CHF": "IR3TIB01CHM156N",
    "AUD": "IRSTCI01AUM156N",
    "CAD": "IRSTCI01CAM156N",
    "NZD": "IR3TIB01NZM156N",
}

# FX-Tageskurse der 7 USD-Majors aus FRED (Fed H.10 Noon Rates, seit 1999,
# revisionsfrei, kein Key). Jede Serie ist bereits in Pair-Notation quotiert
# (DEXUSEU = USD je EUR = EURUSD, DEXJPUS = JPY je USD = USDJPY usw.) —
# keine Inversion nötig. Kreuze werden synthetisch aus den USD-Beinen gebildet.
FRED_FX = {
    "EURUSD": "DEXUSEU",
    "GBPUSD": "DEXUSUK",
    "USDJPY": "DEXJPUS",
    "USDCHF": "DEXSZUS",
    "AUDUSD": "DEXUSAL",
    "USDCAD": "DEXCAUS",
    "NZDUSD": "DEXUSNZ",
}

# Die 28 Majors-Paare (Notation wie im übrigen Projekt, ohne Unterstrich)
FX_PAIRS = [
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
    "EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "CADJPY", "CHFJPY", "EURAUD",
    "EURCAD", "EURCHF", "EURNZD", "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD",
    "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "NZDCAD", "NZDCHF", "NZDJPY",
]

# ── Look-ahead / Fenster ─────────────────────────────────────────────────────
COT_RELEASE_LAG_DAYS = 3        # Dienstag-Stand, Freitag veröffentlicht
FRED_PUBLICATION_LAG_DAYS = 42  # OECD-MEI-Publikationslag, konservativ
SEASONALITY_YEARS = 17          # Fenster + Nenner des Konsistenz-Filters
SEASONALITY_MIN_HIT_YEARS = 12  # Score nur aktiv, wenn >=12/17 gleiche Richtung
COT_Z_WINDOW_WEEKS = 17 * 52    # Z-Score-Fenster der Commercial-Netto-Position
COT_Z_MIN_PERIODS = 156         # min. 3 Jahre Historie, sonst NaN
RATES_MOMENTUM_MONTHS = 6       # Zins-Momentum-Fenster

# ── Score-Normierung (Extrempunkte, ab denen der Sub-Score bei ±1 kappt) ─────
COT_Z_FULL_SCALE = 2.0          # |z| = 2 → Score ±1
RATES_DIFF_FULL_SCALE = 2.0     # ±2 pp Differenzial → ±1
RATES_MOM_FULL_SCALE = 1.0      # ±100 bps in 6M → ±1
SEASON_RET_FULL_SCALE = 0.5     # ±0.5 % Ø-Monatsreturn → ±1

CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_MAX_AGE_HOURS = 24
