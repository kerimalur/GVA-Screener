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
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from gruppierung import Abschluss, Position, Setup, gruppiere, schluessel, zeile

TAKT_SEKUNDEN = 30
# Wie weit zurueck die Historie geholt wird. Grosszuegig, weil der Abruf billig
# ist und ein zu kurzes Fenster nach einem Wochenende Trades verschluckt.
HISTORIE_TAGE = 30
TABELLE = "trades"


def _fehlt(name: str) -> str:
    wert = os.environ.get(name, "").strip()
    if not wert:
        sys.exit(
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
        sys.exit(
            "\nDas Paket MetaTrader5 fehlt oder passt nicht.\n"
            "  pip install MetaTrader5\n"
            "Es gibt es nur fuer Windows und nur fuer 64-bit-Python. Pruefen mit:\n"
            '  python -c "import platform; print(platform.architecture())"\n'
        )
    if not mt5.initialize():
        sys.exit(f"MT5 antwortet nicht: {mt5.last_error()}. Laeuft das Terminal?")
    return mt5


def hole_positionen(mt5) -> list[Position]:
    roh = mt5.positions_get() or []
    return [
        Position(
            ticket=int(p.ticket), symbol=str(p.symbol),
            seite="long" if p.type == mt5.POSITION_TYPE_BUY else "short",
            volumen=float(p.volume),
            eroeffnet=datetime.fromtimestamp(p.time, tz=timezone.utc).replace(tzinfo=None),
            einstieg=float(p.price_open),
            stop=float(p.sl) if p.sl else None,
            ziel=float(p.tp) if p.tp else None,
        )
        for p in roh
    ]


def wert_je_punkt(mt5, position: Position) -> float:
    """Was eine Preisbewegung von 1.0 bei diesem Volumen in Kontowaehrung wert ist.

    Ueber `order_calc_profit` statt ueber Kontraktgroesse und Tickwert von Hand:
    das Terminal kennt Kontraktgroesse, Kontowaehrung und Umrechnung. Selbst
    gerechnet stimmt es fuer EURUSD und faellt bei JPY- oder Cross-Paaren um.
    """
    art = mt5.ORDER_TYPE_BUY if position.seite == "long" else mt5.ORDER_TYPE_SELL
    p = position.einstieg
    gewinn = mt5.order_calc_profit(art, position.symbol, position.volumen, p, p + 1.0)
    if gewinn is None:
        return 0.0
    return abs(float(gewinn))


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
        from supabase import create_client  # type: ignore
    except ImportError:
        sys.exit("\nDas Paket supabase fehlt:  pip install supabase\n")
    return create_client(_fehlt("TRADING_SUPABASE_URL"),
                         _fehlt("TRADING_SUPABASE_SERVICE_ROLE_KEY"))


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
    positionen = hole_positionen(mt5)
    for p in positionen:
        merker.setdefault(p.ticket, p.stop)
        p.stop = merker[p.ticket]

    setups: dict[str, Setup] = {schluessel(s): s for s in gruppiere(positionen)}

    # Setups, deren Positionen alle verschwunden sind: aus dem Gedaechtnis
    # rekonstruieren, sonst fehlt der Abschluss.
    for key, s in list(bekannt.items()):
        if key not in setups:
            setups[key] = s

    meldungen: list[str] = []
    for key, s in setups.items():
        bekannt[key] = s
        werte = {p.ticket: wert_je_punkt(mt5, p) for p in s.positionen}
        offene = {p.ticket for p in positionen}
        zu = [t for t in s.tickets if t not in offene]
        z = zeile(s, hole_abschluesse(mt5, zu), user_id, werte)
        m = schreibe(db, z, trocken)
        if m:
            meldungen.append(m)
        if z["status"] == "closed":
            bekannt.pop(key, None)
            for t in s.tickets:
                merker.pop(t, None)
    return meldungen


merker: dict[int, float | None] = {}
bekannt: dict[str, Setup] = {}


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
        print(f"Verbunden: {konto.login} bei {konto.server}, "
              f"{konto.balance:.2f} {konto.currency}")

    try:
        while True:
            try:
                for m in durchgang(mt5, db, user_id, args.trocken):
                    print(f"{datetime.now():%H:%M:%S}  {m}")
            except Exception as e:  # ein Fehler darf den Dauerlauf nicht beenden
                print(f"{datetime.now():%H:%M:%S}  Fehler: {e}")
            if args.einmal:
                break
            time.sleep(TAKT_SEKUNDEN)
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
