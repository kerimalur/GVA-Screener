# GVA-Backtest Roadmap

Ziel: Der Replay-Backtest bildet die GVA-Linien exakt so ab wie das Pine Script
auf TradingView — erst dann wird darauf Auswertungslogik gebaut.

---

## Phase 1 — GVA-Linien-Logik perfektionieren

- [x] Replay-Backtest auf Minimum reduzieren: SL/TP/R:R komplett entfernt
      (Backend `replay/trade_result.py` gelöscht, `/replay/evaluate` speichert
      keine Simulation mehr, `/replay/stats` zählt nur noch, Frontend zeigt pro
      Linie nur: **gebildet am · gehittet am · Hit-Preis**)
- [ ] DB-Migration in Supabase ausführen (Spalten droppen):
      `Backend/replay/migrations.sql` → ALTER-TABLE-Block vom 2026-07-14
- [ ] Vergleichsstrategie umsetzen (siehe unten)
  - [x] Pine Script: Vergleichs-Tabelle am Chart (# · Richtung · Level ·
        Gebildet · Hit) + `FORMED,`/`HIT,`-Logzeilen im Pine-Logs-Pane
        (`waagerechte_szenarien_pro_v4.pine`, Gruppe «🔍 Replay-Vergleich»)
  - [ ] App-Seite: Hits als CSV ziehen (`/replay/hits`) und gegen Pine-Logs diffen
### GELÖST (2026-07-14): 3D-Raster — TV zählt Kalender-Wochentage

Pine-Log-Dump (alle TV-Blockstarts 01/2025–07/2026) bewies: TradingView
gruppiert 3D-Kerzen über **Kalender-Wochentage (Mo–Fr)** — Feiertage ohne
Kerze (25.12., 01.01.) zählen als Slot MIT (→ 2-Kerzen-Blöcke {24.12., 26.12.}
und {02.01., 05.01.}). Das Backend zählte echte Kerzen → Phase kippte an jedem
Feiertag. Fix: `resample_3d_bars` nutzt `np.busday_count` ab Anker
`2026-07-09` (bestätigter TV-Blockstart). Verifiziert: 118 TV-Blöcke,
0 Mismatches; pytest `tests/test_resample_3d.py` (3 Fälle inkl. Weihnachten).

- [x] 3D-Raster identisch mit TradingView (bewiesen über 16 Monate)
- [x] Referenzfall EURUSD März 2025 verifiziert (Render, 2026-07-14):
      SHORT gebildet 18.03.2025, Level **1.09224 exakt wie TV**, Hit 02.04.2025

### Abgleich-Historie (2026-07-14) — 3D-Raster 1 Handelstag verschoben

Erster Referenzfall EURUSD, erste SHORT-Linie 2025:

| | App (Backend/OANDA) | TradingView |
|---|---|---|
| Signal-Block | **20.03.2025** (20/21/24) | **18.03.2025** (18/19/20) |
| Level | 1.09032 | 1.09224 |
| Hit | 02.04.2025 ✓ | 02.04.2025 ✓ |

- Muster- und Hit-Logik korrekt, nur das 3D-Raster ist im März 2025 um
  **1 Handelstag** gegen TV verschoben (Backend-Blöcke starten 1 Tag früher).
- Karfreitag 18.04.2025 existiert in BEIDEN Feeds → nicht die Ursache.
- Debug-Endpoint: `GET /replay/blocks?pair=EUR_USD&from=…&to=…` zeigt die
  Backend-Blöcke inkl. Tageszuordnung. Anker aktuell `2025-05-06`
  (`Backend/data_pipeline.py` → `GVA_3D_ANCHOR`).
- Backend gruppiert aktuell: 10.07. + 13.07. + 14.07.2026.

**Nächste zwei Checks (TradingView, OANDA:EURUSD):**
- [ ] Startet die AKTUELLE 3D-Kerze am 10.07.2026?
      → Nein: Anker ist global 1 Tag daneben → `GVA_3D_ANCHOR` um 1 Handelstag
        schieben, März neu prüfen (einfachster Fix)
      → Ja: Phase kippt zwischen März 2025 und heute → mit `/replay/blocks`
        vs. TV-3D-Chart binär eingrenzen (Feed-Lücke suchen)
- [ ] Bestätigen, dass der März-Vergleich auf `OANDA:EURUSD` lief (nicht
      `FX:EURUSD` — anderer Feed, anderes Raster möglich)

