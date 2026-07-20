# Konzept: Real-Yield-Valuation (Bias-Tool)

> Stand: 2026-07-16 · Bezug: Task #6 „Score erweitern: Real Yield / Zins-Erwartung"
> Auslöser: Harun-Video (Voltrix Desk, voltrixdesk.com) — Real Yield fürs Swingtrading-Bias.

## Ziel
Eine **Real-Yield-Valuation-Ansicht** als fundamentales Bias-/Konfluenz-Tool — nicht als sofort
gescorter Faktor. Zeigt je Währung den realen Zinsvorteil und dessen Trend, um „stark gegen
schwach" zu handeln.

## Fundamentale Basis (validiert korrekt)
- **Real Yield = Nominalzins − Inflation.** Steigt der Realzins, steigt die Nachfrage nach der
  Währung (höhere reale Rendite zieht Kapital an). Einer der zuverlässigsten FX-Treiber.
- **Relativ betrachten:** immer starken gegen schwachen Real Yield vergleichen (FX ist relativ).
- **Trend zählt:** nicht nur das Level, auch die Richtung des Real Yield über 6–12 Monate.
- **Carry-Fallback:** wenn kein klarer Stark/Schwach-Fall vorliegt, auf die Zins-/Carry-Situation
  zurückgreifen.

## Vier Präzisierungen (Kritik / Grenzen)
1. **Level vs. Erwartung.** Realized Real Yield (Zins − letzte CPI) lag-t an Wendepunkten. Der Markt
   handelt *erwartete* Realzinsen (Breakevens/Inflationserwartung). Der Trend mildert das, aber die
   Grenze kennen.
2. **Auf dem echten Paar bestätigen.** Für den Trade zählt die Real-Yield-*Differenz des konkreten
   Paars* und deren Trend — nicht zwei absolute Rankings nebeneinander.
3. **Carry braucht Risk-Filter.** Carry funktioniert in Risk-On, entlädt sich brutal in Risk-Off.
   Nie nackt — mit Risk-Regime-Badge kombinieren.
4. **Display, kein bewiesener Edge.** Plausible Story ≠ gemessene Edge. Deshalb: Konfluenz-Ansicht,
   nicht sofort in den Score. Als *gescorter* Faktor nur über Suchraum + Walk-Forward-Validierung.

## Umsetzung (Ansicht)
Pro Währung anzeigen:
- Leitzins (nominal)
- CPI YoY
- Real Yield (Zins − CPI)
- Real-Yield-Trend/Slope (6–12M)
- Sortierung stark → schwach (Ranking)

Für ein gewähltes Paar:
- Real-Yield-Differenz des Paars + deren Trend
- Carry-Situation (Zinsdifferenz)
- Risk-Regime-Badge (damit Carry nicht blind genutzt wird)

Einordnung: **Bias-/Kontext-Display neben dem Ranking**, nicht als neuer Score-Faktor.

## Prerequisite (Blocker zuerst lösen)
- **CPI-Datenquelle fixen.** Laut Audit sind die Nicht-US-CPI-Serien tot/stale (`fredSeries.ts`).
  Ohne saubere CPI je Währung ist jede Real-Yield-Ansicht Garbage-in. → CPI-Quelle je Währung
  reparieren, bevor die Ansicht gebaut wird.

## Später (optional, validierungs-gebunden)
- Real Yield als **gescorten Faktor** in den ML-Suchraum aufnehmen (nicht in die Baseline
  hardcoden), Datenverfügbarkeit je Währung prüfen, nur behalten wenn er sich im Walk-Forward
  verdient. Real Yield ist besser backtestbar als OIS-Erwartungen → ggf. zuerst.
