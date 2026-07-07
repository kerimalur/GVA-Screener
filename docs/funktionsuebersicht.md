# GVA-Screener – Funktionsübersicht (laienverständlich)

Diese Doku erklärt jeden Bereich des Terminals so, dass auch jemand ohne Trading-Vorwissen versteht: was er sieht, was es bedeutet, wie die Zahl zustande kommt. Gedacht für Nutzer-Anleitung UND als Grundlage für eine Verkaufs-/Produktbeschreibung.

---

## Glossar – die wichtigsten Begriffe (einmal vorab erklärt)

Diese Begriffe tauchen in mehreren Bereichen wieder auf. Wer sie einmal verstanden hat, versteht die ganze Software.

| Begriff | Erklärung |
|---|---|
| **Long / Short** | Long = du setzt auf steigenden Preis (kaufen, später teurer verkaufen). Short = du setzt auf fallenden Preis (zuerst "leihweise" verkaufen, später billiger zurückkaufen). |
| **Pip / Lot** | Pip = kleinste Preisbewegung (bei EUR/USD z.B. von 1,0850 auf 1,0851 = 1 Pip). Lot = Handelsmenge: 1 Lot = 100.000 Einheiten der Währung, 0,1 Lot = 10.000, 0,01 Lot = 1.000. |
| **Stop-Loss / Take-Profit** | Stop-Loss = Preis, bei dem automatisch ausgestiegen wird, um den Verlust zu begrenzen. Take-Profit = Preis, bei dem automatisch ausgestiegen wird, um den Gewinn zu sichern. |
| **R / R-Multiple** | R = der Betrag, den man bei einem Trade riskiert (z.B. 100 €). "+2R" heisst: doppeltes Risiko gewonnen (+200 €). "−1R" heisst: genau das Risiko verloren. So sind Trades vergleichbar, egal wie gross das Konto ist. |
| **Basispunkte (bps)** | 1 bps = 0,01 Prozent. 100 bps = 1 Prozent. Fachleute nutzen bps bei Zinsen, weil "0,25 %" leicht mit "0,25 Prozentpunkte" verwechselt wird. |
| **Leitzins** | Der Zinssatz, den eine Zentralbank (z.B. US-Notenbank Fed, Europäische Zentralbank EZB) festlegt. Höherer Leitzins macht eine Währung für Anleger meist attraktiver/stärker. |
| **Hawkish / Dovish** | Hawkish = Zentralbank tendiert zu höheren Zinsen (stärkt die Währung tendenziell). Dovish = tendiert zu niedrigeren Zinsen (schwächt die Währung tendenziell). |
| **COT-Report** | Wöchentlicher Bericht der US-Aufsichtsbehörde CFTC: zeigt, wie viele Terminkontrakte (Wetten auf zukünftige Kurse) grosse Marktteilnehmer gerade auf steigende oder fallende Kurse laufen haben. Zeigt, wie "das grosse Geld" positioniert ist. |
| **Non-Commercials / Commercials** | Non-Commercials = grosse Spekulanten (Hedgefonds), die auf Kursbewegung wetten. Commercials = Firmen, die sich gegen Preisschwankungen absichern (z.B. ein Ölkonzern gegen fallende Ölpreise). Beide werden im COT-Report getrennt ausgewiesen. |
| **Open Interest (OI)** | Gesamtzahl aller offenen (noch nicht geschlossenen) Terminkontrakte an einem Markt. Macht Positionsgrössen über verschieden grosse Märkte hinweg vergleichbar. |
| **Perzentil** | Zeigt, wo ein aktueller Wert im Vergleich zur Vergangenheit steht. Perzentil 90 = aktueller Wert ist höher als 90 % aller Werte der letzten Jahre → sehr hoch/extrem. Perzentil 10 = sehr niedrig/extrem. |
| **Korrelation** | Zeigt, ob sich zwei Dinge gleich oder gegenläufig bewegen. +1 = bewegen sich exakt gleich. −1 = bewegen sich exakt gegensätzlich. 0 = kein erkennbarer Zusammenhang. |
| **Retail-Sentiment** | Zeigt, wie Kleinanleger ("Retail") gerade positioniert sind. Wird oft als Gegen-Indikator genutzt: liegt die Mehrheit der Kleinanleger auf einer Seite, liegt sie erfahrungsgemäss oft falsch. |
| **Win-Rate** | Prozentsatz der gewonnenen Trades. Muss nicht über 50 % liegen, um profitabel zu sein — entscheidend ist, ob Gewinne im Schnitt grösser sind als Verluste. |
| **Profit-Faktor** | Gesamtgewinn geteilt durch Gesamtverlust. Über 1,0 = insgesamt profitabel. Über 2,0 = sehr gut. |
| **Drawdown** | Rückgang des Kontostands vom bisherigen Höchststand aus. Zeigt, wie schmerzhaft die schlechteste Phase bisher war. |
| **Expectancy** | Erwarteter Durchschnittsgewinn pro Trade in R. Positiv = das System verdient langfristig Geld, egal wie viele Trades gemacht werden. |

