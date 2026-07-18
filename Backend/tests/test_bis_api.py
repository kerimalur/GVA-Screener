"""bis_api: CPI YoY aus BIS — Parser, Cache, Frische-Regel, Fallbacks."""
import pytest

import bis_api


CSV = (
    "FREQ,REF_AREA,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE\n"
    "M,US,771,2026-04,2.4\n"
    "M,US,771,2026-05,2.3\n"
    "M,JP,771,2026-03,NaN\n"
    "M,JP,771,2026-04,3.1\n"
    "M,AU,771,2025-12,2.8\n"
    "M,AU,771,2026-03,2.9\n"  # quartalsweise: nur Quartalsmonate
    "M,XX,771,2026-05,9.9\n"  # unbekannte Area -> ignorieren
)


class FakeResponse:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise bis_api.requests.HTTPError(f"HTTP {self.status_code}")


@pytest.fixture(autouse=True)
def reset_cache():
    bis_api._cache["ts"] = 0.0
    bis_api._cache["data"] = None
    yield


def _mock_get(monkeypatch, responses: list, calls: list):
    def fake_get(url, params=None, timeout=None):
        calls.append(url)
        if not responses:
            raise bis_api.requests.ConnectionError("mock leer")
        return responses.pop(0)

    monkeypatch.setattr(bis_api.requests, "get", fake_get)


def test_parse_und_quartals_wert(monkeypatch):
    calls: list = []
    _mock_get(monkeypatch, [FakeResponse(CSV)], calls)

    assert bis_api.bis_cpi_yoy("USD") == 2.3   # letzter Monat gewinnt
    assert bis_api.bis_cpi_yoy("JPY") == 3.1   # NaN-Zeile uebersprungen
    assert bis_api.bis_cpi_yoy("AUD") == 2.9   # Quartalswert gilt (release-bedingt)
    assert bis_api.bis_cpi_yoy("GBP") is None  # nicht im CSV
    assert len(calls) == 1  # ein Request fuer alles, danach Cache


def test_tote_serie_ueber_400_tage_none(monkeypatch):
    alt = (
        "FREQ,REF_AREA,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE\n"
        "M,US,771,2021-06,5.4\n"
    )
    _mock_get(monkeypatch, [FakeResponse(alt)], [])
    assert bis_api.bis_cpi_yoy("USD") is None


def test_fetch_fehler_ohne_cache_none(monkeypatch):
    _mock_get(monkeypatch, [], [])
    assert bis_api.bis_cpi_yoy("USD") is None


def test_fetch_fehler_mit_cache_behaelt_wert(monkeypatch):
    calls: list = []
    _mock_get(monkeypatch, [FakeResponse(CSV)], calls)
    assert bis_api.bis_cpi_yoy("USD") == 2.3

    # Cache abgelaufen, naechster Fetch platzt -> alter Wert bleibt
    bis_api._cache["ts"] = 0.0
    assert bis_api.bis_cpi_yoy("USD") == 2.3
    assert len(calls) == 2


def test_fundamentals_cpi_yoy_delegiert(monkeypatch):
    import fundamentals

    _mock_get(monkeypatch, [FakeResponse(CSV)], [])
    assert fundamentals.cpi_yoy("USD") == 2.3
    assert fundamentals.cpi_yoy("XYZ") is None
