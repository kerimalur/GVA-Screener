"""Die laufende Kerze darf keine GVA erzeugen.

Der Fall vom 19.08.2026 (AUDCAD): der Screener hat eine Wochen-GVA aus der
NOCH LAUFENDEN Woche gemeldet. Deren Level ist der Body-Rand der zweiten
Kerze — und die bewegt sich mit jedem Tick. Der Live-Preis, der diese Kerze
gerade formt, hat die Linie im selben Moment "beruehrt".

Der Nachbar-Filter (analyzer.GVA_MIN_GAP) faengt das NICHT ab: er zaehlt
Kerzen innerhalb der Historie, waehrend der Live-Alert den Kurs direkt gegen
das Level haelt. Zwei verschiedene Fragen, zwei Regeln.
"""
import pandas as pd

from data_pipeline import (
    GVA_3D_ANCHOR, nur_geschlossene, periodenende,
    resample_3d_bars, resample_weekly_bars, resample_monthly_bars,
)


def _daily(bis: str, ab: str = "2026-07-01") -> pd.DataFrame:
    """Tageskerzen Mo-Fr von `ab` bis `bis` (inklusiv)."""
    idx = pd.bdate_range(ab, bis)
    return pd.DataFrame(
        {"open": 1.0, "high": 1.01, "low": 0.99, "close": 1.005, "volume": 1},
        index=idx,
    )


# ------------------------------------------------------------ Periodenende

def test_periodenende_woche_ist_der_freitag():
    # Montag 17.08.2026 -> die Woche endet am Freitag, 21.08.
    assert periodenende("2026-08-17", "W") == pd.Timestamp("2026-08-21")


def test_periodenende_monat_ist_der_letzte_kalendertag():
    assert periodenende("2026-08-03", "M") == pd.Timestamp("2026-08-31")


def test_periodenende_3d_zaehlt_wochentage_nicht_kalendertage():
    """Der Anker 09.07.2026 ist ein Donnerstag. Der Block Do/Fr/Mo endet am
    MONTAG — nicht am Samstag. Genau dafuer wird ueber busday gerechnet."""
    assert periodenende("2026-07-09", "3D", GVA_3D_ANCHOR) == pd.Timestamp("2026-07-13")


# --------------------------------------------------------- Abschneiden

def test_laufende_woche_wird_abgeschnitten():
    # Letzter Tageskurs: Mittwoch 19.08. — die Woche laeuft noch bis Freitag.
    daily = _daily("2026-08-19")
    voll = resample_weekly_bars(daily)
    gekuerzt = nur_geschlossene(voll, daily, "W")
    assert len(gekuerzt) == len(voll) - 1
    assert gekuerzt.index[-1] < pd.Timestamp("2026-08-17")


def test_geschlossene_woche_bleibt_stehen():
    # Letzter Tageskurs: Freitag 21.08. — die Woche ist durch.
    daily = _daily("2026-08-21")
    voll = resample_weekly_bars(daily)
    assert len(nur_geschlossene(voll, daily, "W")) == len(voll)


def test_laufender_monat_wird_abgeschnitten():
    daily = _daily("2026-08-19")
    voll = resample_monthly_bars(daily)
    assert len(nur_geschlossene(voll, daily, "M")) == len(voll) - 1


def test_laufender_3d_block_wird_abgeschnitten():
    """Der Block Mo 17. / Di 18. / Mi 19.08. — am Dienstagabend laeuft er noch."""
    daily = _daily("2026-08-18")
    voll = resample_3d_bars(daily)
    assert periodenende(voll.index[-1], "3D", GVA_3D_ANCHOR) == pd.Timestamp("2026-08-19")
    assert len(nur_geschlossene(voll, daily, "3D")) == len(voll) - 1


def test_geschlossener_3d_block_bleibt_stehen():
    """Einen Tag spaeter ist derselbe Block durch und muss zaehlen — sonst
    haette der Screener dauerhaft eine Kerze zu wenig."""
    daily = _daily("2026-08-19")
    voll = resample_3d_bars(daily)
    assert len(nur_geschlossene(voll, daily, "3D")) == len(voll)


def test_ohne_daten_kein_fehler():
    leer = pd.DataFrame()
    assert nur_geschlossene(leer, leer, "W").empty
    daily = _daily("2026-08-19")
    assert nur_geschlossene(resample_weekly_bars(daily), leer, "W").equals(
        resample_weekly_bars(daily))


# --------------------------------------------------------- Der eigentliche Fall

def test_gva_aus_der_laufenden_woche_entsteht_nicht():
    """Zwei Wochen bilden ein GVA-Muster — aber die zweite laeuft noch.
    Vor dem Fix stand die Linie sofort im Board und der Live-Preis, der sie
    gerade formte, loeste den Alert aus."""
    from analyzer import analyze_gva_zones

    # Woche 1 (10.-14.08.): bullisch, Body 1.0000 -> 1.0100.
    # Woche 2 (17.-19.08., laeuft noch): bearisch, Body 1.0120 -> 0.9950,
    # 1.7x so gross und Body-Top 0.0020 daneben (Toleranz 30% von 0.0100 =
    # 0.0030) -> SHORT-GVA auf 1.0120.
    tage, werte = [], []
    for t, (o, h, l, c) in {
        "2026-08-10": (1.0000, 1.0020, 0.9990, 1.0010),
        "2026-08-11": (1.0010, 1.0050, 1.0000, 1.0040),
        "2026-08-12": (1.0040, 1.0070, 1.0030, 1.0060),
        "2026-08-13": (1.0060, 1.0090, 1.0050, 1.0080),
        "2026-08-14": (1.0080, 1.0110, 1.0070, 1.0100),
        "2026-08-17": (1.0120, 1.0130, 1.0050, 1.0060),
        "2026-08-18": (1.0060, 1.0070, 0.9980, 1.0000),
        "2026-08-19": (1.0000, 1.0010, 0.9940, 0.9950),
    }.items():
        tage.append(pd.Timestamp(t))
        werte.append((o, h, l, c))
    daily = pd.DataFrame(werte, columns=["open", "high", "low", "close"],
                         index=pd.DatetimeIndex(tage))
    daily["volume"] = 1

    voll = resample_weekly_bars(daily)
    *_, shorts_voll, _ = analyze_gva_zones(voll, "AUDCAD", tf="W")
    # Gegenprobe: ohne den Schnitt gaebe es die Linie sehr wohl - sonst wuerde
    # der Test unten aus einem ganz anderen Grund bestehen.
    assert [x["level"] for x in shorts_voll] == [1.0120]

    gekuerzt = nur_geschlossene(voll, daily, "W")
    *_, shorts_zu, _ = analyze_gva_zones(gekuerzt, "AUDCAD", tf="W")
    assert shorts_zu == []
