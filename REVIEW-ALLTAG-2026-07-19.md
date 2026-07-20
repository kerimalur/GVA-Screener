# GVA-Screener — Hartes Alltags-Review (2026-07-19)

Perspektive: skeptischer Senior-Quant + Produkt-Reviewer. Nutzer = genau ein Trader,
der das Ding wöchentlich (Sonntag) und täglich (London 08–10, NY 14–16) benutzen will.
Reines Review, kein Code geändert. Belege = Datei/Komponente.

**Gesamtbefund in einem Satz:** Die App ist funktional ~70 % am Ziel-Workflow — aber sie
verteilt 3 Kernseiten auf 30 Seiten, fällt auf mehreren prominenten Views Urteile, die das
eigene Labor bereits widerlegt hat, und zeigt nirgends (außer Real-Yield), wie alt ihre
Daten sind. Das Hauptproblem ist nicht fehlende Funktionalität, sondern **unvalidierte
Autorität + Rauschen + fragile Alert-Infrastruktur**.

---

## TOP-PRIORITÄTEN (rangiert nach Impact/Aufwand)

### 1. Das Sonntags-Cockpit sortiert nach einer widerlegten Metrik
- **Problem:** `/weekly` sortiert die Pair-Karten nach `score = alignedCount*10 + flowGap + inPlay`
  (`lib/data/weekly.ts:287`) — also primär nach Faktor-Konfluenz des 5-Faktor-Screeners
  (`lib/calc/screenerReasoning.ts`). Dein eigenes Labor hat SQL-verifiziert gezeigt:
  Outlook-Verdict gesamt ~50 %, **Alle-4-Kombi 47,4 % — mehr Konfluenz ist schlechter**,
  COT-NC einzeln schädlich (48,9→46,7 %). Der in STATUS.md notierte Umbau
  („Produktiv-Umbau Weekly Outlook auf Composite+Konfidenz") wurde nie gemacht.
- **Warum es zählt:** Das ist die prominenteste Wochen-Entscheidungshilfe. Sie priorisiert
  jeden Sonntag systematisch die falschen Pairs — und der Wizard übergibt genau diesen
  Text ins Journal („Screener: LONG (4/5 Faktoren)").
- **Vorschlag:** Verdict + Sortierung aus dem 5-Faktor-Screener entfernen. Entweder
  (a) nach der validierten Zins+Saison-Baseline (Q5/Q1, dieselbe Quelle wie /ml/ranking)
  sortieren, oder (b) /weekly zum urteils­freien Pair-Dossier degradieren (Events, COT-Flow,
  Streaks, Saison — alles Fakten, kein „LONG/SHORT").
- **Aufwand:** M · **Impact:** sehr hoch (verhindert wöchentliche Fehlsteuerung).

### 2. Keine Frische-Anzeige — eingefrorene Werte sehen „live" aus
- **Problem:** `is_stale`/Kadenz-Logik existiert in `lib/jobs/updateFred.ts`, wird aber
  **nur** im Real-Yield-View (FreshBadge, `RealYieldView.tsx`) angezeigt. Macro Terminal
  (`lib/data/terminal.ts` — kein einziges „stale"), Weekly, Dashboard und
  `screenerReasoning.ts` nehmen `latest(series)` ohne Altersprüfung. Der FRED-Ausfall
  (~03.–17.07., STATUS.md) hat bewiesen: Serien frieren wochenlang ein — und der
  Zins-Faktor rechnete stumm mit 3 Wochen alten Werten weiter. Zusätzlich liefert
  `/api/fundamentals` (Backend `macro.py`) einen STATIC-Fallback, dessen einziges
  Erkennungszeichen `updated: null` ist — die Journal-Outlook-Views zeigen das nicht.
- **Warum es zählt:** Vertrauen. Du kannst am Bildschirm nicht unterscheiden, ob ein
  Faktor auf aktuellen oder toten Daten steht — der teuerste Fehlertyp in diesem Tool.
- **Vorschlag:** Ein zentraler `asOf`-Wert pro Serie durch alle Loader durchreichen;
  UI-Regel überall: Datum klein dran + Faktor wird **neutral** (dir=0) wenn Alter >
  Kadenz-Schwelle (Logik existiert schon in updateFred — nur nachnutzen). STATIC-Fallback
  im UI explizit als „Platzhalter" kennzeichnen.
- **Aufwand:** S–M · **Impact:** hoch.

### 3. „Q5 · handelbar" ist ein unvalidierter Live-Anspruch
- **Problem:** Ranking-Seite (`app/(app)/ml/ranking/page.tsx`, QuintileBadge) und
  Dashboard-WeekPlan labeln Q5×Q1 als „handelbar". Der Champion wird per nächtlicher
  CV-Suche selektiert (Holdout korrekt unberührt), der Paper-Track ist wenige Wochen alt,
  und die einzige OOS-Evidenz (Labor: Q5 57,6 % @4W) stammt von der Baseline auf einem
  anderen Setup. Nahe Münzwurf ist die ehrliche Beschreibung — der Engine-Log-Explainer
  sagt das sogar selbst („0.500 = Münzwurf").
- **Warum es zählt:** Genau die Sorte autoritativer Anzeige, die Positionen auslöst.
- **Vorschlag:** Label „handelbar" → „Kandidat". Paper-Track-Hitrate mit n **direkt neben**
  dem Badge. „Handelbar" erst ab definierter Reife (z. B. n≥50 gereifte Predictions und
  Hitrate signifikant >50 %). Und: **nichts Neues auf den Score bauen**, bis der
  Paper-Track das hergibt — Fokus auf Datenqualität/Validierung (Punkte 2, 5).
- **Aufwand:** S · **Impact:** hoch.

### 4. Der Telegram-Alert-Kern steht auf fragiler Infrastruktur
- **Problem:** Alerts = einziges echtes Echtzeit-Feature. Sie hängen an: Render Free
  (schläft ein) + GH-Actions-Keepalive alle 10 min + UptimeRobot. Der Sticky-/Consumed-
  Zustand liegt in `state.json` auf dem **ephemeren** Render-Filesystem (`Backend/main.py`,
  save_state/load_state) — jeder Deploy/Neustart verliert TRIGGERED/CONSUMED: verbrauchte
  Linien werden wieder aktiv (Doppel-Alerts), offene HITs verschwinden. Für diese
  State-Maschine (evaluate_pair, mark, select_lines) existiert **kein einziger Test** —
  die Backend-Tests decken BIS/FRED/Panel/Splits, nicht den Scanner-Kern (auch
  `analyzer.py` ist ungetestet).
- **Warum es zählt:** Wenn du dem Alert nicht trauen kannst (kam keiner, weil Render
  schlief? kam er doppelt, weil State weg?), ist der Live-Teil der App wertlos.
- **Vorschlag:** TRIGGERED/CONSUMED nach Supabase persistieren (eine Mini-Tabelle,
  Laden beim Boot) + 5–10 pytest für die Sticky-/Consumed-Logik + ein „letzter
  Preis-Tick"-Zeitstempel im Dashboard (heartbeat sichtbar). Alternativ ehrlich:
  Render Starter bezahlen und Keepalive-Gebastel löschen.
- **Aufwand:** S–M · **Impact:** hoch.

### 5. Frontend: 0 automatisierte Tests auf ~28.000 Zeilen Signal-Logik
- **Problem:** `package.json` hat keinen Test-Runner. Die gesamte kritische Logik —
  `lib/ml/backtest.ts` (Lookahead-Schutz!), `confluence.ts`, `outlookSnapshots.ts`
  (as-of-Rekonstruktion), `screenerReasoning.ts`, `realYield.ts`, `pairBias.ts` — ist nur
  durch einmalige manuelle „Kontrollwerte via tsx" abgesichert. Ein Refactor kann
  unbemerkt Lookahead einführen; genau das würde jede Backtest-Zahl entwerten.
- **Vorschlag:** vitest einrichten und die **bereits existierenden** Kontrollwerte als
  Tests einfrieren (die Arbeit ist zu 80 % getan, sie ist nur nicht regressionssicher).
- **Aufwand:** S · **Impact:** hoch (schützt die Glaubwürdigkeit aller Zahlen).

### 6. Wochen-Backtests werden on-demand gegen Free-Render gerechnet
- **Problem:** Setup-Finder-Ranking-Modus feuert 28 Requests (Concurrency 4,
  `SetupFinder.tsx:96ff`) auf `/replay/fundamental-track`; Fundamental-Track dasselbe
  einzeln. Backend-Cache ist In-Prozess (`_TRACK_CACHE` 1 h TTL, `lru_cache`-Panel in
  `replay/fundamentals.py`) — **jeder Render-Sleep/Deploy leert alles**. Ergebnis:
  regelmäßig kalte Läufe von Minuten für Ergebnisse, die sich **einmal pro Woche** ändern.
  Gleiches Muster bei `lib/ml/backtest.ts` (uncached 8 J × 28 Pairs = 15–30 s, STATUS.md).
- **Vorschlag:** Wochen-Ergebnisse gehören vorberechnet nach Supabase (wie
  `ml_weekly_rankings` es bereits vormacht): der Sa-Job schreibt Track-/Backtest-Zeilen,
  Frontend liest nur noch. On-demand-Rechnen nur für Custom-Ranges.
- **Aufwand:** M · **Impact:** hoch (Ladezeit + Render-Last + Cache-Flakiness weg).

### 7. Dieselbe Kernregel ist 4× implementiert
- **Problem:** Pair-Bias-Regel existiert in `lib/ml/pairBias.ts`, `derivePairIdeas`
  (`lib/ml/ranking.ts`), `_pair_bias` und `_pair_bias_wide`
  (`Backend/replay/fundamentals.py`) — zwei Sprachen, Kommentar „identisch zu …" als
  einziger Schutz. Ebenso doppelt: Währungs-Score (Backend `macro.py` vs. Frontend
  `lib/calc/currencyScore.ts`), COT-Verarbeitung (Backend `macro_features/cot_factor.py`
  vs. `lib/data/cot.ts`).
- **Warum es zählt:** Der klassische Drift-Unfall: eine Seite wird angepasst, die andere
  nicht — und Replay-Bias ≠ Dashboard-Badge, ohne dass es jemand merkt.
- **Vorschlag:** Bias/Quintil ausschließlich im Backend rechnen (Replay liefert sie eh),
  Frontend konsumiert. Mindestens: einen Golden-Test, der beide Implementierungen
  gegeneinander prüft.
- **Aufwand:** M · **Impact:** mittel (Korrektheit langfristig).

### 8. Toter zweiter ML-Stack verwirrt und kostet Wartung
- **Problem:** `Backend/ml/` (LightGBM, 6 Endpoints, eigene Tabellen ml_models/
  ml_predictions) ist durch `ml_engine` ersetzt, lebt aber weiter. `/ml/training` ist
  eine Orphan-Seite (nicht in der Nav), `/ml/modell` (in der Nav!) ist die **Anleitung zum
  alten Stack**. Zwei ML-Systeme, von denen eins nicht gilt.
- **Vorschlag:** `Backend/ml/` + `/ml/training` + `/ml/modell` + TrainingPanel löschen
  (git ist das Backup). Nav-Gruppe „Machine Learning" schrumpft auf Engine-Log + Daten-Check.
- **Aufwand:** S · **Impact:** mittel (Klarheit, weniger Angriffsfläche).

### 9. compute_zones zieht alle 15 min 28 × 5000 Tageskerzen
- **Problem:** `main.py` → `compute_zones()` holt pro Pair `count=5000` (~19 Jahre) —
  alle 15 Minuten, obwohl sich pro Tag genau eine Kerze ändert; der 5-min-TTL-Cache
  (`data_pipeline.py`) ist bei jedem Lauf garantiert abgelaufen.
- **Vorschlag:** TTL an REFRESH_INTERVAL koppeln oder count auf das tatsächliche
  GVA-Lookback senken; ideal: inkrementell nur neue Kerzen holen.
- **Aufwand:** S · **Impact:** klein–mittel (Kaltstart, OANDA-Last).

### 10. Leitfaden dokumentiert z. T. widerlegte Regeln als Handelsanleitung
- **Problem:** `/leitfaden` erklärt „So handelst du danach" für Faktoren, deren
  Prädiktivität das Labor verneint hat (COT-NC!). Statisch = veraltet ohne Warnung.
- **Vorschlag:** Auf die validierten Erkenntnisse eindampfen (Zins+Saison, Q5-Konzentration)
  und pro Faktor den gemessenen OOS-Wert dazuschreiben — der Leitfaden wird dadurch
  ehrlicher UND kürzer.
- **Aufwand:** S · **Impact:** mittel.

---

## BEWERTUNG JE VIEW (Dimension 1)

| View | Urteil | Begründung |
|---|---|---|
| **Dashboard** (WeekPlan + NearGva + News) | **hoher Wert** | Einzige View, die Entscheidung (Q5/Q1) und Ausführung (GVA-Nähe, HIT) verbindet. Das ist das Cockpit — ausbauen. |
| **/ml/ranking** | **hoher Wert** (mit Punkt 3) | Kanonische Wochen-Basis; Labels müssen ehrlich werden. |
| **Weekly Outlook** | **heute irreführend** | Substanz (Events, Flow, Streaks) wertvoll, Verdict/Sortierung widerlegt → Dossier ja, Urteil nein. |
| **Setup-Finder** | nice-to-have | Forschungs-Tool, nicht Alltag. Überschneidet sich fast vollständig mit Fundamental-Track. |
| **Fundamental-Track** | nice-to-have | = Setup-Finder-Ranking-Modus für 1 Pair. Zusammenlegen. |
| **Macro Terminal** | nice-to-have | Gute Referenz („Warum"), keine Entscheidungsquelle — sagt der Nav-Kommentar (`nav.ts:26`) selbst. |
| **Real-Yield** | nice-to-have | Handwerklich die ehrlichste View (Frische-Badges!), aber die vierte Meinung zur selben Frage. Als Tab ins Terminal. |
| **COT Intelligence** | dekorativ-bis-Diagnose | COT-NC laut eigenem Labor als Signal schädlich. Als Kontext ok, als eigene Top-Level-Signalseite nicht. |
| **Season 2.0** | nice-to-have | Diagnose des stärksten Einzelfaktors — behalten, klein. |
| **Engine-Log** | hoher Wert | Vertrauensanker für die ML-Suche. Klein halten. |
| **/ml Daten-Check** | **hoher Wert** | Datenqualität ist dein Engpass — eher ausbauen (Frische-Ampel für ALLE Quellen, siehe Punkt 2). |
| **Scanner Radar/Heatmap** | hoher Wert | Ausführungsseite. Radar+Heatmap teilen eine Shell — ok. |
| **Scanner Signale-Inbox** | fraglich | Telegram + Dashboard-NearGva decken den Fall. Prüfen ob je geöffnet → sonst raus. |
| **Journal (Trades, Equity, Disziplin)** | **hoher Wert** | A+-Checkliste/Adherence ist der beste neue Baustein des Projekts — Verhalten schlägt Signal. |
| **Journal-Dashboard / Kalender / Equity** | konsolidierbar | 3 Statistik-Seiten → 1 Seite mit Tabs. |
| **Replay + Backtest-Lab** | **hoher Wert** | Laut eigener Roadmap („FTMO erst wenn Backtest positiv") die wichtigste Arbeit im Projekt. |
| **/ml/modell, /ml/training** | streichen | Alter Stack (Punkt 8). |
| **Leitfaden** | überarbeiten | Punkt 10. |

---

## REDUNDANZ / KONSOLIDIERUNGS-VORSCHLAG (Dimensionen 2 + Ausgabe)

**Kernbefund:** Mindestens vier Views beantworten „welche Währung ist stark/schwach?" mit
vier verschiedenen Methodologien (Baseline-Q-Score, 5-Faktor-Screener, currencyScore im
Terminal, Real-Yield-Verdict; dazu COT-Signale und Season-Verdicts). Der WeekPlan
vergleicht sogar zwei davon und meldet „divergent" — das System **produziert** Widerspruch,
statt ihn aufzulösen. Für einen Ein-Personen-Betrieb: eine kanonische Quelle, alles andere
ist Erklärung dieser Quelle.

Ziel-Navigation (~10 statt 22 Einträge):

1. **Dashboard** (Tages-Cockpit) — wie heute, plus Daten-Frische-Ampel und Scanner-Heartbeat.
2. **Wochen-Ranking** = /ml/ranking + /ml/setup-finder + /ml/fundamental-track in einer
   Seite (Tabs „Live" / „Validierung"; Backtest-Zahlen vorberechnet aus Supabase, Punkt 6).
   Klick auf ein Pair → Dossier-Drawer (die heutigen /weekly-Karten, ohne Verdict).
3. **Währungs-Detail** = Macro Terminal + Real-Yield + COT + Season als 4 Tabs **einer**
   Seite pro Währung, erreichbar als Drilldown aus Ranking/Dashboard. Vier Top-Level-
   Navigationspunkte verschwinden.
4. **Scanner** (Radar/Heatmap) — unverändert; Signale-Inbox streichen falls ungenutzt.
5. **Journal** — Trades + 1 Statistik-Seite (Dashboard/Equity/Kalender als Tabs) + Outlook.
6. **Backtest** (Replay + Lab) — unverändert, höchste inhaltliche Priorität.
7. **System** — Engine-Log, Daten-Check, Einstellungen, (gekürzter) Leitfaden.

---

## ALLTAGS-TAUGLICHKEIT / IDEALER WORKFLOW (Dimension 3 + Ausgabe)

**Sonntag (Ziel: 30–45 min, EINE Seite):** Wochen-Ranking öffnen → Q5/Q1-Paare + Pair-
Dossiers (Events der Woche, COT-Flow, Saison) → Outlook im Wizard anlegen. **Heute:**
dafür braucht es /ml/ranking + /weekly + ggf. Terminal/Real-Yield als Schiedsrichter,
weil die Urteile divergieren — 3–4 Tabs und ein Kopf voller Widersprüche.

**London 08–10 / NY 14–16 (Ziel: 5–10 min):** Dashboard: NearGva ≤50 Pips mit
Ranking-Badge + heutige News; Telegram meldet HITs. **Heute:** funktioniert im Prinzip
schon — die Lücken sind Vertrauen, nicht Features: kein Frische-Indikator, kein
Scanner-Heartbeat („lebt der Preis-Loop?"), State-Verlust bei Render-Neustart.

**Samstag (5 min):** Engine-Log + Daten-Check überfliegen.

Größte konkrete Reibungen heute: (a) widersprüchliche Urteile zwischen den Views,
(b) Minuten-Ladezeiten bei kalten Track-/Backtest-Berechnungen (Punkt 6),
(c) 22 Nav-Einträge für einen 3-Seiten-Alltag, (d) unsichtbare Datenalterung.

---

## STREICH-LISTE

1. **`Backend/ml/` komplett** (LightGBM-Stack #1) + `/ml/training` + `/ml/modell` +
   `TrainingPanel.tsx` — ersetzt durch ml_engine, stiftet nur Verwirrung.
2. **Verdict + Score-Sortierung in /weekly** — widerlegt; die Karten selbst bleiben als Dossier.
3. **/weekly, /makro/terminal, /makro/real-yield, /cot/intelligence, /ml/season als
   eigenständige Nav-Punkte** — Inhalte bleiben, aber als Tabs/Drilldowns (Konsolidierung).
4. **Scanner Signale-Inbox** — falls sie neben Telegram + Dashboard-NearGva keine Rolle
   spielt (ehrlich prüfen: wann zuletzt geöffnet?).
5. **Journal-Kalender + Journal-Dashboard als eigene Seiten** — in eine Statistik-Seite falten.
6. **Repo-Root-Wildwuchs** — 12+ Prompt-/Konzept-MDs (`ML-COT-MODELL-PROMPT.md`,
   `FXTERMINAL-PROJECT.md`, `fx_terminal_preview.html`, Pine-Dateien …) nach `docs/archive/`.
7. **Keepalive-Gebastel** (GH-Actions-Ping + UptimeRobot + Warmup-Thread) — streichen
   zugunsten eines bezahlten Dynos ODER bewusst behalten, aber dann mit Alarm, wenn der
   Ping fehlschlägt (sonst merkst du das Einschlafen erst am ausgebliebenen Alert).

**Nicht streichen** (explizit): Replay/Backtest-Lab, Disziplin-System, Daten-Check,
Engine-Log — das sind die Teile, die Evidenz und Verhalten adressieren, und damit die
wertvollsten des Projekts.

---

## „WENN DU NUR 3 DINGE MACHST"

1. **/weekly-Verdict ersetzen oder entfernen** (Punkt 1). Solange die prominenteste
   Wochen-Seite nach einer widerlegten Metrik sortiert, arbeitet die App aktiv gegen dich.
2. **Datenalter überall sichtbar machen + stale Faktoren neutralisieren** (Punkt 2).
   Der FRED-Vorfall war die Warnung; die nächste tote Quelle kommt bestimmt.
3. **Alert-Pfad unkaputtbar machen** (Punkt 4): Scanner-State nach Supabase, Heartbeat
   im Dashboard, Mini-Tests für die Sticky-Logik. Telegram-HITs sind der einzige Teil
   der App, der in der Session Geld berührt — er verdient die höchste Zuverlässigkeit.

---

## EHRLICHKEIT ZUR ML-REALITÄT (Rahmen für alles oben)

Die Engine-Architektur (Purged-Walk-Forward, geschützter Holdout, Paper-Track, Baseline
als Hürde) ist sauber gebaut — besser als das meiste, was man in Hobby-Quant-Projekten
sieht. Aber: die einzige belastbare OOS-Zahl ist Baseline-Q5 ≈ 57,6 % @4W (Labor), der
Rest liegt bei ~50 %. Konsequenz: **kein neues Feature auf den Signal-Score bauen**, keine
weiteren Score-Konsumenten (Badges, Filter, Autotrading-Ideen), bis der Paper-Track über
Monate liefert. Die Arbeit mit dem besten Erwartungswert liegt woanders: Datenfrische
(Punkt 2), Regressionsschutz (Punkt 5), manueller GVA-Backtest im Replay (dein eigener
Plan: „FTMO erst wenn Backtest positiv") und das Disziplin-System, das du schon hast.
