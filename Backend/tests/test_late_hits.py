"""Arbeitspaket B — nachträglich erkannte Hits (Downtime-Lücke).

Szenario: das Backend war offline, während der Kurs eine GVA-Linie durchquert
hat, und der Kurs ist danach nicht zurückgekehrt. Live wäre der Treffer für
immer verloren; aus der Kerzen-Historie muss er auftauchen.

Erkennung kommt ausschliesslich aus replay.gva_history.collect_hits — hier wird
nur geprüft, dass Zeitfenster und Consumed-Filter richtig greifen.
"""
import pandas as pd

import late_hits


def _df_3d() -> pd.DataFrame:
    """Drei 3D-Blöcke mit genau einem GVA-SHORT-Muster + späterem Treffer.

    Block 0 (bullisch, Body 0.0100) + Block 1 (bearisch, Body 0.0150 ≥ 1.4×,
    Body-Top identisch) -> SHORT-Linie auf 1.01.
    Block 2 läuft mit High 1.0150 darüber -> Treffer.
    """
    idx = pd.to_datetime(["2026-07-01", "2026-07-06", "2026-07-09"])
    return pd.DataFrame(
        {
            "open":  [1.0000, 1.0100, 0.9950],
            "high":  [1.0110, 1.0105, 1.0150],
            "low":   [0.9990, 0.9940, 0.9940],
            "close": [1.0100, 0.9950, 0.9960],
            "volume": [1, 1, 1],
        },
        index=idx,
    )


def _daily() -> pd.DataFrame:
    """Tageskerzen im Trefferblock: erst am 10.07. wird 1.01 überschritten."""
    idx = pd.to_datetime(["2026-07-09", "2026-07-10", "2026-07-13"])
    return pd.DataFrame(
        {
            "open":  [0.9950, 0.9990, 1.0100],
            "high":  [1.0000, 1.0150, 1.0140],
            "low":   [0.9940, 0.9980, 1.0050],
            "close": [0.9990, 1.0100, 1.0090],
            "volume": [1, 1, 1],
        },
        index=idx,
    )


def test_verpasster_hit_wird_gefunden_und_tagesgenau_datiert():
    found = late_hits.find_late_hits(_df_3d(), _daily(), "EURUSD", "2026-07-01")
    assert len(found) == 1
    hit = found[0]
    assert hit["direction"] == "SHORT"
    assert hit["level"] == 1.01
    assert hit["hit_date"] == "2026-07-10"  # nicht der Blockstart 09.07.


def test_hits_vor_dem_fenster_zaehlen_nicht():
    """Das Fenster beginnt beim letzten Lauf — alles davor war live abgedeckt."""
    assert late_hits.find_late_hits(_df_3d(), _daily(), "EURUSD", "2026-07-11") == []


def test_fenster_ist_inklusiv():
    found = late_hits.find_late_hits(_df_3d(), _daily(), "EURUSD", "2026-07-10")
    assert len(found) == 1


def test_bereits_consumed_linie_erzeugt_nichts():
    """Nachträglicher Hit auf eine längst getradete Linie: kein Signal, kein Alert."""
    found = late_hits.find_late_hits(
        _df_3d(), _daily(), "EURUSD", "2026-07-01", consumed={"SHORT": {1.01}}
    )
    assert found == []


def test_consumed_auf_der_anderen_seite_filtert_nicht():
    found = late_hits.find_late_hits(
        _df_3d(), _daily(), "EURUSD", "2026-07-01", consumed={"LONG": {1.01}}
    )
    assert len(found) == 1


def test_leere_daten_sind_kein_fehler():
    leer = pd.DataFrame()
    assert late_hits.find_late_hits(leer, _daily(), "EURUSD", "2026-07-01") == []
    assert late_hits.find_late_hits(_df_3d(), leer, "EURUSD", "2026-07-01") == []


def test_alert_text_ist_als_nachtrag_erkennbar():
    hit = late_hits.find_late_hits(_df_3d(), _daily(), "EURUSD", "2026-07-01")[0]
    text = late_hits.alert_text("EURUSD", hit)
    assert "NACHTRÄGLICH ERKANNT" in text
    assert "EURUSD" in text
    assert "2026-07-10" in text
