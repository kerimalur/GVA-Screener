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

### Dauerbetrieb (empfohlen)

```powershell
powershell -ExecutionPolicy Bypass -File .\einrichten-aufgabe.ps1
```

Legt eine geplante Aufgabe an: Start bei der Anmeldung **und** alle fuenf
Minuten die Frage, ob sie noch laeuft. Laeuft sie, passiert nichts
(`MultipleInstances IgnoreNew`).

Das ersetzt die Startordner-Verknuepfung — die wird dabei entfernt, sonst
liefe die Bruecke doppelt und zwei Instanzen schrieben in dieselbe Tabelle.

Der Unterschied ist nicht kosmetisch: der Startordner startet **einmal** bei
der Anmeldung. Stuerzt die Bruecke ab oder wird MetaTrader neu gestartet,
kommt sie bis zur naechsten Anmeldung nicht wieder — und genau dann fehlt der
Stop, den sie haette sehen muessen.
```

**Immer erst `--trocken --einmal`.** Der Durchgang zeigt, welche Setups erkannt
wurden und mit welchem R — falsch gruppiert sieht man dort sofort, und es steht
noch nichts in der Datenbank.

## Muss ein Fenster offen bleiben?

Nein. Drei Stufen, in dieser Reihenfolge einführen:

1. **PowerShell offen** (`python bruecke.py`) — nur zum Ausprobieren.
2. **Ohne Fenster:** Doppelklick auf `starte-versteckt.vbs`. Dieselbe Brücke
   mit `pythonw.exe`, also ohne Konsole. Beenden über Task-Manager → Details →
   `pythonw.exe`.
3. **Autostart, der Normalzustand:** Doppelklick auf `einrichten-autostart.bat`.
   Legt eine Verknüpfung in den Autostart-Ordner; ab der nächsten Anmeldung
   läuft die Brücke von selbst, unsichtbar. Rückgängig: Win+R, `shell:startup`,
   `GVA MT5-Bruecke.lnk` löschen.

**MT5 muss mitstarten**, sonst hat die Brücke nichts zu lesen. In MT5 unter
Extras → Optionen → Server „Kontoinformationen speichern" ankreuzen und eine
Verknüpfung auf MetaTrader 5 ebenfalls nach `shell:startup` legen. Dann hängt
die ganze Kette an der Windows-Anmeldung und an sonst nichts.

**Jede Meldung geht immer auch in `lauf.log`**, im selben Ordner. Das ist bei
Stufe 2 und 3 die einzige Spur, deshalb schreibt die Brücke sie auch dann, wenn
ein Fenster da ist. Ab 2 MB wird einmal nach `lauf.log.alt` umbenannt statt
endlos angehängt.

**Was trotzdem laufen muss: das MT5-Terminal.** Ohne das gibt es nichts zu
lesen — die Brücke redet mit dem Terminal, nicht mit Vantage. Der Rechner muss
also ohnehin an und angemeldet sein; die Brücke ist nur das kleinere der beiden
Programme.

## Rechner eine Woche aus — was passiert dann?

Beim nächsten Start liest die Brücke **beides**: die offenen Positionen und die
Historie der letzten 30 Tage (`hole_geschlossene`). Drei Fälle:

| Was in der Zwischenzeit passierte | Kommt ins Journal | R |
|---|---|---|
| Trade eröffnet, läuft noch | ja | ungenau, wenn ein Stop inzwischen nachgezogen wurde |
| Trade eröffnet **und** geschlossen | ja, aus der Historie | nur wenn der Stop beim Einstieg gesetzt war |
| erste Position raus, zweite läuft noch | ja, als **ein** Setup | wie oben |

Der Stop kommt bei rekonstruierten Trades aus dem **Eröffnungsauftrag**. War er
dort gesetzt, stimmt das R. Hat Kerim ihn erst danach gesetzt oder nachgezogen,
lässt sich der ursprüngliche Wert nicht mehr rekonstruieren — dann steht
`r_multiple = 0`, also „nicht messbar". Keine geratene 1.

Deshalb bleibt der Dauerlauf der bessere Weg: nur wer von Anfang an mitliest,
sieht den echten Stop.

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
