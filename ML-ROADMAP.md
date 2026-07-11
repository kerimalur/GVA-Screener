# GVA-Screener — ML & Feature Roadmap

Stand: 2026-07-11

---

## Phase 1: ML-Fundament (JETZT)

### ✅ 1.1 LightGBM COT+Saisonalitäts-Modell
**Status:** Training läuft
**Prompt:** `ML-COT-MODELL-PROMPT.md`
**Was:** ~50 Features aus COT-Rohdaten + Saisonalität → LightGBM → Direction-Prediction 1–4W.
Walk-Forward-Validation über 25 Folds. Im Python-Backend (Render/FastAPI).

### ⬜ 1.2 Replay-Backtest-Tool
**Status:** Prompt fertig, wartet auf Umsetzung
**Prompt:** `BACKTEST-REPLAY-PROMPT.md`
**Was:** Historische GVA-Hits rekonstruieren + Fundamental-Snapshot zeigen. Kerim bewertet
manuell (BOS/Fib/Volume) → echte WR ermitteln. 1:3 R:R Ergebnis-Simulation.

---

## Phase 2: Saisonalität 2.0

### ⬜ 2.1 Erweiterte Saisonalitäts-Features
**Abhängigkeit:** Phase 1.1 abgeschlossen + Ergebnisse ausgewertet

Aktuelle Saisonalität: nur Monats-Durchschnitt (Ø-Return + Hitrate). Das ignoriert
stärkere Sub-Patterns:

**Neue Features (als LightGBM-Input und/oder eigenes Modul):**
- **Quartalsende-Rebalancing:** Letzte 5 Handelstage von März/Juni/September/Dezember.
  Institutionelle rebalancen Portfolios → vorhersagbare Währungsflows (USD-Nachfrage
  steigt typisch am Quartalsende). Feature: `is_quarter_end_week`, `days_to_quarter_end`.
- **Monatsanfangs-Flows:** Erste Woche = Gehaltszahlungen, Pension-Rebalancing.
  Feature: `is_month_first_week`.
- **Woche-des-Monats:** Woche 1–5, als Feature (nicht one-hot, ordinal reicht).
  Fängt OpEx-Effekte (Options Expiry, typisch 3. Freitag) mit ab.
- **Jahresend-/Jahresanfangs-Effekt:** Dezember (Window Dressing, Carry Unwind) und
  Januar (neue Allokationen) haben eigene Dynamiken. Feature: `is_year_end_window`
  (letzte 2 Wochen Dez), `is_year_start` (erste 2 Wochen Jan).
- **Halbjahr:** H1 vs. H2 — einige Pairs (v.a. AUD, NZD) zeigen Halbjahres-Zyklen
  durch Rohstoff-Saisonalität. Feature: `half_year`.
- **Regime-konditionierte Saisonalität:** Monats-Ø separat berechnet für
  Risk-On-Jahre vs. Risk-Off-Jahre (Risk-On = SPX Jahresrendite >0). Saisonalität
  in Risk-Off-Jahren sieht anders aus (z.B. JPY-Stärke im August deutlicher).
  Feature: `month_avg_return_risk_on`, `month_avg_return_risk_off`.

**Umsetzung:**
- Features in `Backend/ml/features.py` ergänzen (as-of-sicher, Rolling-Berechnung)
- LightGBM-Modell mit erweiterten Features neu trainieren
- Feature Importance vergleichen: bringen die neuen Saison-Features Edge?
- Frontend: Saison-2.0-Übersicht auf der ML-Seite (Quartalsende-Statistiken,
  Monatswochen-Heatmap)

---

## Phase 3: Deep Learning (bedingt)

### ⬜ 3.1 Datenlage evaluieren & DL-Entscheidung

**Bedingung:** Nur umsetzen wenn die Datenlage es hergibt.

**Aktuelle Datenlage:**
- 17 Jahre × 52 Wochen × 28 Pairs = **24.752 Samples** (LightGBM-tauglich)
- 17 Jahre × 52 Wochen × 8 Währungen = **7.072 COT-Datenpunkte pro Variante**
- Saisonalität: ~6.200 Handelstage × 28 Pairs = **173.600 Daily-Datenpunkte**

**DL braucht typisch >100k Samples** für tabellarische Daten. Möglichkeiten:

**a) Daily statt Weekly granularity**
Statt wöchentliche Predictions → tägliche. Das vervielfacht die Samples:
17J × 252 Handelstage × 28 Pairs = **~120.000 Samples**. Das reicht für ein
kleines Transformer/LSTM-Modell. ABER: COT-Daten sind wöchentlich → Feature
ändert sich nur 1× pro Woche, Rest ist Interpolation. Saisonalität profitiert
von Daily (Intra-Month-Patterns).

**Empfehlung:** Wenn LightGBM auf Weekly bereits >54% OOS schafft, Daily-DL
ausprobieren. Wenn LightGBM bei ~50% bleibt → DL wird es auch nicht retten,
die Features selbst haben dann keine Edge.

