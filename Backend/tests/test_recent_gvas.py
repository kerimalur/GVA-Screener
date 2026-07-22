"""Kontrollwerte für recent_gvas (Detail-Popup: letzte GVA-Linien)."""
from data_pipeline import recent_gvas


def test_sorted_desc_by_date_and_tagged():
    shorts = [
        {"level": 1.2000, "date": "01.03.2026"},
        {"level": 1.2500, "date": "10.03.2026"},
    ]
    longs = [
        {"level": 1.1000, "date": "05.03.2026"},
    ]
    out = recent_gvas(shorts, longs)
    # Neueste zuerst: 10.03 (SHORT), 05.03 (LONG), 01.03 (SHORT)
    assert [(x["type"], x["date"]) for x in out] == [
        ("SHORT", "10.03.2026"),
        ("LONG", "05.03.2026"),
        ("SHORT", "01.03.2026"),
    ]
    assert out[0]["level"] == 1.25


def test_limit_three():
    shorts = [{"level": i / 10, "date": f"0{i}.01.2026"} for i in range(1, 6)]
    out = recent_gvas(shorts, [])
    assert len(out) == 3
    assert out[0]["date"] == "05.01.2026"  # neueste


def test_empty():
    assert recent_gvas([], []) == []
    assert recent_gvas(None, None) == []
