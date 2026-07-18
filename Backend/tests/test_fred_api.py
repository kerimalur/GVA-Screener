"""fred_api: offizielle FRED-API — Parser, Fehlerpfade, Key aus Env."""
import fred_api


class FakeResponse:
    def __init__(self, status_code: int, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def _mock_get(monkeypatch, responses: list, calls: list):
    def fake_get(url, params=None, timeout=None):
        calls.append({"url": url, "params": params})
        if not responses:
            raise fred_api.requests.ConnectionError("mock leer")
        return responses.pop(0)

    monkeypatch.setattr(fred_api.requests, "get", fake_get)
    monkeypatch.setattr(fred_api.time, "sleep", lambda s: None)


def test_parse_filtert_punkt_und_kaputte_zeilen(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")
    calls: list = []
    _mock_get(monkeypatch, [FakeResponse(200, {"observations": [
        {"date": "2026-07-14", "value": "4.32"},
        {"date": "2026-07-15", "value": "."},
        {"date": "2026-07-16", "value": "4.35"},
        {"date": "kaputt", "value": "1"},
        {"date": "2026-07-17", "value": ""},
    ]})], calls)

    assert fred_api.fred_observations("DGS10") == [("2026-07-14", 4.32), ("2026-07-16", 4.35)]
    assert calls[0]["params"]["series_id"] == "DGS10"
    assert calls[0]["params"]["api_key"] == "TESTKEY"  # Key als Param, nie in der URL


def test_fehlender_key_kein_request(monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    calls: list = []
    _mock_get(monkeypatch, [], calls)

    assert fred_api.fred_observations("DGS10") == []
    assert calls == []


def test_400_tote_serie_kein_retry(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")
    calls: list = []
    _mock_get(monkeypatch, [FakeResponse(400, {"error_message": "series does not exist"})], calls)

    assert fred_api.fred_observations("TOT") == []
    assert len(calls) == 1


def test_429_retry_dann_ok(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")
    calls: list = []
    _mock_get(monkeypatch, [
        FakeResponse(429, {"error_message": "rate limit"}),
        FakeResponse(200, {"observations": [{"date": "2026-07-16", "value": "17.5"}]}),
    ], calls)

    assert fred_api.fred_observations("VIXCLS") == [("2026-07-16", 17.5)]
    assert len(calls) == 2


def test_netzfehler_zweimal_leer(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "TESTKEY")
    calls: list = []
    _mock_get(monkeypatch, [], calls)

    assert fred_api.fred_observations("DGS10") == []
    assert len(calls) == 2
