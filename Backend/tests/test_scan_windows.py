"""Punkt 2 — Nachtrag-Fenster pro Paar statt global.

Fehlerbild vorher: ein global fortgeschriebener `last_backfill_scan` schloss das
Fenster auch fuer Paare, die im selben Lauf ausgefallen waren. Deren verpasste
Hits fielen danach dauerhaft aus dem Suchfenster — genau der Fehlermodus, den
Arbeitspaket B beseitigen sollte, nur eine Ebene tiefer.

Zusaetzlich Punkt 1: der Zaehler abgeschlossener Zonen-Laeufe, an dem das
Frontend Kaltstart von "laeuft, aber unvollstaendig" unterscheidet.
"""
import pandas as pd
import pytest

import main
import late_hits


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    for d in (main.ZONES, main.TRIGGERED, main.CONSUMED, main.ALERT_CACHE, main.PREV_PRICE):
        d.clear()
    main.ZONES_RUNS["completed"] = 0

    # Alle Aussenwege still: kein Telegram, kein Supabase-Insert, kein Abgleich.
    monkeypatch.setattr(main, "send_telegram_alert", lambda text: None)
    monkeypatch.setattr(main, "save_state", lambda: None)
    monkeypatch.setattr(main, "reconcile_state", lambda: None)
    monkeypatch.setattr(main.supabase_signals, "build_snapshot", lambda *a, **k: None)
    monkeypatch.setattr(main.supabase_signals, "record_hit_async", lambda *a, **k: None)
    # `**_` ist Absicht: der echte Aufruf uebergibt tf="3D"/"W"/"M". Eine
    # Attrappe mit fester Signatur laesst compute_zones fuer JEDES Paar mit
    # TypeError abbrechen — dann misst der Test nur noch sich selbst.
    monkeypatch.setattr(main, "analyze_gva_zones",
                        lambda df, pair, **_: (None, None, None, None, 1.0, None, [], []))
    yield


class FakeState:
    """Minimaler Ersatz fuer screener_state — zaehlt Roundtrips mit."""

    def __init__(self, initial=None):
        self.store = dict(initial or {})
        self.reads = 0
        self.writes = 0

    def get(self, key):
        self.reads += 1
        return self.store.get(key)

    def set(self, key, value):
        self.writes += 1
        self.store[key] = value
        return True

    def install(self, monkeypatch):
        monkeypatch.setattr(main.supabase_signals, "get_state_value", self.get)
        monkeypatch.setattr(main.supabase_signals, "set_state_value", self.set)
        return self


def _daily(rows: int = 3) -> pd.DataFrame:
    idx = pd.to_datetime(["2026-07-09", "2026-07-10", "2026-07-13"][:rows])
    return pd.DataFrame(
        {"open": 1.0, "high": 1.01, "low": 0.99, "close": 1.005, "volume": 1},
        index=idx,
    )


# --- _load_scan_state / Migration -------------------------------------------

def test_erster_lauf_ohne_zustand_traegt_nichts_nach(monkeypatch):
    FakeState().install(monkeypatch)
    state = main._load_scan_state()
    assert state == {}
    assert main._since_day(state, "EURUSD") is None  # None = nichts nachtragen


def test_globaler_altwert_wird_auf_alle_paare_uebernommen(monkeypatch):
    """Ohne Migration gaelte nach dem Deploy jedes Paar als 'erster Lauf' und
    der Nachtrag bliebe einmalig stumm."""
    FakeState({late_hits.LAST_SCAN_KEY: {"at": "2026-07-18T22:00:00+00:00"}}).install(monkeypatch)
    state = main._load_scan_state()
    assert set(state) == set(main.PAIRS)
    assert main._since_day(state, "EURUSD") == "2026-07-18"


def test_pair_wert_schlaegt_globalen_altwert(monkeypatch):
    FakeState({
        late_hits.LAST_SCAN_KEY: {"at": "2026-07-18T22:00:00+00:00"},
        late_hits.LAST_SCAN_BY_PAIR_KEY: {"EURUSD": "2026-07-20T08:00:00+00:00"},
    }).install(monkeypatch)
    state = main._load_scan_state()
    assert main._since_day(state, "EURUSD") == "2026-07-20"   # eigener Wert
    assert main._since_day(state, "GBPUSD") == "2026-07-18"   # Migration


def test_vollstaendiger_zustand_braucht_nur_einen_lesevorgang(monkeypatch):
    """Ist die Migration durch, darf der Alt-Key nicht mehr abgefragt werden —
    compute_zones soll bei einem Lese- und einem Schreibvorgang bleiben."""
    fake = FakeState({
        late_hits.LAST_SCAN_BY_PAIR_KEY: {p: "2026-07-20T08:00:00+00:00" for p in main.PAIRS},
    }).install(monkeypatch)
    main._load_scan_state()
    assert fake.reads == 1


def test_save_schreibt_nur_erfolgreiche_paare(monkeypatch):
    fake = FakeState().install(monkeypatch)
    state = {"AUDUSD": "2026-07-01T00:00:00+00:00"}
    main._save_scan_state(state, ["EURUSD", "GBPUSD"])

    geschrieben = fake.store[late_hits.LAST_SCAN_BY_PAIR_KEY]
    assert set(geschrieben) == {"AUDUSD", "EURUSD", "GBPUSD"}
    assert geschrieben["AUDUSD"] == "2026-07-01T00:00:00+00:00"  # unangetastet
    assert fake.writes == 1  # ein Roundtrip fuer alle Paare


