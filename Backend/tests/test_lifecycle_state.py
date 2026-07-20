"""Arbeitspaket A2 — Lebenszyklus-Zustand aus Supabase statt aus state.json.

Geprüft wird das Mapping signals -> TRIGGERED/CONSUMED, die konservative
Migration (im Zweifel consumed) und der Abgleich zur Laufzeit.
"""
import json

import pytest

import lifecycle_state


def _row(pair, side, level, status, hit_at, late=False):
    return {
        "id": f"{pair}-{status}-{level}",
        "pair": pair,
        "line_type": side.lower(),
        "line_level": level,
        "status": status,
        "hit_at": hit_at,
        "detected_late": late,
    }


# --- Mapping signals -> Lebenszyklus -----------------------------------------

def test_status_mapping_triggered_und_consumed():
    rows = [
        _row("EURUSD", "SHORT", 1.1, "new", "2026-07-20T10:00:00Z"),
        _row("GBPUSD", "LONG", 1.25, "watchlist", "2026-07-19T10:00:00Z"),
        _row("AUDUSD", "SHORT", 0.66, "journaled", "2026-07-18T10:00:00Z"),
        _row("NZDUSD", "LONG", 0.58, "dismissed", "2026-07-17T10:00:00Z"),
    ]
    triggered, consumed, cache = lifecycle_state.state_from_rows(rows)

    assert triggered["EURUSD"] == {
        "side": "SHORT", "level": 1.1, "date": None,
        "pending": False, "detected_late": False,
    }
    assert triggered["GBPUSD"]["pending"] is True
    assert "AUDUSD" not in triggered and "NZDUSD" not in triggered
    assert consumed["AUDUSD"]["SHORT"] == {0.66}
    assert consumed["NZDUSD"]["LONG"] == {0.58}
    # Alert-Dedupe vorbelegt -> nach dem Neustart kein zweiter Telegram-Alert
    assert cache == {"EURUSD_SHORT": 1.1, "GBPUSD_LONG": 1.25}


def test_juengste_offene_zeile_gewinnt():
    rows = [  # bereits nach hit_at absteigend sortiert (wie die Query)
        _row("EURUSD", "SHORT", 1.12, "new", "2026-07-20T10:00:00Z"),
        _row("EURUSD", "SHORT", 1.10, "new", "2026-07-01T10:00:00Z"),
    ]
    triggered, _, _ = lifecycle_state.state_from_rows(rows)
    assert triggered["EURUSD"]["level"] == 1.12


def test_consumed_linie_wird_nie_triggered():
    """Widersprüchliche Historie: dieselbe Linie 'new' UND später consumed."""
    rows = [
        _row("EURUSD", "SHORT", 1.1, "new", "2026-07-20T10:00:00Z"),
        _row("EURUSD", "SHORT", 1.1, "journaled", "2026-07-19T10:00:00Z"),
    ]
    triggered, consumed, _ = lifecycle_state.state_from_rows(rows)
    assert "EURUSD" not in triggered
    assert consumed["EURUSD"]["SHORT"] == {1.1}


def test_detected_late_wird_durchgereicht():
    rows = [_row("EURUSD", "SHORT", 1.1, "new", "2026-07-20T10:00:00Z", late=True)]
    triggered, _, _ = lifecycle_state.state_from_rows(rows)
    assert triggered["EURUSD"]["detected_late"] is True


def test_kaputte_zeilen_werden_ignoriert():
    rows = [
        {"pair": "EURUSD", "line_type": None, "line_level": 1.1, "status": "new"},
        {"pair": None, "line_type": "short", "line_level": 1.1, "status": "new"},
        {"pair": "EURUSD", "line_type": "short", "line_level": None, "status": "new"},
    ]
    triggered, consumed, cache = lifecycle_state.state_from_rows(rows)
    assert triggered == {} and consumed == {} and cache == {}


# --- Cache-Datei (state.json ist nur noch Cache) ------------------------------

def test_cache_roundtrip(tmp_path):
    path = str(tmp_path / "state.json")
    triggered = {"EURUSD": {"side": "SHORT", "level": 1.1, "date": None, "pending": False}}
    consumed = {"EURUSD": {"SHORT": {1.05, 1.06}}}
    lifecycle_state.write_cache_file(path, triggered, consumed)

    raw = json.loads(open(path).read())
    assert raw["consumed"] == {"EURUSD": {"SHORT": [1.05, 1.06]}}

    t2, c2 = lifecycle_state.read_cache_file(path)
    assert t2 == triggered
    assert c2 == consumed


def test_fehlende_cache_datei_ist_kein_fehler(tmp_path):
    t, c = lifecycle_state.read_cache_file(str(tmp_path / "gibtsnicht.json"))
    assert t == {} and c == {}


