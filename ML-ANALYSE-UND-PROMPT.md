# GVA-Screener — ML-Analyse & Optimierungs-Prompt

Stand: 2026-07-11

---

## Teil 1: IST-Zustand — Was du hast

### Dateninfrastruktur (solide)
- **17 Jahre Preisdaten** (price_daily, 28 FX-Pairs, ab Okt 2008)
- **COT Legacy + TFF** (Non-Commercials UND Leveraged Funds, volle Historie)
- **FRED-Serien** (Leitzinsen + 10Y-Yields, alle G8-Währungen)
- **Saisonalität** (aus Preishistorie berechnet, pro Pair × Monat)
- **Retail-Sentiment** (erst ab Jul 2026 — für Backtest irrelevant)
- **Weekly Outlook Snapshots** (416 Wochen Backfill + Live-Cron)

### Faktor-Logik (regelbasiert, feste Schwellen)
5 Pair-Level-Faktoren in `screenerReasoning.ts`:

| Faktor | Signal-Logik | Schwelle |
|---|---|---|
| Zinsdifferenz | Niveau ODER 6M-Drehung | ±0.25pp / ±0.2pp |
| COT-Flow | 4W-Flow-Diff Base−Quote (% OI) | ±4 |
| Saisonalität | Ø-Return + Hitrate des Monats | ±0.3% UND ≥60/≤40% |
| Yield-Spread | 10Y-Spread-Trend 3M | ±0.15pp |
| Retail-Sentiment | Long-% konträr | ≥65% / ≤35% |

Verdict: ≥2 gleichgerichtete Faktoren + Mehrheit → LONG/SHORT.

### ML-Labor (vorhanden, aber rein deskriptiv)
- `factorMatrix.ts`: 900 Wochen × 28 Pairs × 5 Faktoren + Forward-Returns
- `LaborExplorer.tsx`: interaktiver Browser mit Heatmap, Kombi-Leaderboard, Pair-Tabelle
- `backtest.ts`: Verdict- und Faktor-Ebene, Konfluenz-Buckets

### Backtest-Erkenntnisse (dein Labor, SQL-verifiziert)
- **Gesamt-Verdict: ~50%** — keine Edge
- **Saison allein: 53.5→55.7%** (1→4W, bester Einzelfaktor)
- **Zins+Saison: 57.9%** (4W, n=1499) — beste Kombi, signifikant
- **COT-NC schadet** (48.9→46.7%)
- **Alle 4 Faktoren: 47.4%** — mehr Konfluenz = schlechter
- **COT je Währung unterschiedlich**: NZD/CAD → Commercials besser, CHF → Non-Comm

### Zusätzlich vorhanden, aber nicht im Verdict
- `riskGauge.ts`: VIX + Gold + JPY/CHF + SPX → Risk-On/Off-Composite (0–100)
- `currencyBias.ts`: 4 Währungs-Level-Faktoren (COT, Leitzins-Trend, CB-Stance, Stärke)
- `strength.ts`: Pair-Stärke-Scores (1W/1M/3M)
- `correlations.ts`, `dxy.ts`: Intermarket-Daten

---

## Teil 2: Diagnose — Wo die Probleme liegen

### Problem 1: Starre Schwellen vernichten Edge
Jeder Faktor feuert binär mit hardcodierten Schwellen. Zinsdiff ±0.25pp macht 2018 (alle Rates hoch) etwas anderes als 2024 (Ratenbreite riesig). Die Schwellen wurden nie optimiert — sie sind Bauchgefühl-Werte.

### Problem 2: Gleichgewichtung ist naiv
≥2 von 5 Faktoren = Signal. Aber das Labor zeigt: Saison hat Edge, COT-NC schadet. Trotzdem zählt jeder Faktor gleich viel. Das Verdict mittelt einen guten Faktor (Saison) mit einem schädlichen (COT-NC) zu einem 50%-Signal.

### Problem 3: Kein Regime-Filter
Risk-On/Off existiert als Gauge, wird aber nicht genutzt. Zinsdifferenz funktioniert vermutlich in Trending-Märkten besser als in Risk-Off-Phasen, wo alles korreliert. Ohne Regime-Conditioning verschmiert die Edge.