---

## 1. Dashboard

Startseite mit 5 Übersichts-Kacheln: Currency Strength Index, Risk-On/Risk-Off-Anzeige, Pair Screener, Zentralbank-Spektrum, COT-Schnellübersicht.

### Currency Strength Index (Währungsstärke-Anzeige)

**Was man sieht:** Balken-Ranking der 8 wichtigsten Währungen (USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD) — grün = stark, rot = schwach. Daneben eine Farbtabelle (Heatmap), die zeigt wie stark jede Währung über 1 Woche, 1 Monat oder 3 Monate war.

**Was das bedeutet:** Man handelt immer ein Paar aus zwei Währungen (z.B. EUR gegen USD). Dieses Werkzeug zeigt, welche der 8 Währungen zuletzt am meisten "Kraft" hatte. Faustregel: eine starke Währung mit einer schwachen kombinieren ergibt oft einen aussichtsreicheren Trade als zwei mittelmässige zusammen. Vergleicht man 1-Woche mit 3-Monaten, sieht man ausserdem ob ein Trend noch anhält oder gerade dreht.

**Wie es berechnet wird:** Aus den Kursen aller 28 möglichen Währungspaare wird für jede Einzelwährung der durchschnittliche Kursgewinn/-verlust errechnet (steigt eine Währung gegen die meisten anderen, gilt sie als "stark"). Datenquelle: tägliche Schlusskurse, 10 Monate Historie. Aktualisierung: täglich nach Börsenschluss.

### Risk-On / Risk-Off-Anzeige

**Was man sieht:** Ein Tacho (wie ein Drehzahlmesser) zwischen "Risk-Off" und "Risk-On" plus vier kleine Unter-Anzeigen: VIX (Angst-Index der Börse), Gold-Trend, JPY/CHF-Bewegung (typische "Fluchtwährungen"), S&P-500-Trend (US-Aktienmarkt).

**Was das bedeutet:** "Risk-On" heisst: Anleger sind risikofreudig, kaufen Aktien und Rohstoffe, verkaufen sichere Häfen. "Risk-Off" heisst: Anleger flüchten in Sicherheit (Gold, Schweizer Franken, japanischer Yen), Aktien fallen. Für einen Trader ist das wichtig, weil bestimmte Währungen bei Risk-Off automatisch gesucht sind (JPY, CHF) und andere bei Risk-On profitieren (AUD, NZD). Wer weiss, in welchem "Modus" der Markt gerade ist, versteht besser, warum sich bestimmte Paare gerade so bewegen.

**Wie es berechnet wird:** Vier Zutaten werden zusammengerechnet und gewichtet: der VIX (Volatilitäts-Index, misst Nervosität am US-Aktienmarkt — je höher, desto ängstlicher der Markt) mit 30 % Gewicht, der Goldpreis-Trend mit 20 %, die Stärke von JPY+CHF mit 25 %, der S&P-500-Trend mit 25 %. Alle vier werden auf eine Skala von 0–100 gebracht, dann gemittelt. Ab 60 gilt "Risk-On", unter 40 "Risk-Off", dazwischen neutral. Aktualisierung: täglich.

### Pair Screener (automatische Trade-Ideen)

**Was man sieht:** Eine Liste von Währungspaaren mit einer Empfehlung LONG (grün) oder SHORT (rot) — nur wenn mindestens 2 von 5 unabhängigen Kriterien in die gleiche Richtung zeigen. Ein Klick zeigt die einzelnen Gründe.

**Was das bedeutet:** Das ist eine automatische Vorauswahl möglicher Trades, basierend auf mehreren voneinander unabhängigen Datenquellen (nicht nur Chart-Optik). Je mehr der 5 Kriterien übereinstimmen, desto überzeugender das Signal. Ein Trader nutzt das als Startpunkt — nicht als "kaufen ohne nachzudenken"-Knopf, sondern um schnell zu sehen, wo gerade mehrere Faktoren zusammenspielen.

**Wie es berechnet wird:** 5 Kriterien pro Paar, jedes liefert LONG, SHORT oder kein Signal:
1. **Zinsdifferenz** — welche der beiden Währungen hat den höheren Leitzins bzw. eine steigende Zinstendenz (mehr dazu im Abschnitt "Makro & Zinsen").
2. **COT-Flow** — bauen grosse Spekulanten (siehe COT-Report im Glossar) gerade eine Long- oder Short-Position auf.
3. **Saisonalität** — war dieser Monat in den letzten Jahren historisch eher positiv oder negativ für dieses Paar (siehe Abschnitt Saisonalität).
4. **Zins-Trend über 3 Monate** — verändert sich der Zinsunterschied gerade zugunsten einer der beiden Währungen.
5. **Retail-Sentiment** — sind Kleinanleger einseitig positioniert (Gegen-Indikator, siehe Glossar).
Regel: mindestens 2 Kriterien müssen übereinstimmen, sonst gibt es kein Signal. Aktualisierung: täglich.

### Zentralbank-Spektrum