# --- load_lifecycle ----------------------------------------------------------

@pytest.fixture
def no_file(tmp_path):
    return str(tmp_path / "state.json")


def test_load_ohne_supabase_nutzt_cache(monkeypatch, tmp_path):
    path = str(tmp_path / "state.json")
    lifecycle_state.write_cache_file(
        path,
        {"EURUSD": {"side": "SHORT", "level": 1.1, "date": None, "pending": False}},
        {"GBPUSD": {"LONG": {1.2}}},
    )
    monkeypatch.setattr(lifecycle_state.supabase_signals, "fetch_signal_rows", lambda: None)

    triggered, consumed, cache, source = lifecycle_state.load_lifecycle(path)
    assert source == "cache"
    assert triggered["EURUSD"]["level"] == 1.1
    assert consumed["GBPUSD"]["LONG"] == {1.2}
    assert cache == {}


def test_load_supabase_gewinnt_und_vereinigt_consumed(monkeypatch, tmp_path):
    path = str(tmp_path / "state.json")
    # Cache kennt eine verbrauchte Linie, die Supabase (noch) nicht kennt.
    lifecycle_state.write_cache_file(path, {}, {"EURUSD": {"SHORT": {1.05}}})
    monkeypatch.setattr(
        lifecycle_state.supabase_signals, "fetch_signal_rows",
        lambda: [_row("EURUSD", "SHORT", 1.1, "journaled", "2026-07-20T10:00:00Z")],
    )
    triggered, consumed, _, source = lifecycle_state.load_lifecycle(path)
    assert source == "supabase"
    assert triggered == {}
    assert consumed["EURUSD"]["SHORT"] == {1.05, 1.1}  # Union, nichts geht verloren


def test_migration_unklarer_trigger_gilt_als_consumed(monkeypatch, tmp_path):
    """Kein Alert-Sturm beim ersten Start nach dem Deploy: ein offener HIT aus
    der Datei, den Supabase nicht kennt, wird als verbraucht behandelt."""
    path = str(tmp_path / "state.json")
    lifecycle_state.write_cache_file(
        path,
        {"EURUSD": {"side": "SHORT", "level": 1.1, "date": "01.07.2026", "pending": False}},
        {},
    )
    monkeypatch.setattr(lifecycle_state.supabase_signals, "fetch_signal_rows", lambda: [])

    triggered, consumed, _, _ = lifecycle_state.load_lifecycle(path)
    assert triggered == {}
    assert consumed["EURUSD"]["SHORT"] == {1.1}


def test_geloeschte_cache_datei_verhaelt_sich_identisch(monkeypatch, no_file):
    rows = [_row("EURUSD", "SHORT", 1.1, "new", "2026-07-20T10:00:00Z")]
    monkeypatch.setattr(lifecycle_state.supabase_signals, "fetch_signal_rows", lambda: rows)
    triggered, consumed, cache, source = lifecycle_state.load_lifecycle(no_file)
    assert source == "supabase"
    assert triggered["EURUSD"]["level"] == 1.1
    assert consumed == {}
    assert cache == {"EURUSD_SHORT": 1.1}


# --- reconcile ---------------------------------------------------------------

def test_reconcile_loest_sticky_hit_nach_externem_status():
    triggered = {"EURUSD": {"side": "SHORT", "level": 1.1, "date": None, "pending": False}}
    consumed: dict = {}
    cache = {"EURUSD_SHORT": 1.1}
    rows = [_row("EURUSD", "SHORT", 1.1, "journaled", "2026-07-20T10:00:00Z")]

    changed = lifecycle_state.reconcile(triggered, consumed, cache, rows)
    assert changed is True
    assert triggered == {}          # kein Paar bleibt dauerhaft sticky
    assert cache == {}              # Dedupe frei -> naechste Linie darf alerten
    assert consumed["EURUSD"]["SHORT"] == {1.1}


def test_reconcile_ohne_supabase_faesst_nichts_an():
    triggered = {"EURUSD": {"side": "SHORT", "level": 1.1, "date": None, "pending": False}}
    changed = lifecycle_state.reconcile(triggered, {}, {}, None)
    assert changed is False
    assert "EURUSD" in triggered


def test_reconcile_belebt_keine_alten_trigger():
    """DB kennt einen offenen HIT, den der Prozess nicht hat -> nur Dedupe
    vorbelegen, keinen Trigger erfinden."""
    triggered: dict = {}
    cache: dict = {}
    rows = [_row("EURUSD", "SHORT", 1.1, "new", "2026-07-20T10:00:00Z")]
    lifecycle_state.reconcile(triggered, {}, cache, rows)
    assert triggered == {}
    assert cache == {"EURUSD_SHORT": 1.1}