### Problem 4: COT wird falsch aggregiert
Dein Labor zeigt: COT-Variante (NC vs. Commercials) hängt von der Währung ab. Trotzdem nutzt das Verdict für alle Pairs dieselbe Variante (TFF Leveraged/Legacy NC). Das ist verschenktes Alpha.

### Problem 5: Keine Out-of-Sample-Validierung
Der Backtest läuft über die gesamte Periode. Wenn du Schwellen oder Kombis auf 8-Jahres-Daten optimierst und auf denselben Daten testest, ist das Overfitting. Es fehlt Walk-Forward-Validation.

### Problem 6: Binäres Signal statt Konfidenz
LONG oder SHORT oder nichts — kein Unterschied zwischen "knapp über Schwelle" und "alle 5 Faktoren stark". Dein Trading profitiert aber davon zu wissen, WIE stark die Confluence ist.

---

## Teil 3: Was ML hier konkret bringen kann

Ich empfehle **kein neuronales Netz oder komplexes ML**. Dein Datensatz (900 Wochen × 28 Pairs) ist zu klein für Deep Learning. Stattdessen: **regelbasierte Optimierung mit statistischer Validierung** — das passt zu deiner Strategie und ist interpretierbar.

### Hebel 1: Adaptive Faktor-Gewichtung (größter Hebel)
Statt ≥2 gleichgerichtete Faktoren → gewichtetes Scoring. Jeder Faktor bekommt ein Gewicht basierend auf seiner historischen Trefferquote. Saison bekommt mehr Gewicht, COT-NC weniger oder negativ. Das Gewicht kann währungsspezifisch sein (COT-C für NZD, COT-NC für CHF).

**Methode:** Logistische Regression oder simples Scoring-Modell mit Walk-Forward-Cross-Validation (z.B. 2-Jahres-Rolling-Window trainieren, 1 Jahr testen, vorwärts schieben).

### Hebel 2: Dynamische Schwellen per Perzentil
Statt Zinsdiff ±0.25pp fest → Perzentil-basierte Schwellen. "Zinsdiff im oberen 20%-Bereich der letzten 3 Jahre" passt sich automatisch an unterschiedliche Zinsumgebungen an. Die Infrastruktur dafür (rollingPercentile) existiert bereits im COT-Code.

### Hebel 3: Regime-Conditioning
Risk-Gauge in die Faktor-Gewichtung einbauen. Zwei Sets von Gewichten: eines für Risk-On (Composite >60), eines für Risk-Off (<40). Oder als Feature im Scoring-Modell.

### Hebel 4: Währungsspezifische COT-Variante
Systematisieren, was das Labor zeigt: pro Währung die bessere COT-Variante (NC oder Commercials) wählen, basierend auf Walk-Forward-Performance.

### Hebel 5: Konfidenz-Score statt binärem Signal
Gewichteter Score 0–100 statt LONG/SHORT/null. Ermöglicht Positionsgrößen-Skalierung und filtert schwache Signale raus.

### Hebel 6: Walk-Forward-Backtesting-Framework
**Voraussetzung für alles andere.** Ohne saubere Out-of-Sample-Validierung weißt du nicht, ob eine Verbesserung echt ist oder Overfitting. Rolling-Window-Backtest als Grundlage.

### Prioritäts-Reihenfolge
1. **Walk-Forward-Framework** (ohne das ist der Rest wertlos)
2. **Adaptive Gewichtung** (größter erwarteter Hebel)
3. **Dynamische Schwellen** (synergistisch mit Gewichtung)
4. **COT-Variante per Währung** (quick win, Daten vorhanden)
5. **Regime-Filter** (Risk-Gauge existiert, nur Integration)
6. **Konfidenz-Score** (Frontend-Verbesserung, nach Backend-Optimierung)

---

## Teil 4: Claude Code Prompt

Der folgende Prompt ist so geschrieben, dass du ihn direkt in Claude Code einfügen kannst:

---

