"""Kontrollwerte fuer die Gruppierung. Aufruf aus mt5-bruecke:  python -m pytest -q

Der Kern ist Kerims Ablauf: ZWEI Positionen je Setup, die erste geht am ersten
Ziel raus, die zweite am vollen. Im Journal ist das EIN Trade. Wird das falsch
gruppiert, verdoppelt sich die Trefferquote und das durchschnittliche R
halbiert sich — die ganze Auswertung waere systematisch daneben.
"""
from datetime import datetime, timedelta

import pytest

from gruppierung import (
    Abschluss, Position, bewerte, gruppiere, mittel_gewichtet,
    normalisiere_symbol, r_wert, risiko, schluessel, zeile,
)

T0 = datetime(2026, 8, 21, 9, 30)
USER = "kerim-uuid"


def pos(ticket, symbol="EURUSD", seite="long", volumen=0.5, minuten=0,
        einstieg=1.1000, stop=1.0950, ziel=1.1100):
    return Position(ticket=ticket, symbol=symbol, seite=seite, volumen=volumen,
                    eroeffnet=T0 + timedelta(minutes=minuten),
                    einstieg=einstieg, stop=stop, ziel=ziel)


# Wert je Preispunkt: bei 0.5 Lot EURUSD bewegt 1.0 Preispunkt 50'000 Einheiten.
# 50 Pips Stop (0.0050) ergeben damit 250 pro Position.
WERT = {1: 50_000.0, 2: 50_000.0, 3: 50_000.0}


# --- Gruppierung ---------------------------------------------------------

def test_zwei_positionen_sind_ein_setup():
    s = gruppiere([pos(1), pos(2, minuten=1)])
    assert len(s) == 1
    assert s[0].tickets == [1, 2]
    assert s[0].volumen == 1.0


def test_gegenrichtung_ist_ein_eigenes_setup():
    # Long und Short im selben Paar sind nie derselbe Gedanke.
    s = gruppiere([pos(1, seite="long"), pos(2, seite="short", minuten=1)])
    assert len(s) == 2


def test_anderes_paar_ist_ein_eigenes_setup():
    s = gruppiere([pos(1, symbol="EURUSD"), pos(2, symbol="GBPUSD", minuten=1)])
    assert len(s) == 2


def test_spaeter_am_tag_ist_ein_neues_setup():
    s = gruppiere([pos(1), pos(2, minuten=90)])
    assert len(s) == 2


def test_fenster_gilt_gegen_die_erste_position():
    # Sonst schreibt sich eine Gruppe endlos fort: 0, 4, 8, 12 Minuten ...
    # und der Trade vom Nachmittag landet im Setup vom Morgen.
    s = gruppiere([pos(1, minuten=0), pos(2, minuten=4), pos(3, minuten=8)])
    assert [x.tickets for x in s] == [[1, 2], [3]]


def test_reihenfolge_der_eingabe_egal():
    a = gruppiere([pos(1), pos(2, minuten=2)])
    b = gruppiere([pos(2, minuten=2), pos(1)])
    assert [x.tickets for x in a] == [x.tickets for x in b]


# --- Schluessel ----------------------------------------------------------

def test_schluessel_ist_stabil():
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    assert schluessel(s) == "EURUSD-long-20260821T0930"


def test_schluessel_haengt_nicht_am_ticket():
    # Wichtig: ein Setup hat zwei Tickets. Haenge der Schluessel an einem davon,
    # wuerde ein Neustart der Bruecke denselben Trade doppelt anlegen.
    a = schluessel(gruppiere([pos(1), pos(2, minuten=1)])[0])
    b = schluessel(gruppiere([pos(77), pos(88, minuten=1)])[0])
    assert a == b


# --- Risiko --------------------------------------------------------------

def test_risiko_summiert_beide_positionen():
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    assert risiko(s, WERT) == 500.0


def test_risiko_ohne_stop_ist_none():
    # Ein halb gerechnetes Risiko waere schlimmer als keins: das R saehe
    # plausibel aus und waere zu gross.
    s = gruppiere([pos(1), pos(2, minuten=1, stop=None)])[0]
    assert risiko(s, WERT) is None


