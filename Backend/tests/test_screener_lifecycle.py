"""Arbeitspakete A, B und C am laufenden Screener (Backend/main.py).

Kern-Nachweis: hit -> Nutzeraktion -> naechster Hit ist wieder moeglich, und
zwar auch ueber einen Neustart hinweg. Dazu die Sichtbarkeits-Garantien aus C
(leeres Board ist von Ausfall unterscheidbar).
"""
import pandas as pd
import pytest

import main
import lifecycle_state

# Original vor dem Stub der Fixture festhalten — zwei Tests brauchen den echten
# Snapshot-Bau (Arbeitspaket C), der Rest will ihn nicht mitlaufen lassen.
_REAL_BUILD_SNAPSHOT = main.build_live_snapshot


ZONE_TEMPLATE = {
    "shorts": [
        {"level": 1.1000, "date": "01.07.2026"},
        {"level": 1.1050, "date": "02.07.2026"},
    ],
    "longs": [{"level": 1.0800, "date": "03.07.2026"}],
    "last_touched": None,
    "daily_close": 1.0900,
}


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    """Modul-Globals leeren und alle Aussenwege stilllegen."""
    for d in (main.ZONES, main.TRIGGERED, main.CONSUMED, main.ALERT_CACHE, main.PREV_PRICE):
        d.clear()
    main.LIVE_CACHE.update({"data": [], "updated": None, "live": False})

    sent: list[str] = []
    signals: list[tuple] = []
    monkeypatch.setattr(main, "send_telegram_alert", lambda text: sent.append(text))
    monkeypatch.setattr(main, "save_state", lambda: None)
    monkeypatch.setattr(main.supabase_signals, "build_snapshot", lambda *a, **k: None)
    monkeypatch.setattr(
        main.supabase_signals, "record_hit_async",
        lambda pair, side, level, snap, detected_late=False, line_formed_date=None:
            signals.append((pair, side, level, detected_late, line_formed_date)),
    )
    monkeypatch.setattr(main.supabase_signals, "update_signal_status_async", lambda *a, **k: None)
    monkeypatch.setattr(main, "build_live_snapshot", lambda: None)

    main.ZONES["EURUSD"] = {**ZONE_TEMPLATE, "shorts": list(ZONE_TEMPLATE["shorts"])}
    yield {"sent": sent, "signals": signals}


def _eval(price: float, live: bool = True):
    return main.evaluate_pair("EURUSD", price, main.ZONES["EURUSD"], fire_alerts=live)


# --- Arbeitspaket A: Lebenszyklus schliesst sich ------------------------------

def test_hit_genommen_naechste_linie_alarmiert_wieder(clean_state):
    res = _eval(1.1000)
    assert res["status"] == "HIT" and res["near"] == "SHORT"
    assert main.TRIGGERED["EURUSD"]["level"] == 1.1
    assert len(clean_state["sent"]) == 1

    # Sticky: Preis laeuft weg, HIT bleibt stehen bis zur Nutzeraktion.
    assert _eval(1.0950)["status"] == "HIT"
    assert len(clean_state["sent"]) == 1

    # "Genommen" im Cockpit -> markPair(pair, "done")
    assert main.mark(main.MarkRequest(pair="EURUSD", action="done"))["ok"] is True
    assert "EURUSD" not in main.TRIGGERED
    assert main.CONSUMED["EURUSD"]["SHORT"] == {1.1}

    # Die naechste Linie ist jetzt aktiv und alarmiert erneut.
    short, _ = main.select_lines("EURUSD")
    assert short["level"] == 1.1050
    assert _eval(1.1050)["status"] == "HIT"
    assert main.TRIGGERED["EURUSD"]["level"] == 1.105
    assert len(clean_state["sent"]) == 2


