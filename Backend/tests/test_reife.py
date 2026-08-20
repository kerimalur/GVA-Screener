"""Eine GVA darf erst alarmieren, wenn eine GANZE Kerze dazwischen liegt.

Der Fall vom 20.08.2026 (GBPJPY, Monats-GVA): der Screener hat einen
Monats-Alert geschickt, obwohl sich die Linie auf der zuletzt geschlossenen
Monatskerze gebildet hatte und der laufende Monat die erste Kerze danach war.

Warum der Nachbar-Filter das nicht abgefangen hat: `analyze_gva_zones` prueft
den Abstand nur INNERHALB der Historie. Der Live-Alert in `evaluate_pair`
haelt dagegen den Kurs direkt gegen das Level und wusste bis dahin gar nicht,
wie alt die Linie ist. Die Reife schliesst genau diese Luecke — auf allen drei
Timeframes, denn die Regel ist bei 3D, W und M dieselbe.
"""
import pandas as pd
import pytest

import analyzer
import main


@pytest.fixture(autouse=True)
def sauber(monkeypatch):
    monkeypatch.setattr(main, "ZONES", {}, raising=False)
    monkeypatch.setattr(main, "TRIGGERED", {}, raising=False)
    monkeypatch.setattr(main, "CONSUMED", {}, raising=False)
    monkeypatch.setattr(main, "ALERT_CACHE", {}, raising=False)
    monkeypatch.setattr(main, "PREV_PRICE", {}, raising=False)
    monkeypatch.setattr(main, "save_state", lambda: None)
    monkeypatch.setattr(main, "_merke_alert", lambda *a, **k: None)


def _gva_frame(nachlauf: int) -> pd.DataFrame:
    """Zwei Kerzen bilden eine SHORT-GVA auf 1.0100, danach `nachlauf` ruhige.

    Block 0 bullisch (Body 1.0000 -> 1.0100), Block 1 bearisch mit doppeltem
    Body und gleichem Body-Top -> SHORT-Linie auf 1.0100. Die ruhigen Kerzen
    danach bleiben klar darunter, damit die Linie offen bleibt.
    """
    zeilen = [
        (1.0000, 1.0110, 0.9990, 1.0100),
        (1.0100, 1.0105, 0.9890, 0.9900),
    ] + [(0.9900, 0.9950, 0.9850, 0.9910)] * nachlauf
    idx = pd.to_datetime([f"2026-0{1 + i // 28}-{1 + i % 28:02d}" for i in range(len(zeilen))])
    df = pd.DataFrame(zeilen, columns=["open", "high", "low", "close"], index=idx)
    df["volume"] = 1
    return df


def test_frisch_gebildete_linie_ist_nicht_reif():
    """Die bildende Kerze ist die letzte geschlossene -> noch nicht reif."""
    *_, shorts, _ = analyzer.analyze_gva_zones(_gva_frame(0), "GBPJPY", tf="M")
    assert len(shorts) == 1
    assert shorts[0]["bars_seit"] == 0
    assert shorts[0]["reif"] is False


def test_nach_einer_ganzen_kerze_ist_sie_reif():
    *_, shorts, _ = analyzer.analyze_gva_zones(_gva_frame(1), "GBPJPY", tf="M")
    assert shorts[0]["bars_seit"] == 1
    assert shorts[0]["reif"] is True


def test_reife_gilt_auf_allen_timeframes():
    """3D, W und M teilen dieselbe Regel — sie zaehlt Kerzen, nicht Tage."""
    for tf in ("3D", "W", "M"):
        *_, frisch, _ = analyzer.analyze_gva_zones(_gva_frame(0), "GBPJPY", tf=tf)
        *_, alt, _ = analyzer.analyze_gva_zones(_gva_frame(2), "GBPJPY", tf=tf)
        assert frisch[0]["reif"] is False, tf
        assert alt[0]["reif"] is True, tf


def _zone(reif: bool) -> dict:
    return {
        "shorts": [{"level": 1.1000, "date": "01.07.2026", "tf": "M",
                    "bars_seit": 1 if reif else 0, "reif": reif}],
        "longs": [],
        "last_touched": None,
        "daily_close": 1.0900,
    }


def _tick(pair: str, preis: float) -> dict:
    return main.evaluate_pair(pair, preis, main.ZONES[pair], fire_alerts=True)


def test_unreife_linie_loest_keinen_alert_aus(monkeypatch):
    gesendet = []
    monkeypatch.setattr(main, "alert_mit_chart", lambda *a, **k: gesendet.append(a))
    main.ZONES["EURUSD"] = _zone(reif=False)

    _tick("EURUSD", 1.0900)          # Vortick, damit die Kreuzung erkennbar ist
    ergebnis = _tick("EURUSD", 1.1000)

    assert gesendet == []
    assert ergebnis["status"] != "HIT"
    # Und der Sticky-Zustand bleibt leer: sonst haenge das Paar auf HIT fest,
    # ohne dass je eine Meldung kam.
    assert "EURUSD" not in main.TRIGGERED


def test_reife_linie_loest_weiterhin_aus(monkeypatch):
    """Gegenprobe — sonst koennte der Test oben auch bestehen, weil gar keine
    Alerts mehr rausgehen."""
    gesendet = []
    monkeypatch.setattr(main, "alert_mit_chart", lambda *a, **k: gesendet.append(a))
    monkeypatch.setattr(main.supabase_signals, "record_hit_async", lambda *a, **k: None)
    monkeypatch.setattr(main.supabase_signals, "build_snapshot", lambda *a, **k: None)
    main.ZONES["EURUSD"] = _zone(reif=True)

    _tick("EURUSD", 1.0900)
    ergebnis = _tick("EURUSD", 1.1000)

    assert len(gesendet) == 1
    assert ergebnis["status"] == "HIT"
    assert main.TRIGGERED["EURUSD"]["side"] == "SHORT"


def test_unreife_linie_bleibt_sichtbar(monkeypatch):
    """Sie verschwindet nicht vom Board — sie darf nur nicht alarmieren.
    Sonst stuende im Cockpit die uebernaechste Linie und man wuerde sich
    wundern, warum der Kurs an einem Level dreht, das gar nicht angezeigt ist.
    """
    monkeypatch.setattr(main, "alert_mit_chart", lambda *a, **k: None)
    main.ZONES["EURUSD"] = _zone(reif=False)
    ergebnis = _tick("EURUSD", 1.0995)
    assert ergebnis["short"] == 1.1000
