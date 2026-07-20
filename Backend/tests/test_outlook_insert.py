"""Jeder GVA-Hit legt zusaetzlich einen Outlook an (Detailebene ueber dem Signal).

Kernzusagen:
  * Signal-Insert und Outlook-Insert sind ZWEI Requests, verknuepft ueber
    outlooks.signal_id.
  * Der Outlook-Insert ist fire-and-forget: schlaegt er fehl, bleibt der
    Signal-Insert (und damit Alert + Lebenszyklus) unberuehrt.
  * Es wird nie ein Outlook fuer historische Signale erzeugt — nur der gerade
    eingefuegte Hit bekommt einen.
"""
import pytest

import supabase_signals


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status
        self.text = "fehler" if status >= 300 else ""

    def json(self):
        return self._payload


@pytest.fixture
def konfiguriert(monkeypatch):
    monkeypatch.setattr(supabase_signals, "_context",
                        lambda: ("https://db.example", "key", "user-1"))
    monkeypatch.setattr(supabase_signals, "is_configured", lambda: True)


def _posts(monkeypatch, signal_status=201, outlook_status=201, signal_payload=None):
    """POSTs mitschneiden. Rueckgabe: Liste von (url, json-body)."""
    calls: list[tuple[str, dict]] = []

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append((url, json))
        if url.endswith("/signals"):
            payload = signal_payload if signal_payload is not None else [{"id": "sig-1"}]
            return FakeResponse(payload, signal_status)
        return FakeResponse([{"id": "out-1"}], outlook_status)

    monkeypatch.setattr(supabase_signals.requests, "post", fake_post)
    return calls


def test_hit_erzeugt_signal_und_verknuepften_outlook(monkeypatch, konfiguriert):
    calls = _posts(monkeypatch)
    supabase_signals._insert(
        "EURUSD", "SHORT", 1.08421, {"base": {"code": "EUR"}},
        line_formed_date="12.07.2026",
    )

    assert [u.rsplit("/", 1)[-1] for u, _ in calls] == ["signals", "outlooks"]

    signal_row = calls[0][1]
    assert signal_row["status"] == "new"          # technischer Wert bleibt
    assert signal_row["line_formed_date"] == "2026-07-12"

    outlook_row = calls[1][1]
    assert outlook_row["signal_id"] == "sig-1"
    assert outlook_row["source"] == "gva"
    assert outlook_row["symbol"] == "EURUSD"
    assert outlook_row["direction"] == "short"
    assert outlook_row["status"] == "observation"
    assert outlook_row["confidence"] == 3
    assert outlook_row["interesting_zone"] == 1.08421
    assert outlook_row["cot_bias"] == {"base": {"code": "EUR"}}
    assert outlook_row["thesis"] == (
        "GVA SHORT-Linie @ 1.08421 getroffen (Linie vom 12.07.2026)"
    )
    # NOT-NULL-Spalten ohne Verlass auf DB-Defaults
    assert outlook_row["confluences"] == []
    assert outlook_row["tags"] == []
    assert outlook_row["journaled_to"] == []
    assert outlook_row["strategy_checklist"] == []
    assert outlook_row["fundamental_outlook"] == ""


def test_nachtraeglich_erkannter_hit_steht_in_der_these(monkeypatch, konfiguriert):
    calls = _posts(monkeypatch)
    supabase_signals._insert(
        "GBPUSD", "LONG", 1.25, None,
        detected_late=True, line_formed_date="2026-07-02",
    )
    assert calls[1][1]["thesis"] == (
        "GVA LONG-Linie @ 1.25 getroffen (Linie vom 02.07.2026)"
        " — nachträglich erkannt (Backend war offline)"
    )


def test_ohne_bildungsdatum_bleibt_die_these_lesbar(monkeypatch, konfiguriert):
    calls = _posts(monkeypatch)
    supabase_signals._insert("USDJPY", "SHORT", 151.234, None)
    assert calls[1][1]["thesis"] == "GVA SHORT-Linie @ 151.234 getroffen"


def test_fehlgeschlagener_outlook_bricht_den_signalpfad_nicht(monkeypatch, konfiguriert):
    """Outlook-Insert 500 -> nur Log, keine Exception nach aussen."""
    calls = _posts(monkeypatch, outlook_status=500)
    supabase_signals._insert("EURUSD", "SHORT", 1.1, None)  # darf nicht werfen
    assert len(calls) == 2  # Signal ist trotzdem geschrieben


def test_outlook_insert_fehler_wird_geschluckt(monkeypatch, konfiguriert):
    """Auch eine Exception im Outlook-POST darf nicht durchschlagen."""
    def fake_post(url, json=None, headers=None, timeout=None):
        if url.endswith("/signals"):
            return FakeResponse([{"id": "sig-1"}], 201)
        raise RuntimeError("Netz weg")

    monkeypatch.setattr(supabase_signals.requests, "post", fake_post)
    supabase_signals._insert("EURUSD", "SHORT", 1.1, None)


def test_fehlgeschlagenes_signal_erzeugt_keinen_outlook(monkeypatch, konfiguriert):
    calls = _posts(monkeypatch, signal_status=500)
    supabase_signals._insert("EURUSD", "SHORT", 1.1, None)
    assert [u.rsplit("/", 1)[-1] for u, _ in calls] == ["signals"]


def test_signal_ohne_zurueckgegebene_id_erzeugt_keinen_outlook(monkeypatch, konfiguriert):
    """Prefer wurde ignoriert -> kein Fremdschluessel, also kein Outlook."""
    calls = _posts(monkeypatch, signal_payload=[])
    supabase_signals._insert("EURUSD", "SHORT", 1.1, None)
    assert [u.rsplit("/", 1)[-1] for u, _ in calls] == ["signals"]


def test_ohne_konfiguration_passiert_nichts(monkeypatch):
    monkeypatch.setattr(supabase_signals, "_context", lambda: (None, None, None))
    monkeypatch.setattr(supabase_signals, "is_configured", lambda: False)
    calls = _posts(monkeypatch)
    supabase_signals._insert("EURUSD", "SHORT", 1.1, None)
    assert calls == []