**b) Sequenz-Modell (LSTM/Transformer)**
Statt Punkt-Features → Zeitreihen-Fenster als Input. Z.B. die letzten 13 Wochen
COT-Flow als Sequenz → das Modell lernt MUSTER in der Flow-Entwicklung
(Acceleration, Reversal-Points, Regime-Shifts).

**Architektur-Skizze:**
```
Input: 13W × 15 Features (COT-Flows + OI + Saison-Kontext)
→ 2-Layer LSTM (hidden=64) oder kleiner Transformer (2 Heads, 2 Layers)
→ Dense → Sigmoid → P(LONG) ∈ [0,1]
```

**Framework:** PyTorch (nicht TensorFlow — leichter, besser für kleine Modelle).

**Walk-Forward bleibt Pflicht** — DL ändert nichts an der Validierungs-Methodik.

**c) Zusätzliche Datenquellen für mehr Samples**
- **Rohstoff-Futures COT** (Gold, Öl, Kupfer, Bonds) → gleiche CFTC-Quelle,
  gleiche Logik, mehr Märkte. Trainiert das Modell auf "COT-Flow → Price"
  generell, nicht nur FX.
- **Crypto COT-Äquivalent** (CME Bitcoin/Ethereum Futures haben COT-Daten seit ~2018)
- **Achtung:** Transfer Learning von Rohstoffen auf FX ist nicht garantiert.
  Separate Evaluation nötig.

**Entscheidungspunkt:** Nach Phase 1+2 die LightGBM-Ergebnisse auswerten. Wenn
OOS-Winrate >54% → Features haben Edge, DL kann sie potenziell besser extrahieren.
Wenn ~50% → Features überdenken, nicht blind DL draufwerfen.

---

## Phase 4: Regime-Drift-Erkennung

### ⬜ 4.1 Model Performance Monitor

**Was:** Automatisch erkennen wenn das ML-Modell nicht mehr funktioniert.

**Umsetzung:**
- Jede Woche: ML-Prediction speichern → nach N Wochen gegen tatsächlichen Close
  vergleichen → Rolling-OOS-Winrate der letzten 13 Wochen berechnen.
- Supabase-Tabelle `ml_predictions` existiert bereits (aus Phase 1).
- **Schwellen:**
  - Winrate < 48% über 13 Wochen → ⚠️ Warnung "Modell verliert Edge"
  - Winrate < 45% über 13 Wochen → 🔴 Alarm "Retraining dringend empfohlen"
  - Winrate < 45% über 26 Wochen → Modell automatisch deaktivieren (keine
    Predictions mehr bis Retraining)
- **Frontend:** Auf der ML-Seite eine Statusanzeige: grün/gelb/rot mit
  Rolling-Winrate-Sparkline.
- **Telegram:** Bei Schwellenbruch → Alert "ML-Modell Performance-Warnung:
  OOS-WR 46.2% über 13 Wochen — Retraining prüfen."

**Bonus — Feature Importance Drift:**
- Feature Importance des aktuellen Modells vs. eines neu trainierten Modells
  vergleichen. Wenn sich die Top-5-Features stark verschieben → die Marktstruktur
  hat sich geändert (z.B. COT verliert Bedeutung weil Zentralbanken dominieren).

---

## Phase 5: Smart Alert System

### ⬜ 5.1 Priorisierte Telegram-Alerts

**Abhängigkeit:** Phase 1.1 (ML-Modell muss Predictions liefern)

**Aktuell:** GVA-Hit → Telegram "🚨 GVA LINE HIT! Pair, Level, Typ". Alle gleich.

**Neu:** GVA-Hit + Fundamental-Confluence + ML-Confidence = priorisierter Alert.

**Alert-Stufen:**

```
🟢 A-SETUP (sofort ansehen):
   GVA-Hit + ML-Confidence ≥58% + ≥3 Faktoren aligned + Saison unterstützt
   
🟡 B-SETUP (bei Gelegenheit prüfen):
   GVA-Hit + ML-Confidence ≥54% + ≥2 Faktoren aligned
   
⚪ C-SETUP (nur zur Kenntnis):
   GVA-Hit + Fundamentals neutral oder konträr
```

**Telegram-Format (A-Setup):**
```
🟢 A-SETUP — GVA SHORT HIT

Pair:     EUR/USD
Level:    1.08432
Gebildet: 28.04.2026

📊 Fundamentals (4/5 aligned):
  ✓ Zins    SHORT  (EUR 3.75% vs USD 5.25%)
  ✓ COT     SHORT  (Flow -6.2% OI, 5W Streak)
  ✓ Saison  SHORT  (Mai hist. −0.45%, 68% HR)
  ✓ Yield   SHORT  (Spread −0.32pp, 3M ↓)
  ✗ Retail  NEUTRAL

🤖 ML-Confidence: 62% SHORT

⚠️ Exposure: kein offener EUR-Trade
```

