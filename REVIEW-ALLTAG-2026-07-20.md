# GVA-Screener — Hartes Alltags-Review (2026-07-20)

Perspektive: skeptischer Senior-Quant + Produkt-Reviewer. Nutzer = ein Trader, der das Ding
Sonntag + London 08–10 + NY 14–16 benutzt. Reines Review, kein Code geändert.
Belege = Datei:Zeile. Nachfolger von `REVIEW-ALLTAG-2026-07-19.md` — was dort behoben wurde,
wird hier nicht wiederholt.

**Was seit dem 19.07. gut ist:** Das Cockpit ist die richtige Antwort auf den Sprawl. Die
Nav-Sperre ist konsequent. `„handelbar"` ist raus, `QuintileBadge` sagt jetzt „Kandidat"
(`ml/ranking/page.tsx:20-33`). Das Vokabular-Kapitel in STATUS.md ist ein echter Fortschritt —
die meisten Solo-Projekte haben so etwas nie.

**Gesamtbefund in einem Satz:** Die Fundamental-Ebene ist jetzt ehrlich — dafür hat der Umbau
den **GVA-Kern kaputtgemacht**: das neue Cockpit schließt den Linien-Lebenszyklus nicht, deshalb
verstummt der Scanner Pair für Pair, ohne dass irgendein Bildschirm das anzeigt. Das ist kein
UX-Punkt, das ist ein stiller Totalausfall des Produkts.

---

## TOP-PRIORITÄTEN (rangiert nach Impact/Aufwand)