**Was man sieht:** 8 Notenbanken (Fed, EZB, BoE, BoJ, SNB, RBNZ, RBA, BoC) als horizontale Balken zwischen "dovish" (blau, zinssenkend) und "hawkish" (grün, zinserhöhend/-haltend).

**Was das bedeutet:** Zentralbanken entscheiden über die Leitzinsen (siehe Glossar). Eine "hawkish" Notenbank stärkt tendenziell ihre Währung, eine "dovish" schwächt sie. Diese Übersicht zeigt auf einen Blick, welche Notenbanken gerade in welche Richtung tendieren — wichtig, weil Zinserwartungen einer der stärksten Treiber für Währungskurse sind.

**Wie es berechnet wird:** Ein Score von −10 (sehr dovish) bis +10 (sehr hawkish) je Notenbank, zusammengesetzt aus 60 % einer redaktionell gepflegten Einschätzung und 40 % der tatsächlichen Zinsentwicklung der letzten 6 Monate. Aktualisierung: täglich, redaktionell nachjustierbar.

### COT-Schnellübersicht

**Was man sieht:** 8 Währungen mit einer Zahl von 0–100 ("Perzentil", siehe Glossar) und Ampel-Label: "Extrem-Long" (grün, ≥90), "Extrem-Short" (rot, ≤10), sonst neutral.

**Was das bedeutet:** Zeigt, wie extrem "das grosse Geld" (siehe COT-Report im Glossar) gerade in einer Währung positioniert ist, verglichen mit den letzten 5 Jahren. Ein Extremwert kann zweierlei bedeuten: entweder ein starker, anhaltender Trend — oder ein überkaufter/überverkaufter Markt, der bald dreht. Beide Lesarten sind in der Trading-Praxis üblich, deshalb dient dieser Wert eher als Warnhinweis ("hier ist gerade viel Positionierung") als als klares Kaufsignal.

**Wie es berechnet wird:** Aus dem wöchentlichen COT-Report werden die Positionen der Non-Commercials (siehe Glossar) über die letzten 5 Jahre (260 Wochen) verglichen; Perzentil = wie hoch der aktuelle Wert im Vergleich zu allen Werten dieses Zeitraums steht. Aktualisierung: wöchentlich (der COT-Report erscheint freitags).

---

## 2. Weekly Outlook ("Sonntagabend-Cockpit")

Eine Wochenvorbereitung: für jedes Paar eine Karte mit allen wichtigen Infos, sortiert danach wie "heiss"/aussichtsreich das Setup gerade ist.

### BTC-Karte

**Was man sieht:** Eine Karte für Bitcoin mit LONG/SHORT/NEUTRAL-Einschätzung, drei Kennzahlen (Positionsaufbau grosser Fonds über 4 Wochen, Veränderung der US-Realzinsen über 3 Monate, Risk-On/Risk-Off-Wert) und bevorstehenden wichtigen US-Terminen (Zinsentscheid, Inflationsdaten etc.).

**Was das bedeutet:** "Realzins" = Zinssatz minus Inflation — also wie viel eine Anlage nach Abzug der Geldentwertung wirklich einbringt. Sinkt der Realzins, wird Bitcoin (das keine Zinsen zahlt) für Anleger relativ attraktiver. Positionsaufbau grosser Fonds zeigt, ob professionelle Anleger gerade zukaufen oder verkaufen. Zusammen ergibt das eine grobe Wochen-Einschätzung für BTC.

**Wie es berechnet wird:** Positionsdaten aus dem COT-Report (Hedgefonds-Segment), Realzins aus offiziellen US-Wirtschaftsdaten (FRED-Datenbank), Risk-Wert wie im Dashboard. Bevorstehende Termine aus dem Wirtschaftskalender (siehe Abschnitt 8). Aktualisierung: täglich, COT-Daten wöchentlich.

### Paar-Karte (z.B. EUR/USD)

**Was man sieht:** Pro Währungspaar eine Karte mit: Richtungs-Ampel + Punktzahl, institutionelle Positionierung je Währung (mit Info seit wie vielen Wochen in dieselbe Richtung), saisonales Muster des Monats, Retail-Sentiment-Trend, bevorstehende Nachrichten-Termine und Zentralbanksitzungen, sowie eine aufklappbare Liste der einzelnen Signal-Gründe.

**Was das bedeutet:** Das ist ein "Rundum-Dossier" für den Sonntagabend vor Wochenstart: alle wichtigen fundamentalen Fakten zu einem Paar an einem Ort, statt sie einzeln zusammensuchen zu müssen. Die Karten sind nach Punktzahl sortiert, damit die aussichtsreichsten Ideen automatisch oben stehen.

**Wie es berechnet wird:** Punktzahl = 10 Punkte pro übereinstimmendem Kriterium (wie beim Pair Screener) + bis zu 10 Punkte für starke gegenläufige institutionelle Positionierung zwischen den zwei Währungen + 3 Bonuspunkte, wenn gerade ein wichtiger Nachrichten-Termin ansteht. Alle Rohdaten wie im Dashboard/COT-Abschnitt beschrieben. Aktualisierung: täglich, COT wöchentlich.