def test_stop_auf_break_even_gezogen_verfaelscht_das_risiko_nicht():
    # DIE Falle. Kerim zieht die zweite Position auf Einstand; MT5 meldet dann
    # dort stop == einstieg. Die Bruecke merkt sich den ERSTEN Stop, deshalb
    # steht hier weiterhin der urspruengliche Wert — und das Risiko stimmt.
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    assert risiko(s, WERT) == 500.0
    nachgezogen = gruppiere([pos(1), pos(2, minuten=1, stop=1.1000)])[0]
    assert risiko(nachgezogen, WERT) == 250.0  # so SAEHE es ohne das Merken aus


# --- Bewertung -----------------------------------------------------------

@pytest.mark.parametrize("gewinn,erwartet", [
    (500.0, "win"), (-500.0, "loss"), (0.0, "breakeven"),
    (10.0, "breakeven"),     # 2 % von 1R — Kommission, kein Gewinn
    (-10.0, "breakeven"),    # dito
    (30.0, "win"),           # 6 % von 1R — ueber der Toleranz
])
def test_bewertung(gewinn, erwartet):
    assert bewerte(gewinn, 500.0) == erwartet


def test_bewertung_ohne_risiko_nur_vorzeichen():
    assert bewerte(5.0, None) == "win"
    assert bewerte(-5.0, None) == "loss"
    assert bewerte(0.0, None) == "breakeven"


def test_r_wert():
    assert r_wert(1000.0, 500.0) == 2.0
    assert r_wert(-500.0, 500.0) == -1.0
    assert r_wert(250.0, None) == 0.0
    assert r_wert(250.0, 0) == 0.0


def test_mittel_gewichtet():
    assert mittel_gewichtet([(1.1000, 0.5), (1.2000, 0.5)]) == 1.15
    assert mittel_gewichtet([(1.1000, 1.5), (1.2000, 0.5)]) == 1.125
    assert mittel_gewichtet([]) is None


# --- Die ganze Zeile -----------------------------------------------------

def test_erste_position_zu_offen_zweite_laeuft_noch():
    # Genau Kerims Ablauf. Der Trade ist NICHT fertig, nur weil das erste Ziel
    # sass — sonst stuende im Journal ein abgeschlossener Trade, waehrend noch
    # Geld im Markt ist.
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    z = zeile(s, [Abschluss(1, 250.0, 1.1050, T0 + timedelta(hours=2))], USER, WERT)
    assert z["status"] == "open"
    assert z["result"] is None
    assert z["exit_price"] is None
    assert z["profit_amount"] is None


def test_beide_ziele_getroffen():
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    z = zeile(s, [
        Abschluss(1, 250.0, 1.1050, T0 + timedelta(hours=2)),
        Abschluss(2, 500.0, 1.1100, T0 + timedelta(hours=5)),
    ], USER, WERT)
    assert z["status"] == "closed"
    assert z["result"] == "win"
    assert z["profit_amount"] == 750.0
    assert z["r_multiple"] == 1.5        # 750 / 500
    assert z["exit_price"] == 1.1075     # gleiches Volumen -> Mittel
    assert z["lot_size"] == 1.0


def test_erstes_ziel_dann_break_even():
    # Der haeufigste Ausgang bei Kerim: erster TP sitzt, der Rest geht auf
    # Einstand raus. Netto ein Gewinn, im Journal ein "win".
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    z = zeile(s, [
        Abschluss(1, 250.0, 1.1050, T0 + timedelta(hours=2)),
        Abschluss(2, -3.0, 1.1000, T0 + timedelta(hours=6)),  # Swap
    ], USER, WERT)
    assert z["result"] == "win"
    assert z["r_multiple"] == 0.49       # 247 / 500


def test_beide_ausgestoppt():
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    z = zeile(s, [
        Abschluss(1, -250.0, 1.0950, T0 + timedelta(hours=1)),
        Abschluss(2, -250.0, 1.0950, T0 + timedelta(hours=1)),
    ], USER, WERT)
    assert z["result"] == "loss"
    assert z["r_multiple"] == -1.0


def test_zeile_ist_immer_live_und_nie_backtest():
    s = gruppiere([pos(1)])[0]
    z = zeile(s, [], USER, WERT)
    assert z["session_type"] == "live"


def test_stop_und_ziel_beschreiben_die_absicht():
    # Der Stop ist bei long der TIEFSTE, das Ziel das WEITESTE: zusammen sind
    # das die Grenzen des Setups. Das nahe Ziel der ersten Position steht im
    # Ergebnis, nicht im Plan.
    s = gruppiere([
        pos(1, stop=1.0950, ziel=1.1050),
        pos(2, minuten=1, stop=1.0940, ziel=1.1200),
    ])[0]
    z = zeile(s, [], USER, WERT)
    assert z["stop_loss"] == 1.0940
    assert z["take_profit"] == 1.1200


