"""Quintil-Zuordnung + Reifungs-Logik des Wochen-Jobs."""
import numpy as np
import pandas as pd
import pytest

from ml_engine.run_weekly import (
    quintile_of,
    mature_mask,
    next_week_start,
    check_run_result,
)

WEEK = pd.Timestamp("2026-07-27")  # Zielwoche = kommender Montag


def test_quintile_grenzen():
    hist = np.linspace(-1, 1, 200)  # gleichverteilte Score-Historie
    assert quintile_of(-0.95, hist) == 1
    assert quintile_of(0.0, hist) == 3
    assert quintile_of(0.95, hist) == 5


def test_quintile_leere_historie_neutral():
    assert quintile_of(0.7, np.array([])) == 3


def test_next_week_start_montag_plus7():
    # Montag 2026-07-20 → Montag in 7 Tagen, NICHT heute (1-Woche-zu-alt-Bug).
    assert next_week_start(pd.Timestamp("2026-07-20")) == pd.Timestamp("2026-07-27")


def test_next_week_start_samstag_cron():
    # Samstags-Cron (weekday=5) → kommender Montag in 2 Tagen.
    assert next_week_start(pd.Timestamp("2026-07-18")) == pd.Timestamp("2026-07-20")


def test_next_week_start_sonntag_und_wochenmitte():
    assert next_week_start(pd.Timestamp("2026-07-19")) == pd.Timestamp("2026-07-20")  # So → +1
    assert next_week_start(pd.Timestamp("2026-07-22")) == pd.Timestamp("2026-07-27")  # Mi → +5
    # Immer ein Montag:
    for d in pd.date_range("2026-07-01", "2026-07-31"):
        assert next_week_start(d).weekday() == 0


def test_check_result_neu_geschrieben_ok():
    # Frischer Erfolg: DB aktuell (max == Zielwoche) → OK, kein Exit.
    msg = check_run_result(8, True, WEEK, WEEK)
    assert msg.startswith("OK") and "8" in msg


def test_check_result_duplikat_info_gruen():
    # 0 geschrieben, Zielwoche existiert bereits, DB aktuell → INFO, kein Exit
    # (zweiter Lauf am selben Tag / Cron nach manuellem Dispatch).
    msg = check_run_result(0, True, WEEK, WEEK)
    assert msg.startswith("INFO")


def test_check_result_kein_schreiberfolg_keine_zeilen_rot():
    # 0 geschrieben UND Zielwoche fehlt → echter Fehler.
    with pytest.raises(SystemExit):
        check_run_result(0, False, pd.Timestamp("2026-07-13"), WEEK)


def test_check_result_leere_db_rot():
    with pytest.raises(SystemExit):
        check_run_result(0, False, None, WEEK)


def test_check_result_stale_db_rot():
    # Jüngste DB-Woche älter als kommender Montag → rot (der zwei Wochen
    # unbemerkte Zustand). target_exists=True isoliert den Staleness-Zweig.
    with pytest.raises(SystemExit):
        check_run_result(0, True, pd.Timestamp("2026-07-13"), WEEK)


def test_mature_mask():
    today = pd.Timestamp("2026-07-13")
    rows = pd.DataFrame({
        "week_start": pd.to_datetime(["2026-05-11", "2026-07-06"]),
        "horizon": [4, 4],
    })
    m = mature_mask(rows, today)
    assert m.tolist() == [True, False]
