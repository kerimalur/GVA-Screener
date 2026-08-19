"""Chartbild und Fundamental-Block im Telegram-Alert.

Der eigentliche Nachweis steht in test_alert_faellt_auf_text_zurueck und
test_genau_eine_nachricht: ein Alert darf nie am Bild scheitern, und er darf
nie doppelt kommen. Beides ist wichtiger als jedes Detail des Bildes selbst.
"""
import pandas as pd
import pytest

import alert_extras
import main


def _bars(n: int = 30) -> pd.DataFrame:
    idx = pd.date_range("2026-05-01", periods=n, freq="3D")
    basis = [1.05 + 0.001 * (i % 7) for i in range(n)]
    return pd.DataFrame(
        {
            "open": basis,
            "high": [b + 0.002 for b in basis],
            "low": [b - 0.002 for b in basis],
            "close": [b + 0.0005 for b in basis],
            "volume": [1] * n,
        },
        index=idx,
    )


# ------------------------------------------------------------ Chartbild

def test_chart_ist_ein_png():
    png = alert_extras.baue_chart("EURCHF", _bars(), 1.0600, "SHORT", tf="3D")
    if not alert_extras.PILLOW_DA:
        pytest.skip("Pillow nicht installiert")
    assert png is not None
    # PNG-Signatur — nicht die Laenge pruefen, die haengt an der Kompression.
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_ohne_kerzen_kein_bild_aber_auch_kein_fehler():
    assert alert_extras.baue_chart("EURCHF", None, 1.06, "SHORT") is None
    assert alert_extras.baue_chart("EURCHF", pd.DataFrame(), 1.06, "SHORT") is None
    assert alert_extras.baue_chart("EURCHF", _bars(), None, "SHORT") is None


def test_linie_weit_weg_sprengt_das_bild_nicht():
    """Eine Linie weit ausserhalb der Kerzen muss trotzdem gezeichnet werden —
    sonst zeigt der Alert einen Chart ohne die Linie, um die es geht."""
    png = alert_extras.baue_chart("EURCHF", _bars(), 2.0, "SHORT")
    if not alert_extras.PILLOW_DA:
        pytest.skip("Pillow nicht installiert")
    assert png is not None


def test_datum_wird_in_beiden_schreibweisen_erkannt():
    stempel = pd.Timestamp("2026-07-06")
    assert alert_extras._passt(stempel, "2026-07-06")
    assert alert_extras._passt(stempel, "06.07.2026")
    assert not alert_extras._passt(stempel, "07.07.2026")
    assert not alert_extras._passt(stempel, "Unsinn")


# ------------------------------------------------------- Fundamental-Block

WAEHRUNGEN = [
    {"code": "EUR", "rate": 3.75, "realRate": 1.35, "cpi": 2.4, "score": -0.8},
    {"code": "CHF", "rate": 0.00, "realRate": -1.10, "cpi": 1.1, "score": -6.0},
]


def test_fundamental_block_nennt_beide_waehrungen():
    text = alert_extras.fundamental_block("EURCHF", WAEHRUNGEN)
    assert "EUR" in text and "CHF" in text
    assert "+3.75" in text  # Zinsdifferenz


def test_ohne_makro_bleibt_der_block_leer():
    assert alert_extras.fundamental_block("EURCHF", []) == ""
    # Eine Waehrung fehlt -> lieber gar kein Block als ein halber.
    assert alert_extras.fundamental_block("EURUSD", WAEHRUNGEN) == ""


# ------------------------------------------------------------ Alert-Pfad

def test_alert_faellt_auf_text_zurueck(monkeypatch):
    """Foto scheitert -> der Alert geht als Text raus, nicht gar nicht."""
    gesendet = []
    monkeypatch.setattr(main, "send_telegram_photo", lambda *a, **k: False)
    monkeypatch.setattr(main, "send_telegram_alert", lambda t: gesendet.append(t))
    monkeypatch.setitem(main.MACRO_CACHE, "currencies", WAEHRUNGEN)
    main.BARS["EURCHF"] = {"3D": _bars()}

    main.alert_mit_chart("EURCHF", "TEST", "SHORT", 1.06, tf="3D")

    assert len(gesendet) == 1
    assert "TEST" in gesendet[0]
    assert "Fundamental" in gesendet[0]


def test_genau_eine_nachricht(monkeypatch):
    """Klappt das Foto, darf der Text NICHT zusaetzlich kommen — sonst haette
    Kerim je Linie zwei Meldungen statt einer."""
    fotos, texte = [], []
    monkeypatch.setattr(main, "send_telegram_photo",
                        lambda png, caption: fotos.append(caption) or True)
    monkeypatch.setattr(main, "send_telegram_alert", lambda t: texte.append(t))
    monkeypatch.setitem(main.MACRO_CACHE, "currencies", WAEHRUNGEN)
    main.BARS["EURCHF"] = {"3D": _bars()}

    main.alert_mit_chart("EURCHF", "TEST", "SHORT", 1.06, tf="3D")

    if not alert_extras.PILLOW_DA:
        pytest.skip("Pillow nicht installiert")
    assert len(fotos) == 1
    assert texte == []


def test_ohne_kerzen_trotzdem_ein_alert(monkeypatch):
    """Kein Eintrag in BARS (z. B. direkt nach einem Neustart, bevor der erste
    Zonen-Lauf durch ist) — der Alert muss trotzdem raus."""
    gesendet = []
    monkeypatch.setattr(main, "send_telegram_alert", lambda t: gesendet.append(t))
    monkeypatch.setitem(main.MACRO_CACHE, "currencies", [])
    main.BARS.pop("GBPNZD", None)

    main.alert_mit_chart("GBPNZD", "TEST", "LONG", 2.0, tf="W")

    assert len(gesendet) == 1