```markdown
## Kontext

GVA-Screener — privates FX-Trading-Tool (Next.js 16 Frontend auf Vercel, Supabase DB).

Kernlogik: `lib/calc/screenerReasoning.ts` bewertet 28 FX-Pairs wöchentlich über 5 fundamentale
Faktoren (Zinsdiff, COT-Flow, Saisonalität, Yield-Spread, Retail-Sentiment). Aktuell: jeder
Faktor feuert binär mit hardcodierten Schwellen (z.B. Zinsdiff ±0.25pp). Verdict: ≥2
gleichgerichtete → LONG/SHORT. Backtest zeigt: Gesamt-Verdict ~50% (keine Edge).

ML-Labor existiert: `lib/ml/factorMatrix.ts` liefert 900 Wochen × 28 Pairs × 5 Faktoren +
Forward-Returns (1–4W) als kompakte Matrix. `lib/ml/backtest.ts` hat den Backtest-Rahmen.
Risk-Gauge existiert in `lib/calc/riskGauge.ts` (VIX/Gold/JPY-CHF/SPX → Composite 0–100).

Backtest-Erkenntnisse (8J, verifiziert):
- Saison allein: 55.7% (4W) — bester Einzelfaktor
- Zins+Saison: 57.9% (4W, n=1499) — beste Kombi
- COT-NC schadet (46.7% bei 4W)
- COT je Währung unterschiedlich: NZD/CAD → Commercials besser, CHF → Non-Comm
- Alle-4-Kombi: 47.4% — mehr Faktoren = schlechter
- Signal-Quote 66% (zu hoch, viele schwache Signale)

## Aufgabe

Baue ein ML-Optimierungsmodul (`lib/ml/optimizer.ts` + `lib/ml/walkForward.ts`) das die
fundamentale Confluence-Logik datengetrieben verbessert, OHNE die Strategie zu ändern — gleiche
5 Faktoren, gleiche Datenquellen, aber intelligenter kombiniert. Konkret:

### 1. Walk-Forward-Backtesting-Framework (`lib/ml/walkForward.ts`)
- Rolling-Window: 104 Wochen Training, 52 Wochen Test, 26 Wochen Step (vorwärts schiebend).
- Nimmt eine Scoring-Funktion `(factorDirs: number[], meta: {pair, base, quote, month, riskRegime}) => number` entgegen.
- Gibt pro Fold: In-Sample-Winrate, Out-of-Sample-Winrate, n, Signifikanz (95%-Konfidenz) zurück.
- Aggregiert über alle Folds: Ø OOS-Winrate, Ø OOS-Rendite, Stabilitäts-Score (Standardabweichung der OOS-Winrates über die Folds).
- Nutzt die bestehende `buildFactorMatrix()` als Datenquelle (bereits as-of-sicher, kein Lookahead).

### 2. Optimizer (`lib/ml/optimizer.ts`)
Drei Optimierungsmodi, alle mit Walk-Forward validiert:

**a) Gewichtetes Scoring (Hauptmodus)**
- Statt ≥2 gleichgerichtete → gewichteter Score: `w1*dZins + w2*dCotNC + w3*dCotC + w4*dSaison + w5*dYield`.
- Signal = Score > +threshold (LONG) oder < -threshold (SHORT).
- Gewichte und Threshold per Grid-Search optimieren (Gewichte in 0.1-Schritten von -1 bis +1, Threshold 0.3–1.5 in 0.1-Schritten).
- Constraint: nicht alle Gewichte 0; mindestens 2 Faktoren mit |w| > 0.
- Optimierungsziel: maximiere OOS-Winrate bei n ≥ 30 pro Fold.

**b) Währungsspezifische COT-Variante**
- Pro G8-Währung: Walk-Forward-Test ob COT-NC oder COT-C besser performed.
- Output: Map<Währung, "NC" | "C"> — die bessere Variante je Währung.
- Im gewichteten Scoring dann: für jedes Pair die Variante der Base- und Quote-Währung nutzen.

**c) Regime-konditionierte Gewichte**
- Risk-Gauge-Composite (aus `riskGauge.ts`) als Regime-Indikator.
- Zwei Gewichtungs-Sets: Risk-On (Composite ≥ 55) und Risk-Off (≤ 45).
- Walk-Forward validiert ob das Splitting die OOS-Winrate verbessert vs. ein einziges Set.

### 3. Optimierte Verdict-Funktion (`lib/ml/optimizedVerdict.ts`)
- Pendant zu `evaluatePair()` aus `screenerReasoning.ts`.
- Nimmt dieselben `ScreenerInputs` + optimierte Gewichte + COT-Varianten-Map + Risk-Regime.
- Gibt zurück: `{ direction, confidence: number (0–100), factors, weights_used }`.
- `confidence` = normalisierter Score (0 = knapp über Threshold, 100 = alle Faktoren stark aligned).

### 4. API-Route + Frontend
- `/api/ml/optimize` (POST): führt Walk-Forward-Optimierung aus, speichert Ergebnis in Supabase-Tabelle `ml_optimization_runs` (Zeitstempel, Gewichte, OOS-Winrate, Folds, Konfig).
- `/api/ml/latest-weights` (GET): gibt die neuesten optimierten Gewichte zurück.
- Auf `/ml` eine neue Sektion "Optimierung" mit:
  - Button "Optimierung starten" (ruft /api/ml/optimize auf)
  - Letzte Ergebnis-Anzeige: Gewichte als Balkendiagramm, OOS-Winrate, Stabilität, COT-Varianten-Map
  - Vergleichstabelle: aktuelle Logik vs. optimierte Logik (IS und OOS Winrate nebeneinander)

## Anforderungen
- TypeScript, kein Python — alles im Next.js-Frontend/API-Routes (wie der bestehende ML-Code).
- Bestehende Dateien (`screenerReasoning.ts`, `factorMatrix.ts`, `backtest.ts`) NICHT verändern — nur neue Dateien anlegen und importieren.
- `buildFactorMatrix()` als Datenquelle nutzen — die Matrix ist already as-of-sicher.
- Risk-Gauge-Daten: Für den Backtest den Regime-Score historisch rekonstruieren. Dafür VIX, Gold, SPX aus `price_daily` laden (Instrumente: `SPX500_USD`, `XAU_USD`, `BCO_USD`) und JPY/CHF-Stärke aus den Pair-Returns berechnen (wie `strength.ts`). Pro Montag einen Composite berechnen.
- Grid-Search darf langsam sein (das läuft nicht im Cron, nur on-demand via Button) — aber die API-Route braucht einen Timeout-Hinweis (>30s möglich, Vercel Function Timeout beachten: maxDuration in vercel.json oder Route-Config erhöhen).
- Walk-Forward MUSS strikt temporal sein: Training-Fenster endet BEVOR Test-Fenster beginnt, keine Überlappung.
- Supabase-Tabelle `ml_optimization_runs`: id (uuid), created_at, config (jsonb), weights (jsonb), cot_variants (jsonb), oos_winrate (float), oos_avg_return (float), oos_n (int), fold_details (jsonb), regime_weights (jsonb nullable).
- Styling: gleiches Design wie `LaborExplorer.tsx` (Tailwind, text-up/text-down/text-muted/text-faint Klassen, bg-surface2, border-border, font-mono).

## Akzeptanzkriterien
- Walk-Forward-Backtest läuft durch ohne Fehler, gibt pro Fold IS- und OOS-Statistiken zurück.
- Optimierte Gewichte zeigen eine OOS-Winrate die NACHWEISBAR über 50% liegt (mit Signifikanztest im Output).
- COT-Varianten-Map existiert und zeigt für mindestens 2 Währungen unterschiedliche Empfehlungen.
- Vergleichstabelle auf /ml zeigt klar den Unterschied zwischen alter Logik (~50%) und neuer Logik.
- Keine Änderungen an bestehenden Dateien — alles in neuen Dateien unter `lib/ml/` und `app/(app)/ml/` bzw. `app/api/ml/`.
- `npm run build` läuft fehlerfrei durch.
```

---

## Teil 5: Was der Prompt NICHT abdeckt (bewusst)

Diese Dinge sind wertvolle nächste Schritte, aber erst sinnvoll NACHDEM die Grundoptimierung steht:

- **Dynamische Schwellen per Perzentil** — erst testen ob die Gewichtung allein reicht; Schwellen-Optimierung danach als separater Prompt
- **Intermarket-Features** (DXY, Öl, Korrelationen) — mehr Features = mehr Overfitting-Risiko bei kleinem n; erst den Basisfall stabilisieren
- **Weekly Outlook Verdict umbauen** — erst wenn die optimierten Gewichte stabil positiv OOS performen, dann die Live-Logik umstellen
- **Automatisches Retraining** — erst manuell validieren, dann Cron-basiert alle 3 Monate
