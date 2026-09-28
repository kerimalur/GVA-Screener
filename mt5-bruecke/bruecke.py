"""Die Bruecke: MT5-Terminal -> Journal in Supabase.

Laeuft auf Kerims PC, nicht in der Cloud. Das ist keine Entwurfsentscheidung,
sondern die Eigenschaft der einzigen verfuegbaren Schnittstelle: Vantage hat
fuer Privatkunden keine offene API, und das Paket `MetaTrader5` spricht mit dem
lokal INSTALLIERTEN Terminal. Windows, 64-bit, Terminal offen. Ist der Rechner
aus, wird nichts geschrieben — beim naechsten Start holt die Bruecke aus der
Historie nach, was sie verpasst hat.

Was sie tut, alle 30 Sekunden:

  1. offene Positionen holen und zu Setups gruppieren (zwei Positionen je Setup,
     siehe gruppierung.py),
  2. neue Setups als offenen Journaleintrag anlegen,
  3. fuer verschwundene Positionen die Abschluss-Deals holen und den Eintrag
     schliessen, sobald ALLE Positionen des Setups zu sind.

Was sie NICHT tut: Auftraege erteilen, aendern oder schliessen. Sie liest.

Aufruf (aus mt5-bruecke heraus):
    python bruecke.py            # Dauerlauf
    python bruecke.py --einmal   # ein Durchgang, zum Ausprobieren
    python bruecke.py --trocken  # rechnet und zeigt, schreibt nichts
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from gruppierung import (
    Abschluss, Position, Setup, gruppiere, normalisiere_symbol, schluessel, zeile,
)

TAKT_SEKUNDEN = 30
# Wie weit zurueck die Historie geholt wird. Grosszuegig, weil der Abruf billig
# ist und ein zu kurzes Fenster nach einem Wochenende Trades verschluckt.
HISTORIE_TAGE = 30
TABELLE = "trades"
# Laeuft die Bruecke versteckt (ohne Fenster), ist das hier die einzige Spur.
# Deshalb geht jede Meldung IMMER auch in die Datei, nicht nur dann.
LOGDATEI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lauf.log")
# Ab dieser Groesse wird einmal umbenannt statt endlos angehaengt. Ein Log,
# das die Platte fuellt, ist ein Fehler mit Ansage.
LOG_MAX_BYTES = 2_000_000


def melde(text: str) -> None:
    zeit = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    zeile_ = f"{zeit}  {text}"
    # Unter pythonw.exe (Start ohne Fenster) ist sys.stdout None. Ein blankes
    # print() wirft dort AttributeError und beendet die Bruecke sofort — genau
    # das ist am 21.08.2026 passiert: Autostart eingerichtet, Prozess sofort
    # tot, im Log keine einzige neue Zeile. Also nur schreiben, wenn es eine
    # Konsole gibt.
    if sys.stdout is not None:
        try:
            print(zeile_, flush=True)
        except (OSError, ValueError, AttributeError):
            pass
    try:
        if os.path.exists(LOGDATEI) and os.path.getsize(LOGDATEI) > LOG_MAX_BYTES:
            alt_ = LOGDATEI + ".alt"
            if os.path.exists(alt_):
                os.remove(alt_)
            os.rename(LOGDATEI, alt_)
        with open(LOGDATEI, "a", encoding="utf-8") as f:
            f.write(zeile_ + "\n")
    except OSError:
        pass  # Ein kaputtes Log darf den Lauf nicht beenden


def _abbruch(text: str) -> None:
    """Beenden, aber die Begruendung vorher ins Log schreiben.

    Unter pythonw gibt es kein Fenster: eine Fehlermeldung auf stderr sieht
    niemand. Ohne diesen Umweg endet jeder Startfehler als spurloses
    Verschwinden.
    """
    melde(f"ABBRUCH: {' '.join(text.split())}")
    sys.exit(text)


def _fehlt(name: str) -> str:
    wert = os.environ.get(name, "").strip()
    if not wert:
        _abbruch(
            f"\n{name} fehlt.\n"
            "Erwartet werden in der Umgebung oder in mt5-bruecke/.env:\n"
            "  TRADING_SUPABASE_URL, TRADING_SUPABASE_SERVICE_ROLE_KEY, TRADING_USER_ID\n"
            "Alle drei stehen bereits in Kompass/.env.local.\n"
        )
    return wert


def _lade_env(pfad: str = ".env") -> None:
    """Sehr kleines .env-Lesen — kein zusaetzliches Paket dafuer."""
    if not os.path.exists(pfad):
        return
    with open(pfad, encoding="utf-8") as f:
        for roh in f:
            s = roh.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ---------------------------------------------------------------- MetaTrader

def _mt5():
    try:
        import MetaTrader5 as mt5  # type: ignore
    except ImportError:
        _abbruch(
            "\nDas Paket MetaTrader5 fehlt oder passt nicht.\n"
            "  pip install MetaTrader5\n"
            "Es gibt es nur fuer Windows und nur fuer 64-bit-Python. Pruefen mit:\n"
            '  python -c "import platform; print(platform.architecture())"\n'
        )
    if not mt5.initialize():
        _abbruch(f"MT5 antwortet nicht: {mt5.last_error()}. Laeuft das Terminal?")
    return mt5


def hole_positionen(mt5) -> tuple[list[Position], dict[int, str]]:
    """Positionen plus die Broker-Namen je Ticket.

    Zwei Namen, weil beide gebraucht werden: der normalisierte fuers Journal,
    der echte fuer jeden weiteren MT5-Aufruf.
    """
    roh = mt5.positions_get() or []
    namen = {int(p.ticket): str(p.symbol) for p in roh}
    return [
        Position(
            # Broker-Zusatz weg: Vantage meldet "EURCHF+", das Journal kennt
            # nur "EURCHF". Mit dem Zusatz waere der Trade zwar da, aber fuer
            # jeden Filter und jede Auswertung unsichtbar.
            ticket=int(p.ticket), symbol=normalisiere_symbol(str(p.symbol)),
            seite="long" if p.type == mt5.POSITION_TYPE_BUY else "short",
            volumen=float(p.volume),
            eroeffnet=datetime.fromtimestamp(p.time, tz=timezone.utc).replace(tzinfo=None),
            einstieg=float(p.price_open),
            stop=float(p.sl) if p.sl else None,
            ziel=float(p.tp) if p.tp else None,
        )
        for p in roh
    ], namen


def wert_je_punkt(mt5, position: Position, roh_symbol: str) -> float:
    """Was eine Preisbewegung von 1.0 bei diesem Volumen in Kontowaehrung wert ist.

    Ueber `order_calc_profit` statt ueber Kontraktgroesse und Tickwert von Hand:
    das Terminal kennt Kontraktgroesse, Kontowaehrung und Umrechnung. Selbst
    gerechnet stimmt es fuer EURUSD und faellt bei JPY- oder Cross-Paaren um.
    """
    art = mt5.ORDER_TYPE_BUY if position.seite == "long" else mt5.ORDER_TYPE_SELL
    p = position.einstieg
    # ACHTUNG: hier der ECHTE Broker-Name ("EURCHF+"). Das Terminal kennt
    # "EURCHF" nicht und lieferte None — daraus wuerde Risiko 0 und R 0.
    gewinn = mt5.order_calc_profit(art, roh_symbol, position.volumen, p, p + 1.0)
    if gewinn is None:
        return 0.0
    return abs(float(gewinn))


def hole_geschlossene(mt5, tage: int = HISTORIE_TAGE
                     ) -> tuple[list[Position], dict[int, str]]:
    """Positionen aus der Historie rekonstruieren, die die Bruecke nie offen sah.

    Der Fall, fuer den es das gibt: Rechner eine Woche aus, Kerim handelt, macht
    den Trade zu — und startet die Bruecke erst danach. `positions_get()` gibt
    dann nichts her, die Position existiert nicht mehr. Ohne diese Funktion
    faende der Trade nie den Weg ins Journal, und zwar lautlos.

    Der Stop kommt aus dem EROEFFNUNGS-AUFTRAG. Hat Kerim ihn erst nach dem
    Einstieg gesetzt oder nachgezogen, steht dort 0 — dann ersatzweise der
    aelteste Auftrag dieser Position mit einem Stop. Laesst sich gar keiner
    finden, bleibt er None und das R wird 0: "nicht messbar" statt geraten.
    """
    von = datetime.now() - timedelta(days=tage)
    bis = datetime.now() + timedelta(days=1)
    deals = mt5.history_deals_get(von, bis) or []

    offene = {int(p.ticket) for p in (mt5.positions_get() or [])}
    positionen: list[Position] = []
    roh_namen: dict[int, str] = {}

    nach_position: dict[int, list] = {}
    for d in deals:
        pid = int(getattr(d, "position_id", 0))
        if pid and pid not in offene:
            nach_position.setdefault(pid, []).append(d)

    for pid, ds in nach_position.items():
        rein = [d for d in ds if d.entry == mt5.DEAL_ENTRY_IN]
        raus = [d for d in ds if d.entry == mt5.DEAL_ENTRY_OUT]
        if not rein or not raus:
            continue  # angefangen oder beendet ausserhalb des Fensters

        e = min(rein, key=lambda d: d.time)
        roh_namen[pid] = str(e.symbol)

        # Der Stop, in dieser Reihenfolge:
        #
        #   1. aus dem Eroeffnungsauftrag. Wer den Stop mit der Order setzt —
        #      und so handelt Kerim — hat ihn hier, exakt und immer.
        #   2. aus irgendeinem spaeteren Auftrag der Position, falls 1 leer ist.
        #   3. aus dem STOP-LOSS-ABSCHLUSS selbst: wurde die Position vom Stop
        #      geschlossen, IST der Ausstiegspreis der Stop. Das ist kein
        #      Schaetzwert, sondern dieselbe Zahl von der anderen Seite — und
        #      es rettet genau die Faelle, die fuer die Statistik am meisten
        #      zaehlen, naemlich die Verlierer.
        stop = ziel = None
        for o in sorted(mt5.history_orders_get(position=pid) or [],
                        key=lambda o: o.time_setup):
            if stop is None and getattr(o, "sl", 0):
                stop = float(o.sl)
            if ziel is None and getattr(o, "tp", 0):
                ziel = float(o.tp)

        if stop is None:
            vom_stop = [d for d in raus
                        if getattr(d, "reason", None) == mt5.DEAL_REASON_SL]
            if vom_stop:
                stop = float(min(vom_stop, key=lambda d: d.time).price)

        positionen.append(Position(
            ticket=pid,
            symbol=normalisiere_symbol(str(e.symbol)),
            seite="long" if e.type == mt5.DEAL_TYPE_BUY else "short",
            volumen=float(sum(d.volume for d in rein)),
            eroeffnet=datetime.fromtimestamp(e.time, tz=timezone.utc).replace(tzinfo=None),
            einstieg=float(e.price),
            stop=stop, ziel=ziel,
        ))

    return positionen, roh_namen


def hole_abschluesse(mt5, tickets: list[int]) -> list[Abschluss]:
    """Netto-Ergebnis je geschlossener Position: Gewinn + Kommission + Swap.

    Brutto waere geschoent — die Kommission ist bei zwei Positionen je Setup
    doppelt da und faellt bei kleinen Gewinnen ins Gewicht.
    """
    von = datetime.now() - timedelta(days=HISTORIE_TAGE)
    bis = datetime.now() + timedelta(days=1)
    fertig: list[Abschluss] = []

    for ticket in tickets:
        deals = mt5.history_deals_get(position=ticket) or []
        if not deals:
            deals = [d for d in (mt5.history_deals_get(von, bis) or [])
                     if int(getattr(d, "position_id", 0)) == ticket]
        raus = [d for d in deals if d.entry == mt5.DEAL_ENTRY_OUT]
        if not raus:
            continue  # noch offen oder die Historie reicht nicht zurueck

        netto = sum(float(d.profit) + float(d.commission) + float(d.swap) for d in deals)
        volumen = sum(float(d.volume) for d in raus) or 1.0
        preis = sum(float(d.price) * float(d.volume) for d in raus) / volumen
        zuletzt = max(int(d.time) for d in raus)
        fertig.append(Abschluss(
            ticket=ticket, gewinn=round(netto, 2), ausstieg=round(preis, 5),
            geschlossen=datetime.fromtimestamp(zuletzt, tz=timezone.utc).replace(tzinfo=None),
        ))
    return fertig


# ----------------------------------------------------------------- Supabase

def _db():
    try:
        from supabase import ClientOptions, create_client  # type: ignore
    except ImportError:
        _abbruch("\nDas Paket supabase fehlt oder ist zu alt:  pip install -U supabase\n")
    # Seit 28.09.2026: Kompass-Projekt, Schema "trading". Ohne Variable
    # bleibt es bei public (alte Datenbank).
    schema = os.environ.get("TRADING_SUPABASE_SCHEMA", "").strip() or "public"
    return create_client(_fehlt("TRADING_SUPABASE_URL"),
                         _fehlt("TRADING_SUPABASE_SERVICE_ROLE_KEY"),
                         options=ClientOptions(schema=schema))


def unveraendert(z: dict) -> bool:
    """True, wenn diese Zeile schon genau so geschrieben wurde.

    Ohne das schreibt die Bruecke alle 30 Sekunden dieselben Werte in die
    Datenbank und dieselbe Zeile ins Log. Nach einem Tag stehen dort 2800
    identische Meldungen, und der eine Eintrag, auf den es ankommt — der
    geschlossene Trade — geht darin unter. Ein Log, das man nicht liest, ist
    kein Log.
    """
    key = z["mt5_setup_key"]
    fingerabdruck = json.dumps(z, sort_keys=True, default=str)
    if zuletzt.get(key) == fingerabdruck:
        return True
    zuletzt[key] = fingerabdruck
    return False


def schreibe(db, z: dict, trocken: bool) -> str:
    """Anlegen oder aktualisieren, erkannt am mt5_setup_key.

    Zwei Schritte statt eines Upserts, weil ein Upsert die von Kerim von Hand
    ergaenzten Felder (These, Setup-Haken, Notizen) ueberschreiben wuerde. Die
    Bruecke fasst nur ihre eigenen Spalten an.
    """
    key = z["mt5_setup_key"]
    if trocken:
        return f"[trocken] {key}: {z['status']} {z.get('result') or ''} {z.get('r_multiple')}R"

    da = db.table(TABELLE).select("id, status").eq("mt5_setup_key", key).limit(1).execute()
    if da.data:
        if da.data[0].get("status") == "closed":
            return ""  # fertig ist fertig — nichts mehr anfassen
        db.table(TABELLE).update(z).eq("id", da.data[0]["id"]).execute()
        return f"aktualisiert {key}: {z['status']} {z.get('result') or ''}"

    db.table(TABELLE).insert(z).execute()
    return f"angelegt {key}: {z['status']}"


# --------------------------------------------------------------- Durchgang

def durchgang(mt5, db, user_id: str, trocken: bool) -> list[str]:
    """Ein Takt. Merkt sich Stops im Gedaechtnis des Prozesses.

    Warum das Gedaechtnis noetig ist: zieht Kerim die zweite Position auf
    Break-even, meldet MT5 dort den NEUEN Stop. Wer damit rechnet, bekommt
    Risiko 0 und ein unendliches R. Also gilt der zuerst gesehene Stop.
    """
    # Kontostand JETZT, nicht beim Einstieg — MT5 gibt den historischen nicht
    # her. Bei einem Konto, das sich in einem Trade kaum bewegt, ist das nah
    # genug; bei einer langen Serie wandert der Bezugswert mit. Beides ist
    # besser als gar kein Prozentwert, und es steht hier, damit niemand
    # spaeter glaubt, es waere der Stand bei Eroeffnung.
    konto = mt5.account_info()
    kontostand = float(konto.balance) if konto else None
    positionen, roh_namen = hole_positionen(mt5)
    namen.update(roh_namen)
    for p in positionen:
        merker.setdefault(p.ticket, p.stop)
        p.stop = merker[p.ticket]

    # Was zwischendurch lief und schon zu ist, aus der Historie dazuholen.
    # Wichtig auch fuer den halben Fall: die erste Position ging waehrend eines
    # Neustarts raus, die zweite laeuft noch. Ohne die Historie fehlte die
    # erste Haelfte des Setups und der Trade waere falsch gerechnet.
    geschlossen, roh_alt = hole_geschlossene(mt5)
    namen.update(roh_alt)
    for p in geschlossen:
        # Ein bereits gesehener Stop schlaegt den aus der Historie: er stammt
        # aus der Zeit VOR dem Nachziehen.
        p.stop = merker.get(p.ticket, p.stop)
        merker.setdefault(p.ticket, p.stop)

    offene_tickets = {p.ticket for p in positionen}
    alle = positionen + [p for p in geschlossen if p.ticket not in offene_tickets]

    setups: dict[str, Setup] = {schluessel(s): s for s in gruppiere(alle)}

    # Setups, deren Positionen alle verschwunden sind: aus dem Gedaechtnis
    # rekonstruieren, sonst fehlt der Abschluss.
    for key, s in list(bekannt.items()):
        if key not in setups:
            setups[key] = s

    meldungen: list[str] = []
    for key, s in setups.items():
        bekannt[key] = s
        werte = {
            p.ticket: wert_je_punkt(mt5, p, namen.get(p.ticket, p.symbol))
            for p in s.positionen
        }
        zu = [t for t in s.tickets if t not in offene_tickets]
        z = zeile(s, hole_abschluesse(mt5, zu), user_id, werte, kontostand)
        if unveraendert(z):
            continue
        m = schreibe(db, z, trocken)
        if m:
            meldungen.append(m)
        if z["status"] == "closed":
            bekannt.pop(key, None)
            zuletzt.pop(key, None)
            for t in s.tickets:
                merker.pop(t, None)
                namen.pop(t, None)
    return meldungen


merker: dict[int, float | None] = {}
bekannt: dict[str, Setup] = {}
# Broker-Name je Ticket. Bleibt auch stehen, wenn die Position schon zu ist —
# `order_calc_profit` braucht ihn dann noch fuers Risiko.
namen: dict[int, str] = {}
# Fingerabdruck der zuletzt geschriebenen Zeile je Setup — gegen 2800
# identische Meldungen am Tag.
zuletzt: dict[str, str] = {}


def main() -> None:
    p = argparse.ArgumentParser(description="MT5 -> Journal")
    p.add_argument("--einmal", action="store_true", help="ein Durchgang, dann Schluss")
    p.add_argument("--trocken", action="store_true", help="nichts schreiben, nur zeigen")
    args = p.parse_args()

    _lade_env()
    user_id = _fehlt("TRADING_USER_ID")
    mt5 = _mt5()
    db = None if args.trocken else _db()

    konto = mt5.account_info()
    if konto:
        melde(f"Verbunden: {konto.login} bei {konto.server}, "
              f"{konto.balance:.2f} {konto.currency}")
    else:
        melde("Verbunden, aber account_info() ist leer — ist ein Konto angemeldet?")

    letztes_lebenszeichen = time.time()
    try:
        while True:
            try:
                for m in durchgang(mt5, db, user_id, args.trocken):
                    melde(m)
                # Einmal pro Stunde eine Zeile, auch wenn nichts passiert ist.
                # Ein stilles Log sieht sonst genauso aus wie ein abgestuerztes
                # Programm — und genau das will man unterscheiden koennen.
                if time.time() - letztes_lebenszeichen > 3600:
                    letztes_lebenszeichen = time.time()
                    melde(f"laeuft, {len(bekannt)} Setup(s) beobachtet")
            except Exception as e:  # ein Fehler darf den Dauerlauf nicht beenden
                melde(f"Fehler: {e}")
            if args.einmal:
                break
            time.sleep(TAKT_SEKUNDEN)
    except KeyboardInterrupt:
        # Strg+C ist die vorgesehene Art, den Dauerlauf zu beenden — kein
        # Fehler. Ohne diesen Zweig druckt Python einen Traceback, und der
        # sieht nach Absturz aus, obwohl alles richtig gelaufen ist.
        melde("Mit Strg+C beendet.")
    finally:
        melde("Bruecke beendet.")
        mt5.shutdown()


if __name__ == "__main__":
    main()