### "Outlook erstellen"-Button

**Was man sieht:** Ein Button auf jeder Karte.

**Was das bedeutet:** Übernimmt Paar, Richtung und eine vorformulierte Begründung direkt in den Journal-Bereich (Abschnitt 10) — man muss die Analyse nicht nochmal abtippen, wenn man daraus einen geplanten Trade machen will.

---

## 3. COT-Analyse

Vertiefte Auswertung des wöchentlichen COT-Reports (siehe Glossar) — zeigt wie professionelle Grossanleger in Futures-Märkten positioniert sind.

### Positions-Tabelle

**Was man sieht:** Für einen ausgewählten Markt (z.B. Euro-Future): aktuelle Long-/Short-Anzahl von drei Gruppen — Non-Commercials (grosse Spekulanten), Commercials (Absicherer) und Kleinanleger — plus deren Wochenveränderung.

**Was das bedeutet:** Steigt die Netto-Position (Long minus Short) einer Gruppe, bauen sie Positionen auf ("Akkumulation"); fällt sie, bauen sie ab ("Liquidation" / Gewinnmitnahme). Non-Commercials gelten als der wichtigste Trend-Indikator, weil sie reine Wetten auf Kursbewegung eingehen (im Gegensatz zu Commercials, die sich nur absichern).

**Wie es berechnet wird:** Direkt aus dem CFTC-Report übernommen, wöchentlich (Stichtag Dienstag, Veröffentlichung Freitag), Wochenänderung = Differenz zur Vorwoche.

### Extrem-Übersicht

**Was man sieht:** Alle Märkte mit ihrem aktuellen Perzentil (siehe Glossar) und Ampel-Label.

**Was das bedeutet:** Wie in der Dashboard-COT-Kachel, hier für alle Märkte gleichzeitig sichtbar.

### Verlaufs-Chart

**Was man sieht:** Zwei Linien über bis zu 10 Jahre: Positionierung der Non-Commercials und der Commercials, plus als Vergleich der tatsächliche Kursverlauf.

**Was das bedeutet:** Zeigt, ob Positionsänderungen dem Kurs vorauslaufen (frühes Signal) oder eher hinterherhinken (Bestätigung im Nachhinein). Ein Rückgang der Long-Position bei gleichzeitig hohem Kurs deutet oft auf beginnende Gewinnmitnahmen hin.

### Backtest-Panel

**Was man sieht:** Man wählt eine Regel aus (z.B. "immer wenn die Positionierung in den obersten 10 % der letzten 5 Jahre lag"), und die Software zeigt, was historisch danach im Kurs passiert ist — mit einem Klartext-Urteil ("belastbar" / "schwach" / "zu wenig Daten").

**Was das bedeutet:** Ein Backtest testet eine Regel an der Vergangenheit, bevor man ihr in der Zukunft vertraut. Beispiel-Ergebnis: "Nach einem extremen Positionsaufbau lag der Kurs 4 Wochen später im Schnitt 0,82 % höher — das ist 0,35 Prozentpunkte mehr als an einem zufälligen Zeitpunkt." Dieser Unterschied nennt sich "Edge" (Vorteil) — je grösser, desto wertvoller das Signal. Die Software warnt automatisch, wenn zu wenige historische Fälle vorliegen (unter 8), um daraus verlässliche Schlüsse zu ziehen.

**Wie es berechnet wird:** Alle historischen Wochen mit ähnlich extremer Positionierung werden gesucht, dann wird geschaut, wie sich der Kurs 4/8/12 Wochen später im Schnitt entwickelt hat — verglichen mit dem Durchschnitt aller Wochen (nicht nur der extremen).

### Kombinations-Panel (Conditional Outcome)

**Was man sieht:** Eine 4-Felder-Tabelle, die zeigt was passiert, wenn zwei Signale gleichzeitig auftreten (z.B. "Positionsaufbau UND steigender Zinsvorteil" vs. "Positionsaufbau ABER fallender Zinsvorteil").

**Was das bedeutet:** Zwei zusammenpassende Signale (z.B. institutioneller Positionsaufbau UND ein sich verbessernder Zinsvorteil) sind historisch oft aussagekräftiger als ein einzelnes Signal allein. Die Tabelle zeigt konkret, was in der Vergangenheit passierte, wenn beide gleichzeitig zutrafen.

### Markt-Vergleich (Multi-Compare)

**Was man sieht:** Bis zu 4 Märkte gleichzeitig als Perzentil-Linien (0–100) übereinander.

**Was das bedeutet:** Zeigt, ob sich mehrere Märkte gerade gleichzeitig extrem positionieren (z.B. globale Stimmungsänderung) oder ob einer aus der Reihe tanzt (möglicher Frühindikator).

---

## 4. Makro & Zinsen

Vergleicht die wirtschaftliche Lage verschiedener Länder — die Grundlage jeder fundamentalen Währungsanalyse.

### Zinserwartungen-Panel