### 1. 🔴 Das Cockpit schließt den Linien-Lebenszyklus nicht — jedes Pair stirbt nach dem ersten HIT
- **Problem:** Der Backend-Zustand ist *sticky*: sobald eine Linie berührt wird, steht
  `TRIGGERED[pair]` und `evaluate_pair` liefert für dieses Pair ab sofort **dauerhaft** `HIT`,
  ohne neue Erkennung und **ohne neuen Telegram-Alert** (`Backend/main.py:150-155`). Aufgehoben
  wird das nur durch `POST /api/mark {action:"done"}` (`main.py:322-330`).
  `markPair` wird aber **ausschließlich** von `components/scanner/ScannerShell.tsx:44` gerufen —
  `components/cockpit/CockpitBoard.tsx` importiert es nicht einmal. Die drei Cockpit-Aktionen
  („Genommen", „Beobachten", „Verwerfen") schreiben nur den `signals`-Status in Supabase.
- **Folgekette:** Pair hittet → Karte in „Aktiv" → du klickst „Genommen" → Karte verschwindet →
  **Backend bleibt für immer auf HIT**. Die Wartend-Lane filtert `!md.triggered`
  (`lib/cockpit/board.ts:126`), also kommt das Pair auch nie wieder in „Wartend". Kein neuer
  Alert, keine neue Karte, keine nächste Linie (`select_lines` springt nur über *consumed*
  Levels). Nach ein paar Wochen sind die aktivsten Pairs tot — und das Board zeigt dann drei
  leere Spalten, was aussieht wie „diese Woche ist nichts los".
- **Warum es zählt:** Das ist die einzige Funktion, für die die Software existiert. Und der
  Fehlermodus ist Stille — der teuerste, den es gibt.
- **Vorschlag:** `onTake` und `onDismiss` rufen zusätzlich `markPair(c.pair, "done")`
  (idempotent, Fehler tolerieren). „Beobachten" → `markPair(pair,"pending")`. Danach den
  Scanner-Umweg gar nicht mehr brauchen.
- **Aufwand:** S (≈15 Zeilen) · **Impact:** existenziell.

### 2. 🔴 Der gesamte Scanner-Zustand liegt im Prozess-RAM + einer Datei auf Renders Wegwerf-FS
- **Problem:** `ZONES`, `TRIGGERED`, `CONSUMED`, `ALERT_CACHE`, `PREV_PRICE` sind Modul-Globals
  (`main.py:47-70`). `save_state()` schreibt nach `Backend/state.json` — `render.yaml` deklariert
  **keine Disk**, das Dateisystem ist ephemer. Jeder Deploy/Restart/Recycle wischt es.
- **Warum es zählt:** Zwei entgegengesetzte, gleich schlechte Zustände. Ohne Reset: Punkt 1
  (Verstummen). Mit Reset: alle bereits getradeten Linien leben wieder auf → Telegram feuert
  erneut auf Setups, die du längst genommen hast, und das Cockpit zeigt sie als frisch. Du kannst
  am Bildschirm nicht unterscheiden, welcher der beiden Zustände gerade gilt.
- **Vorschlag:** Lebenszyklus dahin, wo er hingehört — Supabase. Die `signals`-Tabelle ist schon
  die richtige Struktur: `journaled`/`dismissed` = *consumed*, `new`/`watchlist` = *triggered*.
  Beim Start `load_state()` aus Supabase statt aus der Datei. `ZONES` darf ruhig flüchtig bleiben
  (neu berechenbar), aber **nicht** `CONSUMED`.
- **Aufwand:** M · **Impact:** sehr hoch. Zusammen mit Punkt 1 als *ein* Arbeitspaket lösen.

### 3. 🔴 Verpasste Hits während Downtime — strukturell unsichtbar
- **Problem:** Die Kreuzungs-Erkennung braucht `PREV_PRICE` (`main.py:158-170`); ohne Vortick
  gilt nur das 0,1-Pip-Band. Nach jedem Restart ist `PREV_PRICE` leer. Render Free schläft nach
  15 min; der Keep-Alive ist GitHub-Cron alle 10 min (`.github/workflows/keepalive.yml`) — GH-Cron
  verzögert notorisch um 5–20 min. Eine Linie, die im Downtime-Fenster durchquert wird und
  danach nicht zurückkommt, wird **nie** erkannt. Sie bleibt ewig „aktiv" und blockiert als
  nächstliegende Linie sogar die dahinterliegende.
- **Warum es zählt:** Kein Alert, kein Log, keine Spur. Du weißt nicht, was du nicht gesehen hast.
- **Vorschlag:** Beim Zonen-Refresh (alle 15 min) prüfen, ob die 3D-Kerzen-Historie seit dem
  letzten Lauf eine Linie berührt hat (`replay/gva_history.collect_hits` kann das bereits) —
  und diesen Hit nachträglich als Signal schreiben, mit Flag „nachträglich erkannt". Das schließt
  die Lücke komplett, weil die Kerzen-Historie die Downtime nicht kennt.
- **Aufwand:** M · **Impact:** hoch.

### 4. 🟠 Leeres Board ≠ „nichts zu tun" — Kaltstart und Ausfall sehen identisch aus
- **Problem:** `GET /api/screener` gibt roh `LIVE_CACHE["data"]` zurück (`main.py:300-304`) —
  beim Kaltstart ein leeres Array mit HTTP 200. `CockpitBoard.loadScanner` setzt daraufhin
  `state = "ok"` (`CockpitBoard.tsx:130`). Ergebnis: drei leere Lanes, keine Warnung.
  `LIVE_CACHE["updated"]` existiert, wird aber vom Endpoint **nicht** ausgeliefert.
  Zweiter Pfad: fällt OANDA-Pricing aus, rechnet `build_live_snapshot` still mit
  `zone["daily_close"]` weiter (`main.py:265-269`) — die Pip-Distanzen auf den Karten sehen
  live aus, sind aber vom letzten Tagesschluss.
- **Warum es zählt:** Genau der Fehlertyp, den du beim Real-Yield-View schon richtig gelöst hast
  (`FreshBadge`/`freshnessOf`, `lib/calc/realYield.ts:13-16`). Der Kern-Screen kann es nicht.
- **Vorschlag:** Endpoint auf `{data, updated, zones, live: bool}` erweitern. Cockpit-Kopfzeile:
  „Stand 14:32 · 28 Pairs" — grau bei >2 min, `warn` bei >5 min, eigener Zustand „Backend startet
  (Zonen 6/28)" solange `zones < 28`. Karten mit Fallback-Preis bekommen ein `~`.
- **Aufwand:** S · **Impact:** hoch.

### 5. 🟠 Die „Aktiv"-Lane altert nicht — ein 12 Tage alter HIT steht oben als „frischer GVA-HIT"
- **Problem:** `assembleLanes` nimmt alles mit `status === 'new'` (`board.ts:135-138`),
  `loadSignals` limitiert auf 200 Zeilen ohne Zeitfenster (`lib/journal/signals.ts:47-56`).
  Das Lane-Label lautet hart „frischer GVA-HIT" (`CockpitBoard.tsx:24`). Ein HIT, den du vor
  zwei Wochen nicht bearbeitet hast, sieht exakt aus wie der von vor 20 Minuten.
- **Warum es zählt:** Ein GVA-Level ist ein zeitkritisches Ereignis. Ein alter HIT ist keine
  Chance, sondern Rauschen — und er verdrängt in der Lane die echten.
- **Vorschlag:** Alter auf der Karte („vor 18 min" / „vor 3 Tagen"), Karten >24 h abgedimmt,
  Auto-Expire >72 h → Status `expired` (kleine Migration + Zeile im Wochen-Job). Anzahl in der
  Lane-Kopfzeile nach frisch/alt trennen.
- **Aufwand:** S · **Impact:** hoch (direkte tägliche Reibung).

### 6. 🟠 Der Zonen-Loop verbrennt 24/7 OANDA-Quota für Daten, die sich einmal am Tag ändern
- **Problem:** `_zones_loop` läuft alle 15 min über alle 28 Pairs mit
  `fetch_and_resample_3d(pair, count=5000)` (`main.py:222-240`). Der Tageskerzen-Cache hat
  TTL 300 s (`data_pipeline.py:18-19`) — bei 900 s Loop-Intervall greift er **nie**. Das sind
  ~2 700 Vollabrufe à 5 000 Kerzen pro Tag für D-Kerzen, die 1×/Tag schließen. Zusätzlich
  bestimmt genau dieser Durchlauf deinen Kaltstart: 28 Requests + `time.sleep(0.1)` bevor
  überhaupt die erste Karte erscheinen kann.
- **Vorschlag:** Zonen nur neu rechnen, wenn ein neuer Tages-Close vorliegt (Datum des letzten
  Index-Eintrags vergleichen), sonst schlafen. Cache-TTL auf 12 h. Zusätzlich `ZONES` nach dem
  ersten Lauf in Supabase spiegeln → Kaltstart liefert sofort Levels und rechnet im Hintergrund nach.
- **Aufwand:** S (TTL+Guard) / M (Spiegelung) · **Impact:** mittel-hoch (Kaltstart, Rate-Limit-Risiko).

### 7. 🟠 Die Kernlogik existiert zweimal — und keine der beiden Kopien ist getestet
- **Problem:** Die GVA-Mustererkennung liegt einmal in `Backend/analyzer.py:14-97` und einmal
  handkopiert in `Backend/replay/gva_history.py:32-115` (`collect_hits`). Beide Schleifen müssen
  Zeichen für Zeichen identisch bleiben. Es gibt **keinen Test für `analyze_gva_zones`** —
  in `Backend/tests/` deckt nur `test_resample_3d.py` die Kerzen-Gruppierung ab, die
  Muster-/Level-/Touch-Logik gar nicht. 56 grüne Tests, aber die Frage „welche Linien existieren"
  ist ungetestet.
- **Warum es zählt:** Der Replay ist dein Kalibrier-Werkzeug gegen TradingView. Driftet er vom
  Live-Scanner ab, kalibrierst du gegen die falsche Referenz und merkst es nie.
- **Vorschlag:** Eine Funktion `scan_gva(df_3d, ...) -> (lines, hits)`; `analyze_gva_zones` wird
  ein dünner Wrapper darauf. Dazu 3 Tests: (a) synthetische Kerzen mit bekanntem Muster,
  (b) Toleranz-/Size-Faktor-Grenzfälle, (c) Äquivalenz — gleiche Levels aus beiden Pfaden.
- **Aufwand:** S–M · **Impact:** hoch (Vertrauen in die einzige echte Signalquelle).

### 8. 🟡 Null Frontend-Tests, obwohl dort inzwischen Entscheidungslogik liegt
- **Problem:** `package.json` hat kein `test`-Script, keine Testdatei im ganzen `frontend-next`.
  Gleichzeitig entscheiden im Frontend: `lib/cockpit/board.ts` (welche Karte in welche Lane),
  `lib/ml/pairBias.ts` (Rückenwind/Gegenwind — mit einer nicht-offensichtlichen Regel, dass
  Q5×Q5 neutral ist), `lib/ml/confluence.ts`, `lib/ml/backtest.ts`.
- **Vorschlag:** vitest + ~15 Tests auf `board.ts` und `pairBias.ts`. `board.ts` ist bewusst
  I/O-frei geschrieben — die Arbeit ist schon getan, es fehlt nur der Test.
- **Aufwand:** S · **Impact:** mittel.

### 9. 🟡 Konfluenz friert ein, während die Karten weiterlaufen
- **Problem:** `quintiles`/`rankingByCcy` kommen aus dem Server-Render der Cockpit-Seite
  (`app/(app)/cockpit/page.tsx:47-56`), `loadRankingData` ist zusätzlich 5 min gecacht. Das
  Board pollt danach alle 15 s unbegrenzt weiter (`CockpitBoard.tsx:18`). Tab über Nacht offen =
  frische Karten mit Ranking von gestern, ohne Kennzeichnung.
- **Vorschlag:** `weekStart` im Cockpit-Kopf anzeigen („Ranking KW 30, Stand Sa 06:00"). Optional
  alle ~10 min per Route-Refresh nachziehen.
- **Aufwand:** S · **Impact:** mittel.

### 10. 🟡 Der gesperrte Code ist eine unbefristete Hypothek
- **Problem:** 9 Routen sind per `proxy.ts:96-105` hart unerreichbar, werden aber weiter gebaut,
  typgeprüft und mitgeschleppt. `components/dashboard/WeekPlan.tsx` ist seit dem
  `/dashboard`-Umbau **komplett verwaist** (kein Import mehr außer Typen). `lib/data/weekly.ts`
  (381 Zeilen) und `lib/calc/screenerReasoning.ts` — der 5-Faktor-Verdict, den dein eigenes
  Labor mit 47,4 % widerlegt hat — leben weiter und sind jederzeit wieder einbindbar.
- **Vorschlag:** Verfallsdatum setzen: was du bis **31.08.** nicht vermisst hast, wird gelöscht
  (Git hat es). `screenerReasoning.ts` und `WeekPlan.tsx` sofort — sie sind nicht nur tot,
  sondern rückfallgefährlich.
- **Aufwand:** S · **Impact:** mittel (Tempo + weniger Selbstverwirrung).

---

## MEHRWERT JE VIEW

| View | Bewertung | Begründung |
|---|---|---|
| **Cockpit** | **hoher Wert** (aktuell defekt) | Der einzige Screen, der zu einer Handlung führt. Punkte 1/4/5 fixen, dann ist er die App. |
| **Journal** (Trades, Equity, Dashboard, Kalender) | **hoher Wert** | Die einzige Quelle echter, eigener Evidenz. Unangetastet lassen. |
| **Backtest-Lab + Replay** | **hoher Wert, aber Projekt-Modus** | Kalibrierung gegen TradingView ist die Grundlage für alles. Kein täglicher Klick — gehört nicht in den Alltags-Pfad. |
| **Währungs-Ranking** | **nice-to-have** | Liefert die Konfluenz — die aber das Cockpit-Popup bereits zeigt. Als eigene Seite: 1×/Woche, 60 Sekunden. |
| **Factor-Lab** | **nice-to-have (behalten)** | Live noch leer, braucht Monate. Ehrlich gelabelt, kostet nichts, beantwortet die einzige Frage, die zählt. Nicht anfassen, nur laufen lassen. |
| **Engine-Log** | **nice-to-have** | Sauber und ehrlich gebaut — aber es beobachtet eine Edge bei ~0,52. Wochen-Blick, keine Entscheidungsquelle. |
| **Macro Terminal** | **dekorativ/redundant** | Ein zweiter, unabhängig gerechneter Bias (`currencyScore.ts`) neben dem Ranking-Quintil. Zwei Bias-Wahrheiten für einen Trader, der nur GVA tradet. |
| **Real Yield** | **dekorativ/redundant** — mit einer Ausnahme | Die *Frische-Logik* dort (`freshnessOf`, „nie mit toten Daten rechnen") ist das Beste im Projekt und gehört ins Cockpit. Die *Seite* braucht niemand täglich. |
| **News / Kalender** | **nice-to-have, falsch platziert** | Die High-Impact-Events stehen längst im Cockpit-Popup. Eine eigene Seite dafür ist ein Klick zu viel. |
| **Scanner Radar / Signale / Heatmap** | **redundant** (heute Notausgang) | Vollständig vom Cockpit abgedeckt — außer dass Radar aktuell die **einzige** Stelle ist, wo `Fertig` existiert (siehe Punkt 1). Nach dem Fix: weg. |
| **Journal-Outlook** | **redundant** | Zweiter `tradePrefill`-Pfad (`OutlookView.tsx:174`) neben dem Cockpit. Zwei Wege in dasselbe Formular = zwei Disziplinen. |
| Leitfaden / Strategien / Einstellungen | ok | Nachschlagewerk, stört nicht. |

---

## STREICH-LISTE

1. **`components/dashboard/WeekPlan.tsx`** — verwaist, kein Import mehr. Sofort.
2. **`lib/calc/screenerReasoning.ts` + `lib/data/weekly.ts` + `/weekly`** — der widerlegte
   5-Faktor-Verdict (47,4 %). Solange er im Code liegt, kommt er zurück.
3. **`/scanner/heatmap` und `/scanner/signale`** — nach Fix 1 vollständig redundant.
   `/scanner/radar` als Debug-Ansicht behalten, aber aus der Nav nehmen.
4. **`/journal/outlook`** — ein Weg ins Journal, nicht zwei.
5. **Die 7 weiteren gesperrten Routen** (`/cot`, `/ml/season`, `/ml/fundamental-track`,
   `/ml/setup-finder`, `/ml/modell`, `/ml/training`, `/ml/labor`) — Stichtag 31.08., dann löschen.
   Der Setup-Finder ist der schmerzhafteste davon, aber er backtestet eine Signalquelle, die du
   nicht tradest.
6. **Repo-Ballast:** `fx_terminal_preview.html` (380 KB), `fx_terminal_rendered.html` (1 MB),
   `marketing-verkauf-backup/`, die 10 Prompt-/Roadmap-MDs im Root → `docs/archiv/`.
   `STATUS.md` ist bei 40 KB — der aktuelle Stand gehört nach oben, alles vor Juli ins Changelog.

**Nicht streichen**, auch wenn es verlockend ist: Factor-Lab und Engine-Log. Sie kosten dich
nichts im Alltag und sind die einzige Instanz, die dich später davor bewahrt, an eine Edge zu
glauben, die keine ist.

---

## WENN DU NUR 3 DINGE MACHST

1. **Den Linien-Lebenszyklus schließen und persistent machen** (Punkte 1 + 2, ein Paket).
   Ohne das ist alles andere Kosmetik an einem Scanner, der still verstummt.
2. **Frische + Kaltstart im Cockpit sichtbar machen** (Punkt 4, dazu Alter der Hits aus Punkt 5).
   Ein leeres Board muss sagen können, *warum* es leer ist.
3. **Den GVA-Kern entdoppeln und testen** (Punkt 7). Die Frage „stimmen meine Linien mit
   TradingView überein" ist die einzige, die deine gesamte Auswertung trägt.

Alles drei zusammen: knapp unter einem Wochenende. Bewusst **kein** neues Feature, **kein**
neues Modell.

---

## IDEALER WORKFLOW — und wie weit die App weg ist

**Sonntag (10 min).** Eine Seite: Ranking der Woche (Q5/Q1) + High-Impact-Kalender + die
GVA-Linien, die aktuell in Reichweite liegen, sortiert nach Distanz. Ergebnis: 3–5 Pairs auf
der Beobachtungsliste, notiert.
→ *Heute:* Cockpit „Wartend" + `/ml/ranking` = zwei Seiten, aber nah dran. **~80 % erreicht.**

**Werktag, London 08:00 (2 min).** Cockpit auf, Board mit Zeitstempel. „Aktiv" zeigt was seit
gestern gehittet hat, mit Alter. Klick → Konfluenz + Events → Genommen/Beobachten/Verwerfen.
Board schließt sich sauber, das Pair kehrt in den Zyklus zurück.
→ *Heute:* funktioniert genau einmal pro Pair, danach nie wieder (Punkt 1). **~40 % erreicht.**

**Intraday.** Telegram-Alert bei HIT, aus dem Alert direkt ins Cockpit.
→ *Heute:* Alert existiert und ist gut — verstummt aber pairweise (Punkt 1) und hat ein
stilles Downtime-Loch (Punkt 3). Kein Deep-Link. **~50 % erreicht.**

**NY 14:00 (2 min).** Wie London.

**Freitag/Sonntag (5 min).** Journal-Dashboard: was habe ich genommen, was ist daraus geworden,
stimmt die Konfluenz-Hypothese. Einmal im Monat: Factor-Lab live-Hitrate anschauen.
→ *Heute:* vorhanden und gut. **~90 % erreicht.**

**Der Bruch liegt nicht im Design, sondern im Lebenszyklus.** Das Cockpit ist als Oberfläche
richtig gedacht — es ist nur nicht mit dem Zustandsautomaten im Backend verdrahtet, den es
ersetzt hat.

---

## KONSOLIDIERUNGS-VORSCHLAG

**Ziel: 6 Einträge in der Nav, nicht 20.**

| Neu | Absorbiert |
|---|---|
| **Cockpit** (Startseite) | Scanner Radar/Signale/Heatmap, Dashboard-News (als Event-Zeile), Weekly Outlook. Ergänzen um: Zeitstempel, Hit-Alter, `weekStart` des Rankings, Wochen-Events als schmale Leiste über den Lanes. |
| **Woche** (ersetzt „Währungs-Ranking") | Ranking-Tabelle + Kalender-Woche + optional Real-Yield als Spalte statt eigener Seite. Der eine Sonntags-Screen. |
| **Journal** | unverändert (Trades, Equity, Dashboard, Kalender) — ohne Outlook. |
| **Labor** (ein Eintrag, aufklappbar) | Factor-Lab, Engine-Log, Replay, Backtest-Lab. Ein Ort für „schaue ich selten an, muss aber laufen". |
| **System** | Strategien, Einstellungen, Leitfaden. |

Macro Terminal und Real Yield entfallen als eigenständige Seiten — ihr einziger *täglich*
relevanter Beitrag ist die Frische-Prüfung, und die gehört als Regel ins Cockpit, nicht als
Seite in die Navigation.

---

### Was ich bewusst NICHT vorschlage
Nichts Neues auf den Signal-Score zu bauen. Die Engine-Baseline liegt bei mean_hitrate
0,52–0,54 bei σ 0,005–0,033 — schwach und leicht instabil. Der Ranking-Q5 ist ein Kandidat,
keine Edge. Die richtige Reaktion darauf ist genau das, was du mit dem Factor-Lab tust:
messen, warten, nicht bauen. Die Arbeit der nächsten Wochen gehört in den GVA-Kern —
in Korrektheit, Lebenszyklus und Frische, nicht in Modelle.