def test_ueberrannte_linien_werden_mitverbraucht(clean_state):
    """Ein Zug ueber mehrere gestapelte Linien = EIN Alert, nicht drei.

    Der Ausloeser war Telegram: schoss der Preis in einem Zug ueber mehrere
    Linien, meldete jedes "Fertig" sofort die naechste — Kette von Alerts fuer
    dieselbe Bewegung. Eine Linie, auf deren anderer Seite der Preis schon
    steht, kann keinen frischen Einstieg liefern.
    """
    # Erst ein Tick UNTER den Linien: ohne Vorpreis erkennt evaluate_pair nur
    # die exakte Beruehrung (+/- 0.1 Pip), keine Kreuzung. Genau so kommt es
    # auch live an — der Sprung passiert zwischen zwei Ticks.
    assert _eval(1.0950)["status"] != "HIT"
    res = _eval(1.1060)          # ueberschiesst BEIDE Shorts (1.1000 / 1.1050)
    assert res["status"] == "HIT"
    assert main.TRIGGERED["EURUSD"]["level"] == 1.1
    assert len(clean_state["sent"]) == 1

    main.mark(main.MarkRequest(pair="EURUSD", action="done"))
    assert main.CONSUMED["EURUSD"]["SHORT"] == {1.1, 1.105}

    # Keine Linie rueckt nach, kein zweiter Alert.
    short, _ = main.select_lines("EURUSD")
    assert short is None
    assert _eval(1.1060)["status"] != "HIT"
    assert len(clean_state["sent"]) == 1


def test_noch_nicht_erreichte_linie_bleibt_erhalten(clean_state):
    """Gegenprobe: nur was der Preis passiert hat, wird mitverbraucht.

    Ohne diese Grenze waere aus der Alarm-Beruhigung ein stiller Verlust von
    Linien geworden — schlimmer als das urspruengliche Problem.
    """
    _eval(1.1000)                 # trifft nur die erste Linie
    main.mark(main.MarkRequest(pair="EURUSD", action="done"))
    assert main.CONSUMED["EURUSD"]["SHORT"] == {1.1}

    short, _ = main.select_lines("EURUSD")
    assert short["level"] == 1.1050


def test_ohne_bekannten_preis_nur_die_getroffene_linie(clean_state):
    """Kein Preis bekannt -> lieber ein Alert zu viel als eine stille Loeschung."""
    _eval(1.0950)                # Vortick, sonst wird der Sprung nicht erkannt
    _eval(1.1060)
    main.PREV_PRICE.clear()
    main.ZONES["EURUSD"]["daily_close"] = None
    main.mark(main.MarkRequest(pair="EURUSD", action="done"))
    assert main.CONSUMED["EURUSD"]["SHORT"] == {1.1}


def test_verwerfen_wirkt_wie_genommen_auf_den_backend_zustand():
    _eval(1.1000)
    main.mark(main.MarkRequest(pair="EURUSD", action="done"))
    assert "EURUSD" not in main.TRIGGERED
    assert 1.1 in main.CONSUMED["EURUSD"]["SHORT"]
    assert "EURUSD_SHORT" not in main.ALERT_CACHE


def test_beobachten_setzt_pending_ohne_zu_verbrauchen():
    _eval(1.1000)
    assert main.mark(main.MarkRequest(pair="EURUSD", action="pending"))["ok"] is True
    assert main.TRIGGERED["EURUSD"]["pending"] is True
    assert main.CONSUMED.get("EURUSD", {}).get("SHORT", set()) == set()
    assert _eval(1.0950)["pending"] is True


def test_mark_ist_idempotent_und_blockiert_nie():
    _eval(1.1000)
    assert main.mark(main.MarkRequest(pair="EURUSD", action="done"))["ok"] is True
    # Zweiter Aufruf (Cockpit + Scanner, oder Doppelklick) darf nicht fehlschlagen.
    zweiter = main.mark(main.MarkRequest(pair="EURUSD", action="done"))
    assert zweiter["ok"] is True and zweiter["reason"] == "already_resolved"
    assert main.CONSUMED["EURUSD"]["SHORT"] == {1.1}


def test_mark_signatur_bleibt_kompatibel():
    """ScannerShell schickt genau dieses Schema — darf nicht brechen."""
    _eval(1.1000)
    assert main.mark(main.MarkRequest(pair="EURUSD", action="quatsch")) == {
        "ok": False, "reason": "bad_action"
    }


