"""Kontrollwerte für den Cockpit-Deep-Link im Telegram-Alert (Teil 5).

Kernanforderung: ohne FRONTEND_URL fällt der Link weg, der Alert bleibt aber
gültig (Link weglassen statt Alert verwerfen).
"""
import main


def test_deep_link_present_when_env_set(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://example.vercel.app")
    link = main.cockpit_deep_link("EURUSD")
    assert "https://example.vercel.app/cockpit?pair=EURUSD" in link
    assert link.startswith("\n\n[")


def test_deep_link_strips_trailing_slash(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://example.vercel.app/")
    link = main.cockpit_deep_link("GBPJPY")
    assert "example.vercel.app/cockpit?pair=GBPJPY" in link
    assert "vercel.app//cockpit" not in link


def test_deep_link_empty_when_env_missing(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    assert main.cockpit_deep_link("EURUSD") == ""