**Umsetzung:**
- Im Live-Preis-Loop (`main.py`, `evaluate_pair()`): bei HIT → ML-Prediction
  abrufen (GET `/ml/predict`) + Fundamental-Snapshot laden → Alert-Stufe
  bestimmen → angepassten Telegram senden.
- Konfigurierbar: welche Stufen Alerts senden (z.B. nur A+B, C stumm).

---

## Phase 6: Korreliertes Risiko / Exposure-Warnung

### ⬜ 6.1 Währungs-Exposure-Tracker

**Was:** Erkennen wenn mehrere offene Positionen auf dieselbe Währungswette setzen.

**Logik:**
- Aus dem Trading Journal (Supabase) die offenen Positionen lesen.
- Pro Währung: Netto-Exposure berechnen.
  - EUR/USD SHORT + EUR/GBP SHORT + EUR/JPY SHORT = 3× EUR-Short-Exposure
  - AUD/USD LONG + AUD/NZD LONG = 2× AUD-Long-Exposure
- **Warnschwellen:**
  - ≥2 Positionen gleiche Währungsrichtung → ℹ️ Info
  - ≥3 Positionen gleiche Währungsrichtung → ⚠️ Warnung
  - ≥4 Positionen → 🔴 "Klumpenrisiko — effektiv 1 Trade mit 4× Risiko"

**Wo anzeigen:**
- Dashboard/Cockpit: Exposure-Badge neben jeder Währung
- Telegram: bei neuem GVA-Hit + Trade-Signal → Exposure-Warnung mitschicken
  (siehe Alert-Format oben: "⚠️ Exposure: bereits 2 EUR-Short-Positionen offen")
- Korrelationsmatrix: Heatmap der Pair-Korrelationen (1M Rolling), damit Kerim
  sieht welche Pairs gerade besonders synchron laufen.

---

## Phase 7: Personal-ML (Feedback-Loop)

### ⬜ 7.1 Trade-Outcome-Tracker mit ML-Feedback

**Abhängigkeit:** ≥50 geloggte Trades mit Fundamental-Snapshot (ca. 6 Monate Trading)

**Idee:** Ein zweites ML-Modell das nicht generisch "COT → Direction" lernt, sondern
spezifisch "COT + Saison + Kerim-hat-Trade-genommen → Win/Loss".

**Warum das ein anderer Datensatz ist:**
Kerims diskretionärer Filter (BOS + Fib + Volume) IST selbst ein Signal. Wenn er
einen Trade nimmt, hat er implizit bestätigt: "Struktur passt." Das korreliert mit
dem Outcome — aber dieses Signal existiert im generischen Backtest nicht.

**Umsetzung (erst nach genug Daten):**
- Jeder Trade im Journal bekommt den vollständigen Feature-Vektor zum Entry-Zeitpunkt
  (alle ~50 ML-Features + Fundamental-Verdict + ML-Confidence + Risk-Regime).
- Nach 50+ Trades: Logistische Regression (nicht LightGBM — zu wenig Daten für
  Bäume) trainieren: welche Feature-Kombinationen korrelieren mit Kerims Wins?
- Output: "Dein persönliches Edge-Profil" — z.B. "Deine WR ist 71% wenn COT-Flow
  >+8 UND Saison aligned, aber nur 42% wenn du gegen den Yield-Trend tradest."
- Das ist kein Predictions-Modell, sondern ein **Spiegel** — es zeigt Kerim seine
  eigenen Stärken und Schwächen quantifiziert.

**Wachstum:**
- 50 Trades → erste Muster (Logistische Regression)
- 150 Trades → stabilere Ergebnisse (Random Forest möglich)
- 500+ Trades → echtes Personal-ML (LightGBM auf seinen Entscheidungen trainiert)

---

## Übersicht: Reihenfolge & Abhängigkeiten

```
Phase 1.1  ML-COT-Modell ──────────┐
   ↓                                │
Phase 1.2  Replay-Tool              │
   ↓                                │
Phase 2    Saisonalität 2.0 ────────┤ (Features ins Modell)
   ↓                                │
Phase 3    Deep Learning? ──────────┤ (nur wenn LightGBM Edge zeigt)
   ↓                                │
Phase 4    Regime-Drift ────────────┤ (braucht laufende Predictions)
   ↓                                │
Phase 5    Smart Alerts ────────────┘ (braucht ML-Predictions + Fundamentals)
   ↓
Phase 6    Exposure-Warnung (unabhängig, jederzeit baubar)
   ↓
Phase 7    Personal-ML (braucht 6+ Monate Trade-Daten)
```

**Zeitschätzung (grob):**
- Phase 1: läuft / 1 Woche
- Phase 2: 2–3 Tage (Feature-Engineering + Retraining)
- Phase 3: Entscheidungspunkt nach Phase 2, dann 1–2 Wochen
- Phase 4: 1 Tag (einfaches Monitoring)
- Phase 5: 2–3 Tage (Alert-Logik + Telegram-Format)
- Phase 6: 1–2 Tage (Exposure-Berechnung + UI)
- Phase 7: erst in 6+ Monaten relevant
