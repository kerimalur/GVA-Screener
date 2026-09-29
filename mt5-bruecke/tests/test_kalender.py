"""Kalender-Datei lesen und nur Geaendertes hochladen (29.09.2026)."""
import os
import tempfile

import kalender

KOPF = "value_id;event_id;ccy;name;importance;time_utc;actual;forecast;previous;revised;multiplier;unit\n"


def _datei(inhalt: str) -> str:
    fd, pfad = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, "w", encoding="cp1252") as f:
        f.write(inhalt)
    return pfad


def test_lies_zahlen_und_leere_werte():
    pfad = _datei(KOPF
                  + "101;840030016;USD;Nonfarm Payrolls;CALENDAR_IMPORTANCE_HIGH;2026.09.04 12:30;158000.000000;60000.000000;-23000.000000;;CALENDAR_MULTIPLIER_THOUSANDS;CALENDAR_UNIT_JOB\n"
                  + "102;840030020;USD;Initial Jobless Claims;CALENDAR_IMPORTANCE_HIGH;2026.10.01 12:30;;203.000000;198.000000;;CALENDAR_MULTIPLIER_THOUSANDS;CALENDAR_UNIT_JOB\n"
                  + "kaputt;;;;;;;;;;;\n")
    z = kalender.lies(pfad)
    assert len(z) == 2
    assert z[0]["actual"] == 158000.0 and z[0]["event_time"] == "2026-09-04T12:30:00+00:00"
    assert z[1]["actual"] is None and z[1]["forecast"] == 203.0


class _Tabelle:
    def __init__(self, log):
        self.log = log

    def upsert(self, zeilen, on_conflict):
        self.log.append((len(zeilen), on_conflict))
        return self

    def execute(self):
        return None


class _Db:
    def __init__(self):
        self.log = []

    def table(self, name):
        assert name == "mt5_kalender"
        return _Tabelle(self.log)


def test_nur_geaendertes_hochladen():
    kalender._fingerabdruck.clear()
    kalender._zustand.update({"lauf": 0.0, "mtime": None, "meldung": None})
    pfad = _datei(KOPF + "201;1;EUR;CPI y/y;CALENDAR_IMPORTANCE_HIGH;2026.09.01 09:00;2.4;2.5;2.5;;CALENDAR_MULTIPLIER_NONE;CALENDAR_UNIT_PERCENT\n")
    db = _Db()
    assert "1 von 1" in kalender.hochladen(db, False, erzwingen=True, pfad=pfad)
    assert kalender.hochladen(db, False, erzwingen=True, pfad=pfad) is None
    assert db.log == [(1, "value_id")]


def test_fehlende_datei_meldet_einmal():
    kalender._zustand.update({"lauf": 0.0, "mtime": None, "meldung": None})
    weg = os.path.join(tempfile.gettempdir(), "gibt-es-nicht.csv")
    assert "fehlt" in kalender.hochladen(None, False, erzwingen=True, pfad=weg)
    assert kalender.hochladen(None, False, erzwingen=True, pfad=weg) is None
