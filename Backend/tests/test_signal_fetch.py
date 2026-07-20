"""Punkt 4 — CONSUMED vollstaendig laden, und Punkt 5 — Bildungsdatum.

Punkt 4 war ein Zeitzuender: der komplette Lebenszyklus wurde aus den juengsten
1000 Signalzeilen gebaut. Waechst die Historie darueber hinaus, fallen alte
consumed-Linien aus dem Fenster und gelten wieder als frei -> Alert und Karte
auf ein laengst getradetes Setup.

Punkt 5: `line_formed_date` ueberlebt jetzt den Neustart. Zwei Schreibformate
('DD.MM.YYYY' live, ISO im Nachtrag) muessen als EIN Format in der DB landen.
"""
import pytest

import lifecycle_state
import supabase_signals


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status
        self.text = ""

    def raise_for_status(self):
        if self.status_code >= 300:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


def _consumed_row(i: int) -> dict:
    return {
        "pair": "EURUSD",
        "line_type": "short",
        "line_level": 1.0 + i / 100000,
        "status": "journaled",
    }


@pytest.fixture
def konfiguriert(monkeypatch):
    """Supabase als konfiguriert vortaeuschen, ohne Netzwerk."""
    monkeypatch.setattr(supabase_signals, "_context",
                        lambda: ("https://db.example", "key", "user-1"))
    monkeypatch.setattr(supabase_signals, "is_configured", lambda: True)


# --- Punkt 4: Paginierung ----------------------------------------------------

def test_consumed_wird_ueber_die_seitengrenze_hinaus_geladen(monkeypatch, konfiguriert):
    """2500 Zeilen bei Seitengroesse 1000 -> drei Requests, alles da."""
    alle = [_consumed_row(i) for i in range(2500)]
    ranges: list[str] = []

    def fake_get(url, params=None, headers=None, timeout=None):
        rng = headers["Range"]
        ranges.append(rng)
        start, end = (int(x) for x in rng.split("-"))
        return FakeResponse(alle[start:end + 1])

    monkeypatch.setattr(supabase_signals.requests, "get", fake_get)

    rows = supabase_signals.fetch_consumed_rows()
    assert rows is not None
    assert len(rows) == 2500
    assert ranges == ["0-999", "1000-1999", "2000-2999"]


def test_consumed_stoppt_bei_unvollstaendiger_seite(monkeypatch, konfiguriert):
    alle = [_consumed_row(i) for i in range(10)]
    calls = {"n": 0}

    def fake_get(url, params=None, headers=None, timeout=None):
        calls["n"] += 1
        return FakeResponse(alle)

    monkeypatch.setattr(supabase_signals.requests, "get", fake_get)
    assert len(supabase_signals.fetch_consumed_rows()) == 10
    assert calls["n"] == 1  # kein zweiter Request noetig


def test_consumed_nutzt_stabile_sortierung(monkeypatch, konfiguriert):
    """Ohne order kann PostgREST zwischen zwei Seiten umsortieren."""
    gesehen = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        gesehen.update(params)
        return FakeResponse([])

    monkeypatch.setattr(supabase_signals.requests, "get", fake_get)
    supabase_signals.fetch_consumed_rows()
    assert gesehen["order"] == "id.asc"
    assert gesehen["status"] == "in.(journaled,dismissed)"


def test_netzfehler_liefert_none_nicht_leer(monkeypatch, konfiguriert):
    """None != [] — ein Netzfehler darf den Zustand nicht stillschweigend leeren."""
    def fake_get(url, params=None, headers=None, timeout=None):
        raise RuntimeError("Verbindung weg")

    monkeypatch.setattr(supabase_signals.requests, "get", fake_get)
    assert supabase_signals.fetch_consumed_rows() is None
    assert supabase_signals.fetch_open_signal_rows() is None


def test_ohne_konfiguration_liefert_none(monkeypatch):
    monkeypatch.setattr(supabase_signals, "_context", lambda: (None, None, None))
    assert supabase_signals.fetch_consumed_rows() is None
    assert supabase_signals.fetch_open_signal_rows() is None
    assert supabase_signals.fetch_lifecycle_rows() is None


def test_offene_signale_bleiben_begrenzt(monkeypatch, konfiguriert):
    """TRIGGERED darf ein Fenster haben — es gibt hoechstens einen offenen HIT
    je Paar. Nur CONSUMED muss vollstaendig sein."""
    gesehen = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        gesehen.update(params)
        return FakeResponse([])

    monkeypatch.setattr(supabase_signals.requests, "get", fake_get)
    supabase_signals.fetch_open_signal_rows()
    assert gesehen["limit"] == str(supabase_signals.OPEN_SIGNAL_LIMIT)
    assert gesehen["status"] == "in.(new,watchlist)"
    assert gesehen["order"] == "hit_at.desc"