def test_neustart_haelt_consumed_und_alarmiert_nicht_erneut(monkeypatch, tmp_path):
    """hit -> genommen -> Restart -> kein Alert auf dasselbe Setup."""
    _eval(1.1000)
    main.mark(main.MarkRequest(pair="EURUSD", action="done"))

    # Was das Cockpit/mark nach Supabase geschrieben haette:
    rows = [{
        "id": "1", "pair": "EURUSD", "line_type": "short", "line_level": 1.1,
        "status": "journaled", "hit_at": "2026-07-20T10:00:00Z", "detected_late": False,
    }]
    monkeypatch.setattr(lifecycle_state.supabase_signals, "fetch_lifecycle_rows", lambda: rows)
    monkeypatch.setattr(main, "STATE_FILE", str(tmp_path / "state.json"))

    main.TRIGGERED.clear()
    main.CONSUMED.clear()
    main.ALERT_CACHE.clear()
    main.load_state()

    assert main.CONSUMED["EURUSD"]["SHORT"] == {1.1}
    short, _ = main.select_lines("EURUSD")
    assert short["level"] == 1.1050  # verbrauchte Linie wird uebersprungen


def test_reconcile_loest_extern_geschlossene_signale(monkeypatch):
    """Statuswechsel ausserhalb von /api/mark (z.B. direkt im Journal)."""
    _eval(1.1000)
    assert "EURUSD" in main.TRIGGERED

    rows = [{
        "id": "1", "pair": "EURUSD", "line_type": "short", "line_level": 1.1,
        "status": "dismissed", "hit_at": "2026-07-20T10:00:00Z", "detected_late": False,
    }]
    monkeypatch.setattr(main.supabase_signals, "fetch_lifecycle_rows", lambda: rows)
    main.reconcile_state()

    assert "EURUSD" not in main.TRIGGERED
    assert 1.1 in main.CONSUMED["EURUSD"]["SHORT"]


# --- Arbeitspaket B: Nachtrag am laufenden Screener ---------------------------

def _late_frames():
    """GVA-SHORT auf 1.01 (gebildet am 06.07.) mit spaeterem Treffer.

    Block 2 (09.07.) ist bewusst ruhig: er bleibt unter 1.01 und bildet keine
    neue GVA. Seit 2026-08-17 verlangt der Nachbar-Filter
    (analyzer.GVA_MIN_GAP = 1), dass zwischen bildender Kerze und Treffer eine
    ganze Kerze KOMPLETT liegt — ohne diesen Block waere die GVA verworfen und
    es gaebe weder Signal noch Alert. Getroffen wird erst in Block 3 (14.07.),
    tagesgenau am 15.07.
    """
    df_3d = pd.DataFrame(
        {
            "open":  [1.0000, 1.0100, 0.9960, 0.9950],
            "high":  [1.0110, 1.0105, 1.0000, 1.0150],
            "low":   [0.9990, 0.9940, 0.9940, 0.9940],
            "close": [1.0100, 0.9950, 0.9980, 0.9960],
            "volume": [1, 1, 1, 1],
        },
        index=pd.to_datetime(
            ["2026-07-01", "2026-07-06", "2026-07-09", "2026-07-14"]),
    )
    daily = pd.DataFrame(
        {
            "open":  [0.9950, 0.9990, 1.0100],
            "high":  [1.0000, 1.0150, 1.0140],
            "low":   [0.9940, 0.9980, 1.0050],
            "close": [0.9990, 1.0100, 1.0090],
            "volume": [1, 1, 1],
        },
        index=pd.to_datetime(["2026-07-14", "2026-07-15", "2026-07-16"]),
    )
    return df_3d, daily


def test_nachtrag_erzeugt_signal_mit_flag(clean_state):
    df_3d, daily = _late_frames()
    main._handle_late_hits("EURUSD", df_3d, daily, "2026-07-01")

    assert main.TRIGGERED["EURUSD"]["detected_late"] is True
    assert main.TRIGGERED["EURUSD"]["level"] == 1.01
    assert "NACHTRÄGLICH ERKANNT" in clean_state["sent"][0]
    # Bildungsdatum der Linie wandert mit nach Supabase (Punkt 5)
    assert clean_state["signals"] == [("EURUSD", "SHORT", 1.01, True, "2026-07-06")]
    # Flag reicht bis in die Screener-Antwort durch
    assert _eval(1.0000)["detected_late"] is True