**Was man sieht:** Eine Kennzahl, die zeigt ob der Markt aktuell eher Zinssenkungen, stabile Zinsen oder Zinserhöhungen in den USA erwartet — plus für jede Notenbank das Datum der nächsten Sitzung und die erwartete Änderung in Basispunkten (siehe Glossar).

**Was das bedeutet:** Finanzmärkte reagieren nicht nur auf das, was eine Notenbank JETZT tut, sondern vor allem auf das, was sie in Zukunft erwarten. Eine Abweichung zwischen "was der Markt erwartet hat" und "was die Notenbank tatsächlich beschliesst" löst meist die grössten Kursbewegungen aus.

**Wie es berechnet wird:** Aus der Rendite kurzlaufender US-Staatsanleihen im Vergleich zum aktuellen Leitzins wird abgeleitet, was der Markt einpreist. Zusätzlich werden bevorstehende Notenbank-Termine und deren erwartete Änderung redaktionell gepflegt. Quelle: US-Wirtschaftsdatenbank FRED. Aktualisierung: täglich (Kurse), manuell (Termine).

### Regionen-Vergleich

**Was man sieht:** Zwei frei wählbare Länder/Währungsräume nebeneinander, verglichen anhand von 7 Kennzahlen: Leitzins, langfristige Anleihe-Rendite, Inflation, Arbeitslosenquote, Wirtschaftswachstum, ein Frühindikator und die Handelsbilanz (Exporte minus Importe).

**Was das bedeutet:** Diese 7 Kennzahlen sind die "Vitalwerte" einer Volkswirtschaft. Ein Land mit höherem Leitzins, niedrigerer Arbeitslosigkeit und stärkerem Wachstum hat tendenziell die stärkere Währung. Der direkte Nebeneinander-Vergleich zeigt sofort, welches der beiden Länder gerade die Nase vorn hat und wo sich das gerade ändert.

**Wie es berechnet wird:** Alle Werte kommen aus der US-Wirtschaftsdatenbank FRED (auch für andere Länder, die dort ebenfalls Daten liefern). Rohdaten wie Inflation und Wachstum werden in Veränderung-zum-Vorjahr umgerechnet, damit sie über Länder hinweg vergleichbar sind. Aktualisierung: monatlich (die meisten Kennzahlen erscheinen nur einmal im Monat), Leitzins täglich.

### Zins-/Renditespread-Chart

**Was man sieht:** Verlauf des Zinsunterschieds (oder Renditeunterschieds) zwischen zwei Ländern über die letzten 5 Jahre für ein beliebiges Währungspaar.

**Was das bedeutet:** Ein grösserer Zinsvorteil zieht tendenziell Kapital an und stärkt eine Währung — dieser Zusammenhang gehört zu den verlässlichsten in der Fundamentalanalyse. Ein Trader beobachtet, ob sich dieser Vorteil gerade ausweitet (Währung sollte weiter stärker werden) oder schrumpft (möglicher Trendwechsel).

---

## 5. Retail Sentiment (Positionierung der Kleinanleger)

### Sentiment-Übersicht (Grid)

**Was man sieht:** Bis zu 28 Paare als kleine Halbkreis-Anzeigen: wie viel Prozent aller Kleinanleger gerade "long" positioniert sind. Farben sind bewusst umgekehrt: viel Long bei Kleinanlegern wird rot markiert, viel Short grün.

**Was das bedeutet:** Studien zeigen, dass Kleinanleger als Gruppe im Durchschnitt öfter falsch liegen als richtig — vor allem an Extrempunkten. Sind z.B. 80 % aller Kleinanleger long in einem Paar, gilt das als Warnsignal für einen möglichen Kursrückgang (weil "alle die kaufen wollten, schon gekauft haben"). Deshalb die umgekehrte Farbgebung: rot bedeutet hier "Vorsicht, Menge ist zu einseitig long", nicht "schlecht für die Währung".

**Wie es berechnet wird:** Datenquelle ist der Anbieter Myfxbook, der die Positionen seiner Nutzer-Community auswertet. Ein Long-Anteil über 70 % oder unter 30 % wird optisch hervorgehoben. Aktualisierung: täglich.

### Sentiment-Verlauf

**Was man sieht:** Verlauf des Long-Anteils über Zeit, mit dem Kurs des Paares überlagert.

**Was das bedeutet:** Zeigt, ob sich Extrempositionen (z.B. 80 % long) historisch schon einmal aufgebaut haben und was danach mit dem Kurs passierte — hilft, das aktuelle Sentiment einzuordnen statt isoliert zu betrachten.

---

## 6. Intermarket (Zusammenhänge zwischen Märkten)

Zeigt, wie verschiedene Märkte (Währungen, Rohstoffe, Aktienindizes) sich gegenseitig beeinflussen oder gemeinsam bewegen.

### Korrelationsmatrix

**Was man sieht:** Eine Farbtabelle mit der Korrelation (siehe Glossar) zwischen den wichtigsten Währungspaaren.

**Was das bedeutet:** Zwei stark korrelierte Paare (z.B. +0,8) bewegen sich fast immer gemeinsam — hält man beide gleichzeitig als offene Position, verdoppelt man im Grunde das Risiko, statt es zu streuen. Negativ korrelierte Paare (z.B. −0,7) bewegen sich gegenläufig und können sich gegenseitig teilweise absichern.