def test_lifecycle_rows_setzt_offene_zeilen_nach_vorne(monkeypatch, konfiguriert):
    """state_from_rows waehlt pro Paar die ERSTE offene Zeile — die Reihenfolge
    offen-vor-consumed muss deshalb erhalten bleiben."""
    offen = [{"pair": "EURUSD", "line_type": "short", "line_level": 1.1,
              "status": "new", "hit_at": "2026-07-20T10:00:00Z"}]
    verbraucht = [_consumed_row(0)]
    monkeypatch.setattr(supabase_signals, "fetch_open_signal_rows", lambda: offen)
    monkeypatch.setattr(supabase_signals, "fetch_consumed_rows", lambda: verbraucht)

    rows = supabase_signals.fetch_lifecycle_rows()
    assert rows[0]["status"] == "new"
    assert len(rows) == 2


def test_halber_zustand_gilt_als_nicht_erreichbar(monkeypatch, konfiguriert):
    """Fehlt der Consumed-Teil, waere der Zustand gefaehrlich unvollstaendig."""
    monkeypatch.setattr(supabase_signals, "fetch_open_signal_rows", lambda: [])
    monkeypatch.setattr(supabase_signals, "fetch_consumed_rows", lambda: None)
    assert supabase_signals.fetch_lifecycle_rows() is None


def test_alte_consumed_linie_bleibt_consumed_jenseits_der_1000(monkeypatch, konfiguriert, tmp_path):
    """Kern des Punktes: Zeile 2400 von 2500 erzeugt keinen Alert mehr."""
    alte_linie = {"pair": "GBPUSD", "line_type": "long", "line_level": 1.25,
                  "status": "dismissed"}
    viele = [_consumed_row(i) for i in range(2400)] + [alte_linie]
    monkeypatch.setattr(supabase_signals, "fetch_open_signal_rows", lambda: [])
    monkeypatch.setattr(supabase_signals, "fetch_consumed_rows", lambda: viele)

    _, consumed, _, source = lifecycle_state.load_lifecycle(str(tmp_path / "state.json"))
    assert source == "supabase"
    assert 1.25 in consumed["GBPUSD"]["LONG"]


# --- Punkt 5: Bildungsdatum --------------------------------------------------

def test_datumsformate_werden_auf_iso_normalisiert():
    assert supabase_signals.to_iso_date("01.07.2026") == "2026-07-01"
    assert supabase_signals.to_iso_date("1.7.2026") == "2026-07-01"
    assert supabase_signals.to_iso_date("2026-07-01") == "2026-07-01"
    assert supabase_signals.to_iso_date("2026-07-01T10:00:00Z") == "2026-07-01"


def test_unbrauchbares_datum_wird_zu_none():
    assert supabase_signals.to_iso_date(None) is None
    assert supabase_signals.to_iso_date("") is None
    assert supabase_signals.to_iso_date("irgendwas") is None


def test_insert_schreibt_normalisiertes_bildungsdatum(monkeypatch, konfiguriert):
    gesendet = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        gesendet.update(json)
        return FakeResponse({}, status=201)

    monkeypatch.setattr(supabase_signals.requests, "post", fake_post)
    supabase_signals._insert("EURUSD", "SHORT", 1.1, None,
                             line_formed_date="01.07.2026")
    assert gesendet["line_formed_date"] == "2026-07-01"
    assert gesendet["detected_late"] is False


def test_bildungsdatum_ueberlebt_den_neustart():
    rows = [{
        "pair": "EURUSD", "line_type": "short", "line_level": 1.1,
        "status": "new", "hit_at": "2026-07-20T10:00:00Z",
        "line_formed_date": "2026-07-01",
    }]
    triggered, _, _ = lifecycle_state.state_from_rows(rows)
    assert triggered["EURUSD"]["date"] == "2026-07-01"


def test_altzeile_ohne_bildungsdatum_bleibt_gueltig():
    rows = [{
        "pair": "EURUSD", "line_type": "short", "line_level": 1.1,
        "status": "new", "hit_at": "2026-07-20T10:00:00Z",
    }]
    triggered, _, _ = lifecycle_state.state_from_rows(rows)
    assert triggered["EURUSD"]["date"] is None   # Platzhalter, kein Fehler
    assert triggered["EURUSD"]["level"] == 1.1
