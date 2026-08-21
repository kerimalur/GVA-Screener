# MT5-Brücke — Vantage-Trades ins Journal

Kerim eröffnet je Setup **zwei Positionen**: die erste geht am ersten Ziel raus,
die zweite am vollen. Im Journal ist das **ein** Trade. Genau das macht diese
Brücke — sie gruppiert die Positionen wieder zusammen, legt beim Eröffnen einen
offenen Eintrag an und schliesst ihn, wenn **beide** Positionen zu sind.

Ohne diese Gruppierung stünden zwei Trades im Journal statt einem: die
Trefferquote verdoppelte sich und das durchschnittliche R halbierte sich. Die
Auswertung wäre systematisch falsch, ohne dass man es der Zahl ansieht.

## Warum lokal und nicht in der Cloud

Vantage hat für Privatkunden **keine offene API** — „Vantage Connect / API
Solutions" ist ein institutionelles Angebot. Der einzige Weg führt über das
MT5-Terminal, und das Paket `MetaTrader5` spricht mit dem **lokal
installierten** Terminal: Windows, 64-bit Python, Terminal offen.

Ist der Rechner aus, wird nichts geschrieben. Beim nächsten Start holt die
Brücke aus der Historie nach, was sie verpasst hat — bis 30 Tage zurück.

Die Brücke **liest nur**. Sie erteilt, ändert und schliesst keine Aufträge.

## Einrichten

```
pip install -r requirements.txt
copy .env.beispiel .env      # dann ausfüllen, Werte aus Kompass/.env.local
```

Dann `migration.sql` einmal im Supabase-SQL-Editor des Trading-Projekts
ausführen — sie legt `mt5_setup_key` und `mt5_tickets` an.

## Laufen lassen

```
python bruecke.py --trocken --einmal   # rechnet und zeigt, schreibt NICHTS
python bruecke.py --einmal             # ein Durchgang, schreibt
python bruecke.py                      # Dauerlauf, alle 30 s
```

**Immer erst `--trocken --einmal`.** Der Durchgang zeigt, welche Setups erkannt
wurden und mit welchem R — falsch gruppiert sieht man dort sofort, und es steht
noch nichts in der Datenbank.

## Die Falle, die eingebaut ist

Zieht Kerim die zweite Position auf Break-even, meldet MT5 dort den **neuen**
Stop. Wer damit rechnet, bekommt Risiko 0 und ein unendliches R. Die Brücke
merkt sich deshalb den **zuerst gesehenen** Stop je Ticket und rechnet immer mit
dem. Das ist der Grund, warum sie einen Dauerlauf braucht und nicht einmal
täglich laufen kann: den ursprünglichen Stop sieht nur, wer früh genug hinsieht.

Läuft sie doch mal nicht von Anfang an mit, steht im Journal ein R von 0 statt
einer erfundenen Zahl. `r_multiple = 0` heisst hier „nicht messbar".

## Broker-Zusatz am Symbol

Vantage meldet `EURCHF+`, nicht `EURCHF`. Journal, Screener und Confluence
kennen nur `EURCHF` — mit dem Zusatz wäre der Trade zwar in der Datenbank, aber
für jeden Filter, jedes Ranking und jede Saison-Auswertung unsichtbar. Das ist
schlimmer, als wenn er fehlte: man sieht die Lücke nicht.

Die Brücke schneidet ihn deshalb ab (`normalisiere_symbol`): es gilt der
führende Lauf aus Grossbuchstaben, das erwischt `+`, `.r`, `m`, `#`, `-ECN`,
`_raw` und Ziffern gleichermassen. Nach aussen — bei jedem MT5-Aufruf — wird
weiter der **echte** Name benutzt, sonst kennt das Terminal das Instrument
nicht und liefert kein Risiko.

## Was die Brücke nicht weiss

Deine These, den GVA-Grund, den Screenshot. Das Terminal kennt nur Preise. Der
Eintrag entsteht als Rohling — These, Setup-Haken und Notizen ergänzt du im
Journal. Die Brücke fasst diese Felder nie an: sie aktualisiert nur ihre eigenen
Spalten und rührt einen bereits geschlossenen Trade gar nicht mehr an.

## Backtest bleibt unberührt

Jede Zeile bekommt `session_type = "live"`. Der Backtest hat damit nichts zu tun.

## Prüfen

```
cd "C:\Projekte\Claude Cowork\GVA-Screener\mt5-bruecke"
python -m pytest -q
```

40 Kontrollwerte, ohne Terminal und ohne Datenbank lauffähig — die Rechnung
steckt in `gruppierung.py` und ist bewusst von MT5 und Supabase getrennt.
