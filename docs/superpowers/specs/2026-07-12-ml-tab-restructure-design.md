# ML-Tab-Umbau: Training-Tab, Labor-Verdict, Nav-Collapse

Stand: 2026-07-12. Vorstufe: Nav-Fix (Journal/ML/Markt-Scanner einklappbar) bereits umgesetzt
(`components/layout/nav.ts`, `collapsible: true` ergänzt).

## Problem

- Training-Einstieg doppelt: `TrainingButton` (eigenständiger Poll) auf `/ml/modell`, UND
  ein zweiter, unabhängiger Button+Poll eingebettet in `MlModelPanel` auf `/ml`. Zwei
  Zustände, zwei Intervalle, kein gemeinsamer Ort.
- `/ml` ("Daten-Check") vermischt System-Health (Backtest-Bereitschaft, Datenquellen,
  Snapshot-Qualität) mit dem live ML-Modell-Panel — unübersichtlich, falscher Ort.
- `/ml/labor` (`LaborExplorer.tsx`, 679 Zeilen) stapelt Filterleiste, Walk-Forward-Composite,
  Auswahl-Kennzahlen, Heatmap, Bestenliste, Pair-Tabelle alle untereinander — viel Scrollen,
  kein klarer Einstiegspunkt. Die Bestenliste sortiert nur nach Winrate, ohne gegen Overfit zu
  prüfen (das macht nur der manuell ausgewählte Walk-Forward-Composite-Block).
- Kein Pendant zu `SeasonVerdict.tsx` (autom. Urteil statt Selbst-Interpretation) für Labor
  oder Training.

## Ziel

Fünf klar getrennte ML-Unterseiten, Training an einem Ort, Labor liefert automatisch ein
robustes Urteil statt nur Rohzahlen.

## Nav-Reihenfolge (Machine Learning Gruppe)

1. `/ml/training` (NEU)
2. `/ml/labor`
3. `/ml/season`
4. `/ml/modell` (Anleitung)
5. `/ml` (Daten-Check)

## /ml/training (neu)

Neue Seite + Komponente `components/ml/TrainingPanel.tsx`, ersetzt den Live-Teil von
`MlModelPanel.tsx` (Predictions, Walk-Forward-Report, Feature Importance, Training-Button)
sowie `TrainingButton.tsx`. Einziger Ort mit Trainings-Zustand/Poll.

Neu: **Auto-Verdict** oben, ein Satz aus `report.summary`:
- `oos_high_conf_wr` vorhanden, n ausreichend (≥30) und Abstand zu 50 % signifikant
  (`|wr-0.5| > 1.96·sqrt(0.25/n)`, gleiche Formel wie in Labor/Season) →
  „Edge im High-Confidence-Bereich: X % (n=Y).“
- sonst `oos_acc` signifikant ≠ 50 % → „Schwache Gesamt-Edge: X %.“
- sonst → „Keine Out-of-Sample-Edge (~50 %) — Modell findet aktuell kein Muster.“

`/ml/modell` (Anleitung): `<TrainingButton />`-Einbettung in Step 1 raus, stattdessen Link/
Verweis „→ Training starten auf /ml/training“. Rest der Erklärseite unverändert.

`/ml` (Daten-Check): `<MlModelPanel />`-Panel komplett raus. Seite bleibt reine System-Health
(Backtest-Bereitschaft, Backtest-Panel Weekly-Outlook, Datenquellen, Snapshot-Qualität).

## /ml/labor — Restructure

Filterleiste bleibt oben, unverändert, immer sichtbar (steuert alle Sub-Tabs).

**Sub-Tabs** (client-seitig, gleiches Button-Segment-Muster wie Filter):
- **Übersicht**: Labor-Verdict (neu) + Walk-Forward-Composite-Block (bestehend, für die
  manuell gewählten Faktoren) + Auswahl-Kennzahlen-Kacheln (bestehend).
- **Heatmap**: Währung×Faktor (bestehend, unverändert).
- **Bestenliste**: Leaderboard (bestehend), erweitert um Spalte „Robust“ und Sortier-
  Umschalter: Robustheit (Default) / Winrate / Ø Rendite / n.
- **Pair-Tabelle**: bestehend, unverändert.

Fussnote (Kombi-Regel-Erklärung) bleibt einmalig unten, unabhängig vom aktiven Sub-Tab.

**Labor-Verdict (neu, Übersicht-Tab):** Scannt automatisch alle 31 Faktor-Kombinationen des
aktuellen Filters (Horizont, Zeitraum, Match-Modus) — nicht nur die manuell angehakte
Auswahl. Für jede Kombi wird per Split (`splitPct`, gleicher Regler wie Walk-Forward) IS/OOS
getrennt berechnet (gleiche `matchDirection`-Logik wie im bestehenden Leaderboard, nicht der
z-Score-Composite — Robustheit soll auf derselben Basis wie die Bestenliste stehen).

Eine Kombi gilt als **robust**, wenn:
1. `oosStat.n ≥ minN` UND `isStat.n ≥ minN`,
2. `oosStat.sig === true` (95 %-Signifikanz gegen Münzwurf im OOS-Teil),
3. `oosStat.wr ≥ isStat.wr - 2` (hält out-of-sample, kein Einbruch — gleiche 2pp-Schwelle wie
   im bestehenden Walk-Forward-Composite-Block).

Verdict-Text:
- Mind. 1 robuste Kombi → „Robusteste Kombi: **{Kombi}** — OOS {wr}% (n={n}), hält IS→OOS.“
  plus Hinweis „{k} von 31 Kombinationen robust“ falls mehrere.
- Keine robust → „Keine Kombination hält der IS→OOS-Prüfung stand (aktueller Filter) —
  Overfit-Gefahr bei jeder Einzelauswahl.“

Bestenliste-Tab nutzt dieselbe Berechnung: Spalte „Robust“ (✓/—), Sortierbutton „Robustheit“
sortiert robuste zuerst (dann nach WR).

## Nicht Teil dieses Umbaus

- Keine Backend-/API-Änderungen (kein neuer Endpoint, `/api/ml/matrix` unverändert).
- Keine Änderung an Season-Modul (`/ml/season`, `SeasonVerdict.tsx`) — bleibt wie ist.
- Keine Änderung an Berechnungslogik von Backtest/Health auf `/ml`.
- Seasonality-Datenquelle (Seasonax o.ä.) — eigenes, separates Thema, nicht Teil dieses Specs.

## Betroffene Dateien

- `components/layout/nav.ts` (Reihenfolge ML-Gruppe)
- `app/(app)/ml/training/page.tsx` (neu)
- `components/ml/TrainingPanel.tsx` (neu, ersetzt Live-Teil von MlModelPanel + TrainingButton)
- `app/(app)/ml/modell/page.tsx` (TrainingButton-Embed raus, Link rein)
- `app/(app)/ml/page.tsx` (MlModelPanel-Panel raus)
- `components/ml/LaborExplorer.tsx` (Sub-Tabs, Labor-Verdict, Bestenliste-Sortierung)
- `components/ml/MlModelPanel.tsx`, `components/ml/TrainingButton.tsx` — Inhalt wandert nach
  `TrainingPanel.tsx`, alte Dateien danach löschen (kein toter Code).