def test_nachtrag_wird_beim_zweiten_refresh_nicht_wiederholt(clean_state):
    df_3d, daily = _late_frames()
    main._handle_late_hits("EURUSD", df_3d, daily, "2026-07-01")
    main._handle_late_hits("EURUSD", df_3d, daily, "2026-07-01")

    assert len(clean_state["sent"]) == 1
    assert len(clean_state["signals"]) == 1


def test_nachtrag_auf_consumed_linie_erzeugt_nichts(clean_state):
    df_3d, daily = _late_frames()
    main.CONSUMED["EURUSD"] = {"SHORT": {1.01}}
    main._handle_late_hits("EURUSD", df_3d, daily, "2026-07-01")

    assert "EURUSD" not in main.TRIGGERED
    assert clean_state["sent"] == [] and clean_state["signals"] == []


def test_erster_lauf_ueberhaupt_traegt_nichts_nach(clean_state):
    """since_day None = kein gespeicherter Vorlauf -> kein Alert-Sturm."""
    df_3d, daily = _late_frames()
    main._handle_late_hits("EURUSD", df_3d, daily, None)
    assert clean_state["sent"] == [] and "EURUSD" not in main.TRIGGERED


def test_offener_hit_blockiert_den_nachtrag(clean_state):
    _eval(1.1000)                      # Live-HIT steht
    clean_state["sent"].clear()
    df_3d, daily = _late_frames()
    main._handle_late_hits("EURUSD", df_3d, daily, "2026-07-01")

    assert main.TRIGGERED["EURUSD"]["level"] == 1.1      # unveraendert
    assert main.TRIGGERED["EURUSD"]["detected_late"] is False
    assert clean_state["sent"] == []


# --- Arbeitspaket C: leeres Board vs. Ausfall ---------------------------------

def test_screener_endpoint_liefert_zustandskontext():
    main.LIVE_CACHE.update({"data": [{"pair": "EURUSD"}], "updated": 1_700_000_000.0, "live": True})
    out = main.get_screener()
    assert set(out) == {
        "data", "updated", "zones", "pairs_total", "live",
        "zones_complete_run", "zones_runs",
    }
    assert out["updated"] == 1_700_000_000.0
    assert out["zones"] == 1               # nur EURUSD in ZONES -> Kaltstart
    assert out["pairs_total"] == len(main.PAIRS) == 28
    assert out["live"] is True


def test_kaltstart_ist_am_zonen_zaehler_erkennbar():
    """zones < pairs_total -> das Frontend rendert 'Backend startet', nicht 'ok'."""
    out = main.get_screener()
    assert out["data"] == [] and out["updated"] is None
    assert out["zones"] < out["pairs_total"]


def test_oanda_ausfall_markiert_karten_als_stale(monkeypatch):
    """Kein OANDA-Preis -> live=False global, stale=True je Karte, Board bedienbar."""
    monkeypatch.setattr(main, "fetch_live_prices", lambda pairs: {})
    _REAL_BUILD_SNAPSHOT()

    assert main.LIVE_CACHE["live"] is False
    row = main.LIVE_CACHE["data"][0]
    assert row["pair"] == "EURUSD"
    assert row["stale"] is True
    assert row["distance"] is not None          # Board bleibt rechenbar
    assert "EURUSD" not in main.TRIGGERED       # Fallback-Preis loest nie einen HIT aus


def test_live_preise_setzen_live_flag(monkeypatch):
    monkeypatch.setattr(
        main, "fetch_live_prices",
        lambda pairs: {"EURUSD": {"bid": 1.0899, "ask": 1.0901, "mid": 1.0900}},
    )
    _REAL_BUILD_SNAPSHOT()
    assert main.LIVE_CACHE["live"] is True
    assert main.LIVE_CACHE["data"][0]["stale"] is False


def test_live_preis_karten_sind_nicht_stale():
    row = _eval(1.0900)
    assert row["stale"] is False