def test_short_dreht_stop_und_ziel_um():
    s = gruppiere([
        pos(1, seite="short", einstieg=1.1000, stop=1.1050, ziel=1.0950),
        pos(2, seite="short", minuten=1, einstieg=1.1000, stop=1.1060, ziel=1.0900),
    ])[0]
    z = zeile(s, [], USER, WERT)
    assert z["stop_loss"] == 1.1060      # bei short der HOECHSTE
    assert z["take_profit"] == 1.0900    # bei short das TIEFSTE


def test_schluessel_und_tickets_stehen_in_der_zeile():
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    z = zeile(s, [], USER, WERT)
    assert z["mt5_setup_key"] == "EURUSD-long-20260821T0930"
    assert z["mt5_tickets"] == [1, 2]


# --- Broker-Zusatz -------------------------------------------------------
# Vantage meldet "EURCHF+". Das Journal, der Screener und die Confluence
# kennen nur "EURCHF". Mit dem Zusatz waere der Trade in der Datenbank, aber
# fuer jeden Filter unsichtbar — schlimmer als zu fehlen.

@pytest.mark.parametrize("roh,erwartet", [
    ("EURCHF+", "EURCHF"),      # Vantage, der echte Fall vom 21.08.2026
    ("EURUSD", "EURUSD"),       # ohne Zusatz unveraendert
    ("XAUUSD.r", "XAUUSD"),     # Punkt-Zusatz
    ("EURUSDm", "EURUSD"),      # Kleinbuchstabe als Zusatz
    ("GBPJPY#", "GBPJPY"),      # Raute
    ("USDCAD-ECN", "USDCAD"),   # Bindestrich
    ("EURUSD_raw", "EURUSD"),   # Unterstrich
    ("AUDNZD2", "AUDNZD"),      # Ziffer
    ("EURUSDPRO", "EURUSD"),    # GROSSbuchstaben-Zusatz: erste sechs gelten
    ("US500", "US"),            # kein FX — der Lauf bleibt, wie er ist
    (" EURCHF+ ", "EURCHF"),    # Leerzeichen
])
def test_broker_zusatz_faellt_weg(roh, erwartet):
    assert normalisiere_symbol(roh) == erwartet


def test_zusatz_wird_nicht_blind_auf_sechs_gekuerzt():
    # "BTCUSD" waere sechs Zeichen, aber "BTC" ist keine der Waehrungen in der
    # Liste — gekuerzt wird nur, wenn beide Haelften bekannt sind. Sonst
    # verstuemmelte die Regel Namen, die sie gar nicht kennt.
    assert normalisiere_symbol("BTCUSDX") == "BTCUSDX"


# --- Unmessbares R wird kenntlich gemacht --------------------------------
# Eine 0 in der R-Spalte sieht aus wie ein Break-even. Ohne Vermerk
# verwaessert ein unmessbarer Trade jede Durchschnitts-Auswertung, ohne dass
# man es der Zahl ansieht.

def test_ohne_risiko_steht_ein_vermerk_im_kommentar():
    s = gruppiere([pos(1, stop=None), pos(2, minuten=1, stop=None)])[0]
    z = zeile(s, [
        Abschluss(1, 100.0, 1.1050, T0 + timedelta(hours=2)),
        Abschluss(2, 100.0, 1.1050, T0 + timedelta(hours=3)),
    ], USER, WERT)
    assert z["r_multiple"] == 0
    assert "nicht gemessen" in z["comment"]


def test_mit_risiko_kein_vermerk():
    s = gruppiere([pos(1), pos(2, minuten=1)])[0]
    z = zeile(s, [
        Abschluss(1, 250.0, 1.1050, T0 + timedelta(hours=2)),
        Abschluss(2, 500.0, 1.1100, T0 + timedelta(hours=5)),
    ], USER, WERT)
    assert "comment" not in z


def test_offener_trade_bekommt_keinen_vermerk():
    # Bei einem offenen Trade ist das R noch gar nicht faellig — ein Vermerk
    # waere eine Warnung vor etwas, das noch passieren kann.
    s = gruppiere([pos(1, stop=None), pos(2, minuten=1, stop=None)])[0]
    z = zeile(s, [], USER, WERT)
    assert "comment" not in z