### DXY-Übersicht (Dollar-Index)

**Was man sieht:** Verlauf eines "Dollar-Gesamtwerts" (DXY) — misst den US-Dollar nicht gegen eine, sondern gegen einen Korb aus 6 Währungen gleichzeitig.

**Was das bedeutet:** Steigt der DXY, ist der Dollar insgesamt stark — das drückt meist auf Gold, Rohstoffe und Schwellenländer-Aktien, weil diese oft in Dollar gehandelt werden und bei starkem Dollar relativ teurer für andere Länder werden.

**Wie es berechnet wird:** Nach der offiziellen DXY-Formel: die 6 Komponentenwährungen werden unterschiedlich stark gewichtet (Euro macht mit knapp 58 % den grössten Anteil aus), daraus wird ein gewichteter Durchschnitt gebildet.

### Markt-Overlay

**Was man sieht:** Zwei frei wählbare Instrumente übereinander gelegt (z.B. Goldpreis und australischer Dollar), optional auf denselben Startpunkt normiert, damit man reine Trendbewegungen vergleichen kann statt absolute Preise.

**Was das bedeutet:** Manche Rohstoff-Länder-Währungen (wie AUD) hängen fundamental am Rohstoffpreis (hier Gold) — bricht dieser Zusammenhang plötzlich auseinander, ist das oft ein Hinweis auf einen Sondereffekt, den man näher untersuchen sollte.

### USD-Paare Übersicht

**Was man sieht:** Alle Dollar-Paare mit ihrer Kursveränderung der letzten 30 Tage als Balken.

**Was das bedeutet:** Zeigt auf einen Blick, wie breit ein Dollar-Trend gerade ist (bewegen sich fast alle Paare gleich, ist es ein grosser genereller Dollar-Trend, keine Einzelbewegung).

---

## 7. Saisonalität

Untersucht, ob bestimmte Kalendermonate historisch öfter positiv oder negativ für ein Instrument waren.

### Monats-Heatmap

**Was man sieht:** Eine Farbtabelle: Instrument (Zeile) × Monat (Spalte), Farbe zeigt den historischen Durchschnittsgewinn/-verlust in diesem Monat.

**Was das bedeutet:** Manche Instrumente zeigen wiederkehrende jahreszeitliche Muster (z.B. bedingt durch Ernte-/Heizsaison bei Rohstoffen, oder wiederkehrende Kapitalflüsse bei Aktien und Währungen). Das heisst nicht, dass es dieses Jahr garantiert genauso läuft — es ist ein statistischer Hinweis, keine Prognose.

### Detail-Ansicht

**Was man sieht:** Für ein Instrument: Balken für jeden Monat (Durchschnittsgewinn) plus eine "Trefferquote" (in wie viel Prozent der Jahre dieser Monat positiv war).

**Was das bedeutet:** Ein Monat mit +0,8 % Durchschnitt aber nur 45 % Trefferquote ist unzuverlässig — der Durchschnitt wird von wenigen sehr guten Jahren nach oben gezogen. Ein Monat mit +0,5 % Durchschnitt und 75 % Trefferquote ist deutlich verlässlicher. Die Software warnt zusätzlich, wenn weniger als 8 Jahre Historie vorliegen — dann ist das Muster statistisch noch zu dünn, um sich darauf zu verlassen.

---

## 8. Kalender (Wirtschaftskalender)

**Was man sieht:** Nach Tag sortierte Liste wirtschaftlich wichtiger Termine (z.B. Zinsentscheide, Arbeitsmarktdaten, Inflationszahlen) mit Uhrzeit, betroffener Währung, erwarteter Markt-Wichtigkeit (hoch/mittel/niedrig) und — sobald verfügbar — dem tatsächlichen Wert im Vergleich zur vorherigen Erwartung.

**Was das bedeutet:** Wichtige Wirtschaftsdaten können Kurse innerhalb von Sekunden stark bewegen. Weicht der tatsächliche Wert stark von dem ab, was vorher erwartet wurde, entstehen oft die grössten und schnellsten Kursbewegungen des Tages. Wer weiss, wann solche Termine anstehen, kann sich entsprechend vorbereiten oder zumindest wissen, warum sich ein Kurs plötzlich stark bewegt.

**Wie es berechnet wird:** Daten vom spezialisierten Anbieter ForexFactory, täglich automatisch aktualisiert.

---

## 9. Vergleich

**Was man sieht:** Zwei frei wählbare Datenreihen (Kurs, COT-Positionierung, Zinsunterschied, Retail-Sentiment oder eine beliebige Wirtschaftskennzahl) gemeinsam in einem Chart, optional auf denselben Startwert normiert, plus eine Zahl die zeigt wie stark die beiden Reihen gerade zusammenhängen.

