"""Aus MT5-Positionen Journaleintraege machen — reine Rechnung, kein MT5.

Kerim eroeffnet je Setup ZWEI Positionen: die erste wird am ersten Take Profit
geschlossen, die zweite am vollen Ziel. Im Journal ist das aber EIN Trade. Wer
die Positionen einzeln journaliert, verdoppelt die Trefferquote und halbiert
das durchschnittliche R — die Auswertung waere systematisch falsch.

Diese Datei enthaelt deshalb genau die Logik, die daraus wieder einen Trade
macht, und sonst nichts. Kein MetaTrader, kein Supabase, kein Netz: damit ist
sie ohne laufendes Terminal pruefbar (`tests/test_gruppierung.py`).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

# Zwei Positionen gehoeren zum selben Setup, wenn sie dasselbe Instrument in
# dieselbe Richtung handeln und dicht beieinander eroeffnet wurden. Fuenf
# Minuten, weil Kerim beide von Hand setzt — das dauert Sekunden, nicht
# Minuten, aber ein grosszuegiges Fenster kostet hier nichts: zwei Setups im
# selben Paar UND derselben Richtung binnen fuenf Minuten waere ohnehin
# derselbe Gedanke.
FENSTER_MINUTEN = 5

# Ein Break-even ist nie exakt null: Kommission und Swap knabbern daran. Ohne
# Toleranz waere jeder auf Einstand geschlossene Trade ein "loss" von ein paar
# Cent. Gemessen wird gegen das RISIKO, nicht gegen einen festen Betrag —
# 5 % von 1R ist bei jeder Kontogroesse dasselbe Verhaeltnis.
BE_TOLERANZ = 0.05


# Waehrungscodes, aus denen ein FX-Paar besteht. Nur noetig, um einen
# Grossbuchstaben-Zusatz wie "EURUSDPRO" von einem echten Namen zu trennen.
WAEHRUNGEN = {
    "AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF",
    "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR",
    "XAU", "XAG", "XPT", "XPD",
}


def normalisiere_symbol(roh: str) -> str:
    """Broker-Zusatz abschneiden: "EURCHF+" -> "EURCHF".

    Vantage haengt an jedes Instrument ein "+". Andere Broker nehmen ".r", "m",
    "#" oder "_raw". Im Journal, im Screener und in der Confluence heisst das
    Paar aber "EURCHF" — schriebe die Bruecke "EURCHF+", passte der Trade zu
    keinem Filter, zu keinem Ranking und zu keiner Saison-Auswertung. Er waere
    da und trotzdem unsichtbar, was schlimmer ist als zu fehlen.

    Regel: der fuehrende Lauf aus GROSSbuchstaben. Das schneidet "+", ".r",
    "m", "#", "-ECN" und Ziffern gleichermassen ab, weil keiner davon ein
    Grossbuchstabe ist.

    Ausnahme fuer den Fall, dass der Zusatz doch gross ist ("EURUSDPRO"): sind
    es mehr als sechs Zeichen und die ersten sechs bestehen aus zwei bekannten
    Waehrungscodes, gelten die sechs. Sonst bleibt der ganze Lauf stehen —
    lieber ein unbekannter Name als ein falsch abgeschnittener.
    """
    lauf = ""
    for z in roh.strip():
        if "A" <= z <= "Z":
            lauf += z
        else:
            break
    if not lauf:
        return roh.strip().upper()
    if len(lauf) > 6 and lauf[:3] in WAEHRUNGEN and lauf[3:6] in WAEHRUNGEN:
        return lauf[:6]
    return lauf


@dataclass
class Position:
    """Eine offene Position, so wie das Terminal sie meldet."""
    ticket: int
    symbol: str
    seite: str                 # "long" | "short"
    volumen: float
    eroeffnet: datetime        # UTC
    einstieg: float
    # ACHTUNG: der Stop zum ZEITPUNKT DER EROEFFNUNG. Nicht der aktuelle.
    # Sobald Kerim die zweite Position auf Break-even zieht, meldet MT5 dort
    # den neuen Stop. Wer den zum Rechnen nimmt, bekommt Risiko 0 und damit
    # ein unendliches R. Die Bruecke merkt sich den ersten gesehenen Wert.
    stop: float | None
    ziel: float | None = None


@dataclass
class Abschluss:
    """Was aus einer Position geworden ist, netto."""
    ticket: int
    # Gewinn inklusive Kommission und Swap. Brutto waere geschoent.
    gewinn: float
    ausstieg: float
    geschlossen: datetime


@dataclass
class Setup:
    """Ein Trade im Journal — aus einer oder mehreren Positionen."""
    symbol: str
    seite: str
    positionen: list[Position] = field(default_factory=list)

    @property
    def eroeffnet(self) -> datetime:
        return min(p.eroeffnet for p in self.positionen)

    @property
    def tickets(self) -> list[int]:
        return sorted(p.ticket for p in self.positionen)

    @property
    def volumen(self) -> float:
        return round(sum(p.volumen for p in self.positionen), 4)


def _sortierschluessel(p: Position) -> tuple:
    return (p.symbol, p.seite, p.eroeffnet, p.ticket)


def gruppiere(positionen: list[Position], fenster_minuten: int = FENSTER_MINUTEN) -> list[Setup]:
    """Positionen zu Setups zusammenfassen.

    Das Fenster gilt gegenueber der ERSTEN Position der Gruppe, nicht gegenueber
    der jeweils vorherigen. Sonst koennte sich eine Gruppe ueber Stunden
    fortschreiben, wenn alle fuenf Minuten eine Position dazukommt — und ein
    Trade vom Nachmittag landete im Setup vom Morgen.
    """
    grenze = timedelta(minutes=fenster_minuten)
    setups: list[Setup] = []

    for p in sorted(positionen, key=_sortierschluessel):
        passend = next(
            (s for s in setups
             if s.symbol == p.symbol and s.seite == p.seite
             and p.eroeffnet - s.eroeffnet <= grenze),
            None,
        )
        if passend is None:
            setups.append(Setup(symbol=p.symbol, seite=p.seite, positionen=[p]))
        else:
            passend.positionen.append(p)

    return setups


def schluessel(setup: Setup) -> str:
    """Eindeutiger Schluessel des Setups — der Schutz gegen Doppelte.

    Aus Symbol, Richtung und Eroeffnungsminute. Startet die Bruecke neu, findet
    sie denselben Schluessel und schreibt den Trade nicht ein zweites Mal.

    Die Ticketnummer taugt dafuer NICHT: sie gehoert zu einer Position, und ein
    Setup hat zwei davon. Die Minute genuegt, weil zwei Setups im selben Paar
    und derselben Richtung in derselben Minute nicht vorkommen.
    """
    return f"{setup.symbol}-{setup.seite}-{setup.eroeffnet.strftime('%Y%m%dT%H%M')}"


def risiko(setup: Setup, wert_je_punkt: dict[int, float]) -> float | None:
    """Was das Setup verloren haette, waeren alle Stops getroffen worden.

    `wert_je_punkt` kommt je Ticket von aussen (aus MT5, das die Kontraktgroesse
    und die Kontowaehrung kennt) — hier wird nur multipliziert und addiert.

    Gibt None zurueck, wenn auch nur EINE Position keinen Stop hatte. Ein
    teilweise berechnetes Risiko waere schlimmer als gar keins: das R saehe
    plausibel aus und waere zu gross.
    """
    summe = 0.0
    for p in setup.positionen:
        if p.stop is None or p.stop <= 0:
            return None
        abstand = abs(p.einstieg - p.stop)
        summe += abstand * wert_je_punkt.get(p.ticket, 0.0)
    return round(summe, 2) if summe > 0 else None


def bewerte(gewinn: float, risiko_betrag: float | None,
            toleranz_anteil: float = BE_TOLERANZ) -> str:
    """"win" | "loss" | "breakeven" — dieselben drei Werte wie im Journal.

    Ohne bekanntes Risiko bleibt nur das Vorzeichen; dann ist jede Toleranz
    geraten, und geraten wird hier nicht.
    """
    if risiko_betrag is None or risiko_betrag <= 0:
        if gewinn > 0:
            return "win"
        return "loss" if gewinn < 0 else "breakeven"

    toleranz = risiko_betrag * toleranz_anteil
    if gewinn > toleranz:
        return "win"
    if gewinn < -toleranz:
        return "loss"
    return "breakeven"


def r_wert(gewinn: float, risiko_betrag: float | None) -> float:
    """Gewinn in R. Ohne Risiko 0.0 — nicht None, weil das Journal eine Zahl will.

    Eine 0 ist hier ehrlich: sie sagt "nicht messbar" und verzerrt den
    Durchschnitt weniger als eine erfundene 1.
    """
    if not risiko_betrag or risiko_betrag <= 0:
        return 0.0
    return round(gewinn / risiko_betrag, 2)


def mittel_gewichtet(paare: list[tuple[float, float]]) -> float | None:
    """Nach Volumen gewichteter Mittelwert von (Preis, Volumen)."""
    gesamt = sum(v for _, v in paare)
    if gesamt <= 0:
        return None
    return round(sum(p * v for p, v in paare) / gesamt, 5)


def zeile(setup: Setup, abschluesse: list[Abschluss], user_id: str,
          wert_je_punkt: dict[int, float],
          kontostand: float | None = None) -> dict:
    """Der fertige Journaleintrag.

    Offen, solange nicht ALLE Positionen des Setups geschlossen sind. Genau das
    ist Kerims Ablauf: die erste Position ist am ersten Ziel schon weg, waehrend
    die zweite noch laeuft — der Trade ist dann aber nicht fertig.

    Spaltennamen wie in der Datenbank (`symbol`/`side`, nicht `pair`/`direction`)
    — das ist Erbe aus dem alten Journal und wird in KerimOS uebersetzt.
    """
    nach_ticket = {a.ticket: a for a in abschluesse}
    offen = [p for p in setup.positionen if p.ticket not in nach_ticket]
    fertig = not offen

    eintritte = [(p.einstieg, p.volumen) for p in setup.positionen]
    stops = [p.stop for p in setup.positionen if p.stop]
    ziele = [p.ziel for p in setup.positionen if p.ziel]
    ri = risiko(setup, wert_je_punkt)

    z: dict = {
        "user_id": user_id,
        "type": "ek",
        "symbol": setup.symbol,
        "side": setup.seite,
        "date": setup.eroeffnet.date().isoformat(),
        # Journal = Live. Der Backtest hat damit nichts zu tun und wird von der
        # Bruecke nie angefasst.
        "session_type": "live",
        "status": "closed" if fertig else "open",
        "entry_price": mittel_gewichtet(eintritte),
        "stop_loss": min(stops) if setup.seite == "long" and stops
        else (max(stops) if stops else None),
        # Das WEITESTE Ziel: es beschreibt die Absicht des Setups. Das nahe Ziel
        # der ersten Position steht im Ergebnis, nicht im Plan.
        "take_profit": (max(ziele) if setup.seite == "long" else min(ziele)) if ziele else None,
        "lot_size": setup.volumen,
        "mt5_setup_key": schluessel(setup),
        "mt5_tickets": setup.tickets,
        # Das Risiko in Kontowaehrung. Es wurde bisher gerechnet und
        # weggeworfen — dabei ist es die eine Zahl, aus der sich alles Weitere
        # ergibt: R, und mit dem Kontostand daneben auch der Prozentwert.
        # None heisst "nicht messbar" und ist ehrlicher als eine Schaetzung.
        "risk_amount": ri,
        # Kontostand zum Zeitpunkt des Schreibens. Damit laesst sich das
        # Ergebnis in Prozent vom Konto ausdruecken — die Zahl, die ueber die
        # Zeit vergleichbar bleibt, waehrend "Prozent vom Risiko" nur R mal
        # hundert waere.
        "account_balance": kontostand,
    }

    if not fertig:
        z.update({"result": None, "r_multiple": 0, "exit_price": None, "profit_amount": None})
        return z

    # Ist das Risiko unbekannt, wird das R zu 0 — und eine 0 in der Spalte
    # sieht aus wie ein Break-even. Das muss dranstehen, sonst verwaessert ein
    # unmessbarer Trade stillschweigend jede Durchschnitts-Auswertung.
    if ri is None:
        z["comment"] = ("Urspruenglicher Stop nicht rekonstruierbar - R nicht "
                        "gemessen. Stop beim Einstieg mit der Order setzen.")

    gewinn = round(sum(a.gewinn for a in abschluesse if a.ticket in setup.tickets), 2)
    austritte = [
        (nach_ticket[p.ticket].ausstieg, p.volumen) for p in setup.positionen
    ]
    z.update({
        "result": bewerte(gewinn, ri),
        "r_multiple": r_wert(gewinn, ri),
        "exit_price": mittel_gewichtet(austritte),
        "profit_amount": gewinn,
    })
    return z