def test_save_ohne_erfolg_schreibt_gar_nicht(monkeypatch):
    fake = FakeState().install(monkeypatch)
    main._save_scan_state({}, [])
    assert fake.writes == 0


# --- compute_zones mit Teilausfall ------------------------------------------

def _run_compute(monkeypatch, kaputt: set[str]):
    """compute_zones mit kontrolliertem Ausfall einzelner Paare."""
    def fake_daily(pair, count=5000):
        if pair in kaputt:
            return pd.DataFrame()  # OANDA liefert nichts
        return _daily()

    monkeypatch.setattr(main, "fetch_daily_oanda", fake_daily)
    monkeypatch.setattr(main, "resample_3d_bars", lambda daily: daily)
    monkeypatch.setattr(main, "_handle_late_hits", lambda *a, **k: None)
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    main.compute_zones()


def test_teilausfall_haelt_das_fenster_des_kaputten_paars_offen(monkeypatch, capsys):
    fake = FakeState({
        late_hits.LAST_SCAN_BY_PAIR_KEY: {p: "2026-07-19T00:00:00+00:00" for p in main.PAIRS},
    }).install(monkeypatch)

    _run_compute(monkeypatch, kaputt={"EURUSD"})

    gespeichert = fake.store[late_hits.LAST_SCAN_BY_PAIR_KEY]
    assert gespeichert["EURUSD"] == "2026-07-19T00:00:00+00:00"   # NICHT vorgerueckt
    assert gespeichert["GBPUSD"] > "2026-07-19T00:00:00+00:00"    # vorgerueckt
    assert "EURUSD" not in main.ZONES and "GBPUSD" in main.ZONES

    log = capsys.readouterr().out
    assert "EURUSD" in log and "Nachtrag-Fenster bleibt offen" in log


def test_fehler_im_nachtrag_haelt_das_fenster_ebenfalls_offen(monkeypatch):
    """Wirft _handle_late_hits, darf das Fenster dieses Paars nicht zugehen —
    sonst waere der verpasste Hit beim naechsten Lauf ausserhalb des Fensters."""
    fake = FakeState({
        late_hits.LAST_SCAN_BY_PAIR_KEY: {p: "2026-07-19T00:00:00+00:00" for p in main.PAIRS},
    }).install(monkeypatch)

    def kaputter_nachtrag(pair, df_3d, daily, since_day, *_):
        if pair == "EURUSD":
            raise RuntimeError("OANDA-Historie unvollstaendig")

    monkeypatch.setattr(main, "fetch_daily_oanda", lambda pair, count=5000: _daily())
    monkeypatch.setattr(main, "resample_3d_bars", lambda daily: daily)
    monkeypatch.setattr(main, "_handle_late_hits", kaputter_nachtrag)
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    main.compute_zones()

    gespeichert = fake.store[late_hits.LAST_SCAN_BY_PAIR_KEY]
    assert gespeichert["EURUSD"] == "2026-07-19T00:00:00+00:00"
    assert gespeichert["GBPUSD"] > "2026-07-19T00:00:00+00:00"


def test_offenes_fenster_wird_beim_naechsten_erfolg_ausgewertet(monkeypatch):
    """Nach dem Ausfall bekommt das Paar sein ALTES since_day — der Treffer aus
    der Downtime liegt damit weiterhin im Suchfenster."""
    FakeState({
        late_hits.LAST_SCAN_BY_PAIR_KEY: {p: "2026-07-19T00:00:00+00:00" for p in main.PAIRS},
    }).install(monkeypatch)

    gesehen: dict[str, str | None] = {}
    monkeypatch.setattr(main, "fetch_daily_oanda", lambda pair, count=5000: _daily())
    monkeypatch.setattr(main, "resample_3d_bars", lambda daily: daily)
    monkeypatch.setattr(main, "_handle_late_hits",
                        lambda pair, df_3d, daily, since_day, *_:
                            gesehen.__setitem__(pair, since_day))
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    main.compute_zones()

    assert gesehen["EURUSD"] == "2026-07-19"


# --- Punkt 1: Zaehler abgeschlossener Laeufe ---------------------------------

def test_zones_runs_zaehlt_auch_bei_teilausfall_hoch(monkeypatch):
    """Ein dauerhaft kaputtes Paar darf das Board nicht ewig auf 'startet' nageln."""
    FakeState().install(monkeypatch)
    assert main.ZONES_RUNS["completed"] == 0

    _run_compute(monkeypatch, kaputt={"EURUSD"})

    assert main.ZONES_RUNS["completed"] == 1
    out = main.get_screener()
    assert out["zones_complete_run"] is True
    assert out["zones"] == len(main.PAIRS) - 1   # 27/28 -> Frontend zeigt 'partial'


def test_screener_meldet_kaltstart_vor_dem_ersten_lauf():
    assert main.get_screener()["zones_complete_run"] is False