**Was das bedeutet:** Ein freies Werkzeug, um eigene Thesen zu prüfen — zum Beispiel: "Folgt der Kurs wirklich der institutionellen Positionierung?" oder "Reagiert dieses Paar tatsächlich auf den Zinsunterschied?". Die Normierung auf einen gemeinsamen Startpunkt macht zwei sehr unterschiedlich skalierte Werte (z.B. ein Kurs um 1,10 und eine COT-Zahl in Zehntausenden) optisch vergleichbar.

---

## 10. Journal (eigene Trades erfassen & auswerten)

Der Bereich, in dem man die eigenen, tatsächlich getätigten (oder geübten) Trades protokolliert und auswertet — unabhängig von den Marktanalyse-Werkzeugen oben.

### Trade erfassen

**Was man einträgt:** Datum, Währungspaar, Richtung (Long/Short, siehe Glossar), Ergebnis (Gewinn/Verlust/Ausgeglichen), wie viel Prozent des Kontos riskiert wurde, optional Einstiegspreis/Stop-Loss/Take-Profit/Lot-Size (siehe Glossar), welche Strategie verwendet wurde, welche bestätigenden Signale ("Confluences") vorlagen, ein Kommentar und ein Screenshot vom Chart.

**Wofür das gut ist:** Ohne schriftliche Aufzeichnung verlässt man sich beim Rückblick nur auf die (oft geschönte) Erinnerung. Ein Journal zeigt schwarz auf weiss, was wirklich passiert ist — Grundlage jeder ernsthaften Verbesserung als Trader.

**Wie das Ergebnis berechnet wird:** Aus Einstiegspreis, Stop-Loss und Take-Profit berechnet die Software automatisch das R-Multiple (siehe Glossar). Beispiel: Einstieg bei 1,0850, Stop-Loss bei 1,0820 (= 30 Pips Risiko), Take-Profit bei 1,0950 (= 100 Pips möglicher Gewinn) → geplantes R-Multiple = 100 ÷ 30 = 3,33R. Der tatsächliche Gewinn/Verlust in Euro/Dollar ergibt sich aus: Risikobetrag × erreichtes R-Multiple. Nach jedem Trade wird der Kontostand automatisch fortgeschrieben.

### Journal-Dashboard (eigene Performance-Auswertung)

**Was man sieht:** Kontostand, Gesamt-Gewinn/Verlust, Summe aller R-Werte, Win-Rate, Profit-Faktor, Expectancy, maximaler Drawdown (siehe Glossar für alle diese Begriffe), eine Kontostand-Verlaufskurve ("Equity-Kurve"), ein Fortschrittsring zu einem selbstgesetzten Kontoziel, sowie Verteilungs-Diagramme (welche R-Werte kommen wie oft vor) und Serien-Anzeigen (wie viele Gewinne/Verluste in Folge).

**Wofür das gut ist:** Das ist das Endergebnis der ganzen Journal-Arbeit — die ehrliche Antwort auf die Frage "verdiene ich mit meiner Art zu handeln langfristig Geld oder nicht?". Wichtig zu verstehen: Die Win-Rate allein sagt wenig aus — ein Trader mit nur 40 % Win-Rate kann profitabel sein, wenn seine Gewinne im Schnitt deutlich grösser sind als seine Verluste (das misst die Expectancy). Der maximale Drawdown zeigt, wie schlimm die bisher schlechteste Phase war — wichtig um einzuschätzen, ob man diese Schwankungen finanziell und psychisch aushält.

**Beispielrechnung Expectancy:** Win-Rate 60 %, durchschnittlicher Gewinn +2R, durchschnittlicher Verlust −1R → (0,60 × 2) − (0,40 × 1) = +0,8R erwarteter Gewinn pro Trade im Schnitt. Bei 100 Trades wären das im Schnitt +80R.

### Backtest-Raum (Strategie an der Vergangenheit üben)

**Was man macht:** Man wählt ein Paar und einen Zeitraum, geht dann Kerze für Kerze/Chart-Ausschnitt für Chart-Ausschnitt durch die Vergangenheit und trägt ein, wie man in dem Moment gehandelt hätte — inklusive R-Multiple, verwendetem Setup und eventuellen Fehlern.

**Wofür das gut ist:** Ein Backtest ist "Trading üben, ohne echtes Geld zu riskieren" — man testet, ob eine Strategie in der Vergangenheit überhaupt funktioniert hätte, bevor man sie mit echtem Kapital einsetzt. Zusätzlich kann man "Problem-Tags" vergeben (z.B. "zu früh eingestiegen", "Angst vor Drawdown") — die Auswertung zeigt danach, welcher wiederkehrende Fehler am meisten Geld kostet. Die Software warnt, wenn zu wenige Testfälle (unter 20) vorliegen, um daraus verlässliche Schlüsse zu ziehen — reiner Zufall spielt bei kleinen Stichproben eine zu grosse Rolle.

**Auswertung nach Setup und nach Fehler:** Für jedes verwendete Setup (Chartmuster) und jeden Fehler wird automatisch Win-Rate und Expectancy berechnet — so sieht man schwarz auf weiss, welche Muster funktionieren und welcher Fehler am teuersten ist.

