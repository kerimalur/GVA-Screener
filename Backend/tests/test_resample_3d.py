"""3D-Raster == TradingView: 3er-Gruppen ueber Kalender-Wochentage, Feiertags-
Slots zaehlen mit. Referenzdaten aus Kerims Pine-Log-Dump (2026-07-14),
siehe GVA_BACKTEST_ROADMAP.md Phase 1."""
import pandas as pd

from data_pipeline import resample_3d_bars


def _df(days: list[str]) -> pd.DataFrame:
    idx = pd.to_datetime(days)
    return pd.DataFrame(
        {"open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 1},
        index=idx,
    )


def _starts(days: list[str]) -> list[str]:
    out = resample_3d_bars(_df(days))
    return [ts.date().isoformat() for ts in out.index]


def test_regulaere_woche_wie_tv():
    # TV-Log: Bloecke [06,07,08], [09,10,13], [14,15,16] Juli 2026
    days = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09",
            "2026-07-10", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"]
    assert _starts(days) == ["2026-07-06", "2026-07-09", "2026-07-14"]


def test_weihnachten_feiertags_slot_zaehlt_mit():
    # TV-Log: [19,22,23], [24,26] (25.12. = Slot ohne Kerze!), [29,30,31],
    # [02,05] (01.01. = Slot ohne Kerze), [06,07,08]
    days = ["2025-12-19", "2025-12-22", "2025-12-23", "2025-12-24", "2025-12-26",
            "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-02", "2026-01-05",
            "2026-01-06", "2026-01-07", "2026-01-08"]
    assert _starts(days) == ["2025-12-19", "2025-12-24", "2025-12-29",
                             "2026-01-02", "2026-01-06"]


def test_maerz_2025_referenzfall():
    # Kerims erster Abgleichs-Fund: TV-Signal-Block = [18,19,20] Maerz 2025
    days = ["2025-03-13", "2025-03-14", "2025-03-17", "2025-03-18", "2025-03-19",
            "2025-03-20", "2025-03-21", "2025-03-24", "2025-03-25"]
    assert _starts(days) == ["2025-03-13", "2025-03-18", "2025-03-21"]