- [ ] Logik iterativ anpassen, bis 1:1-Übereinstimmung mit Pine Script:
  - [ ] gleiche Linien entstehen (Anzahl + Erstellungsdatum + Preis)
  - [ ] gleiche Hits (Hit-Datum + Hit-Preis)
  - [ ] Abgleich auf zweitem Pair + zweitem Zeitraum bestätigt

### Vergleichsstrategie (Vorschlag)

**Grundprinzip: erst die Linien-Entstehung zur Deckung bringen, dann die Hits.**
Hits hängen von den Linien ab — stimmen die Linien nicht, debuggt man bei den
Hits nur Folgefehler.

1. **Referenzfall festnageln:** 1 Pair, 1 Jahr — z.B. `EUR_USD`,
   `2024-01-01` bis `2024-12-31`. Erst wenn dieser Fall 100 % stimmt, auf
   weitere Pairs/Zeiträume ausweiten.

2. **Gleiche Datenquelle sicherstellen:** Das Backend rechnet auf
   OANDA-Kerzen. In TradingView deshalb das Symbol **`OANDA:EURUSD`** laden,
   nicht `FX:EURUSD` — sonst vergleicht man unterschiedliche Kerzen und jagt
   Phantom-Differenzen. (Der TradingView-Link im Replay-Tab sollte dafür auf
   `OANDA:` umgestellt werden.)

3. **App-Seite — Liste ziehen:** `GET /replay/hits?pair=EUR_USD&from=…&to=…`
   liefert bereits alles Nötige als JSON:
   `line_formed_date, direction, level, hit_date`. Für den Zeilenvergleich als
   CSV ablegen (ein kleiner Export-Button im Replay-Tab oder einmalig
   `curl … | jq -r` reicht).

4. **Pine-Seite — Log statt Augen:** Pine kann kein CSV exportieren, aber
   `log.info()` schreibt in den Pine-Logs-Pane. Im Script an zwei Stellen eine
   Zeile im identischen Format loggen:
   - beim Entstehen einer Linie: `FORMED,<datum>,<richtung>,<preis>`
   - beim Hit: `HIT,<datum>,<richtung>,<preis>`
   Logs markieren, kopieren, als Textdatei neben die App-CSV legen.

5. **Diff fahren:** Beide Listen nach `line_formed_date` sortieren, Zeile für
   Zeile vergleichen (manuell oder `diff`). Drei Abweichungsklassen, in dieser
   Reihenfolge fixen:
   - **(a)** Linie existiert nur auf einer Seite → Muster-Erkennung abweichend
   - **(b)** Datum weicht ab → Kerzen-Raster/3D-Anker abweichend
   - **(c)** Preis weicht ab → Rundung/Feed; Toleranz ½ Pip, alles darüber ist Bug
   Immer nur die **erste** Abweichung fixen, dann neu ziehen — spätere
   Differenzen sind oft Folgefehler der ersten.

6. **Visuelle Gegenprobe:** Im Pine Script jede Linie mit ihrem
   Erstellungsdatum labeln; im Replay-Tab steht das Datum schon auf der
   Hit-Karte. So lässt sich jeder Diff-Fund in Sekunden am Chart verifizieren.

---

## Phase 2 — Erweiterte Auswertungslogik

*Erst starten, wenn Phase 1 abgeschlossen ist.*

- [ ] Kerzen-Analyse pro Setup speichern (z.B. Grösse zweite vs. erste Kerze in %)
- [ ] Filter in der Auswertung: z.B. «nur Setups mit zweiter Kerze >50 % grösser»
      → Win-Rate-Vergleich gefiltert vs. gesamt
- [ ] Weitere Merkmale nach gleichem Schema (Docht-Verhältnis, Abstand zur Linie, …)
- [ ] SL/TP/R:R-Simulation wieder einführen — diesmal auf der verifizierten Linien-Logik

## Phase 3 — Fundamentaldaten

- [ ] Zum Zeitpunkt jedes GVA-Hits die damals gültigen Fundamentaldaten anzeigen
      (Zinsentscheid, CPI, NFP, …)
- [ ] Setup-Qualität mit Marktumfeld korrelieren (Win-Rate mit/ohne Rückenwind)

## Phase 4 — Erweiterungen (offen)

- [ ] Platzhalter für spätere Ideen