### Outlook-Wizard (Wochenplanung → geplanter Trade)

**Was man macht:** Ein 5-Schritte-Assistent: (1) Paar wählen und die eigene These aufschreiben ("warum sollte dieser Trade funktionieren"), (2) Richtung und Preisniveaus festlegen (Einstieg, Stop-Loss, Take-Profit), (3) bestätigende Signale ("Confluences") auswählen, (4) fundamentale Begründung notieren, (5) eine Checkliste aus den eigenen Strategie-Regeln abhaken.

**Wofür das gut ist:** Zwingt dazu, VOR dem Trade schriftlich zu begründen, warum man ihn eingehen will — das verhindert impulsive, rein emotionale Entscheidungen. Ein Outlook durchläuft Status wie "Beobachtung" → "Wartend" → "Aktiv" (Checkliste erfüllt, bereit zu handeln) → "Ausgeführt". Aus einem aktiven Outlook lässt sich mit einem Klick ein echter Journal-Trade erzeugen, ohne alle Angaben neu einzutippen.

### Strategie-Regeln

**Was man macht:** Für jede eigene Handelsstrategie ein festes Regelwerk hinterlegen: Wann steige ich ein (Entry-Regeln), wann steige ich aus (Exit-Regeln), wann handle ich NICHT (Filter-Regeln, z.B. "nicht vor wichtigen Nachrichten"), und wie schütze ich mich vor zu grossen Verlusten (Risiko-Regeln, z.B. "maximal 1 % Risiko pro Trade").

**Wofür das gut ist:** Ohne schriftliches Regelwerk verschwimmt eine "Strategie" schnell zu reinem Bauchgefühl. Ein festes Regelwerk lässt sich objektiv überprüfen ("habe ich mich an meine eigenen Regeln gehalten?") und im Outlook-Wizard direkt als Checkliste verwenden.

### Journal-Kalender

**Was man sieht:** Ein Monats- oder Jahreskalender, bei dem jeder Handelstag mit der Anzahl Trades und dem Tagesergebnis (in R) eingefärbt ist — grün für positive, rot für negative Tage.

**Wofür das gut ist:** Zeigt auf einen Blick Muster über die Zeit — z.B. ob bestimmte Wochentage oder Monate durchgehend besser oder schlechter laufen.

### Einstellungen & Konten

**Was man einrichtet:** Ein oder mehrere Handelskonten (z.B. ein von einer Prop-Firma finanziertes "Funded"-Konto und ein eigenes Konto), inklusive Startkapital, Gewinnziel und Verlust-Grenzen; ausserdem wiederverwendbare Listen für Confluences, typische Fehler ("Problem-Tags") und Notiz-Textbausteine; sowie ein Export aller Daten als Sicherungsdatei.

**Wofür das gut ist:** Wer über mehrere Konten handelt (z.B. eigenes Geld + ein von einer Firma bereitgestelltes Handelskonto mit festen Regeln), kann die Ergebnisse getrennt auswerten, statt alles zu vermischen. Ein "Funded"-Konto von einer Prop-Firma funktioniert wie ein Test: man bekommt fremdes Kapital zum Handeln, muss aber ein Gewinnziel erreichen und darf eine Verlust-Grenze (Drawdown-Limit) nicht überschreiten — reisst man diese Grenze, verliert man den Zugang zu dem Konto.

---

## Wiederkehrende technische Bausteine (für Interessierte)

Wer bis hierhin gelesen hat, kennt bereits die wichtigsten Konzepte. Diese Bausteine tauchen in fast jedem Bereich wieder auf:

- **Perzentil-Vergleich über 5 Jahre** — statt fixer Schwellenwerte wird jeder Wert am eigenen historischen Kontext gemessen, das passt sich automatisch an veränderte Marktbedingungen an.
- **% des Open Interest** — macht Positionsgrössen über unterschiedlich grosse Märkte hinweg vergleichbar (ein Fluss von 1.000 Verträgen ist in einem kleinen Markt riesig, in einem grossen Markt winzig).
- **Vorwärts-Test (Forward-Return-Test)** — die Grundmethode hinter jedem "hat dieses Signal historisch funktioniert"-Check: alle Fälle mit diesem Signal in der Vergangenheit suchen, dann schauen was danach im Kurs passierte, verglichen mit dem Durchschnitt aller Zeitpunkte.
- **Aktualisierungsrhythmus** — die meisten Werte werden alle 5 Minuten neu geladen; die zugrundeliegenden Daten selbst kommen aber unterschiedlich oft: täglich (Kurse, Zinsen), wöchentlich (COT-Report, freitags), monatlich (viele Wirtschaftsdaten wie Inflation oder Arbeitslosigkeit).

**Datenquellen im Überblick:** FRED (US-Notenbank-Datenbank für Zinsen und Wirtschaftsdaten), CFTC (US-Aufsichtsbehörde, COT-Report), Myfxbook (Retail-Sentiment), ForexFactory (Wirtschaftskalender), OANDA (Devisenkurse), plus redaktionell gepflegte Daten für Zentralbank-Einschätzungen und Sitzungstermine.
