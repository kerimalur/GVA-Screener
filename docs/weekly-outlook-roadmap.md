# Weekly-Outlook-Roadmap — Forex (28 Pairs) & Bitcoin

> **Status 2026-07-05: Schritte 1–7 implementiert** (Build + Lint grün).
> Offen: (a) Setup ausführen — `supabase/schema.sql` + `seed.sql` erneut im SQL-Editor,
> dann `npx tsx scripts/backfill.mts cot` (TFF + BTC-COT), `… prices` (BTC_USD),
> `… fred` (Realrenditen/Breakevens/Ersatzserien); (b) Schritt 3d Backend/macro.py
> (Δ-Kennzahlen auch über `/api/fundamentals`) — bewusst zurückgestellt, Frontend
> berechnet alles selbst.

> Ersetzt den alten Bauplan (`haben-wir-nun-alles-zippy-fog.md`).
> Fokus: **ausschließlich 28 Forex-Paare + BTC/USD**. Keine Aktien, kein PEAD, keine Earnings.
>
> **Kern-These:** Das absolute Niveau ist zweitrangig. Momentum (Flow/Δ) und Zinsdifferenzen
> dominieren FX und Krypto. Erst das Datenfundament härten, dann das Cockpit bauen.

---

## Teil A — Bestandsaufnahme (Ist-Zustand, code-verifiziert)

### Vorhandene Basis

| Quelle | Liefert | Rhythmus | Status |
|---|---|---|---|
| OANDA | Tageskerzen aller Pairs + Gold/Öl/Kupfer/SPX | täglich (Cron) | ✅ stabil |
| CFTC Legacy | COT futures-only, 13 Contracts ([cftcContracts.ts](../frontend-next/lib/constants/cftcContracts.ts)) | wöchentlich | ⚠️ falscher Report für FX (s. Schritt 2) |
| FRED | Leitzinsen G8, 10Y G8, US-2Y, CPI, Arbeitslosigkeit, GDP, CLI, Handelsbilanz, VIX ([fredSeries.ts](../frontend-next/lib/constants/fredSeries.ts)) | täglich (Cron) | ⚠️ OECD-Serien evtl. stale (s. Schritt 1) |
| Myfxbook | Retail-Sentiment je Pair | Snapshots (wachsen erst) | ✅ |
| ForexFactory | Wirtschaftskalender | wöchentlich | ✅ |
| CB-Stance / CB-Meetings | Zentralbank-Bias + Termine | manuell (Supabase) | ✅ vorhanden, Pflegehürde hoch |
| GVA-Backend (FastAPI) | Live-Loop, Makro-Score, Fundamentals-API ([Backend/macro.py](../Backend/macro.py), [fundamentals.py](../Backend/fundamentals.py)) | live | ✅ stabil |

### Korrekturen gegenüber der bisherigen Annahme

1. **G10-10Y-Renditen sind bereits im Katalog** — [fredSeries.ts:36-43](../frontend-next/lib/constants/fredSeries.ts#L36-L43)
   führt DE (Bund, EUR-Proxy), UK, JP, CH, AU, NZ, CA über OECD-Serien (`IRLTLT01…`).
   **Aber:** FRED hat viele OECD-Serien 2023/24 eingestellt; der Backfill markiert tote Serien
   in `fred_series_meta.is_stale`. Die Lücke ist also kein fehlender Katalog-Eintrag,
   sondern **potenziell veraltete Daten**. Schritt 1 ist deshalb ein Audit + Ersatz, kein Neubau.
2. **BTC fehlt komplett** — weder in [instruments.ts](../frontend-next/lib/constants/instruments.ts)
   noch in [cftcContracts.ts](../frontend-next/lib/constants/cftcContracts.ts). CME-Bitcoin-Future
   (CFTC-Code `133741`) ist in Legacy- **und** TFF-Report enthalten; OANDA bietet `BTC_USD` als CFD.

### Echte Lücken (FX/BTC-relevant)

- **US-Realrenditen & Breakevens fehlen** (DFII10, T5YIE/T10YIE) → Haupttreiber für Gold/BTC.
- **Legacy-COT verwässert FX-Daten**: „Non-Commercials" mischt Hedgefonds und Asset Manager.
- **Alles testet Niveaus, nichts testet Δ** — Backtest ([cotBacktest.ts](../frontend-next/lib/calc/cotBacktest.ts)) nur Perzentil-Extreme, Screener ([screenerReasoning.ts](../frontend-next/lib/calc/screenerReasoning.ts)) überwiegend Niveau-Logik.
- **Keine Bündelung**: Top-Down-Analyse für Sonntagabend über 8 Terminal-Seiten verteilt; Outlook-Wizard-Step „Fundamental" ist leerer Freitext ([OutlookWizardModal.tsx](../frontend-next/components/journal/OutlookWizardModal.tsx)).
- **Options-/Risk-Reversal-Daten**: keine freie Quelle — dokumentierte Dauer-Lücke.

---

## Teil B — Nummerierte Ausführungsschritte (strikt priorisiert)

## Phase 1 — Datenfundament härten

### 1. G10-Zins-Audit, Ersatzserien & US-Breakevens/Realrenditen — **höchste Prio**

**Was:**
- a) Audit: `fred_series_meta.is_stale` auswerten — welche der `IRLTLT01…`-10Y-Serien und
  `IRSTCI01…`-Geldmarktserien liefern noch frische Werte?
- b) Tote Serien ersetzen (Kandidaten je nach Verfügbarkeit: alternative FRED-IDs,
  ECB Data Portal für Bund/EUR, direkte Notenbank-APIs; Entscheidung pro Währung im Audit).
- c) Neu aufnehmen: `DFII10` (US 10Y TIPS-Realrendite), `T10YIE`/`T5YIE` (Breakevens),
  optional `DGS2`-Pendants soweit verfügbar.

**Warum:** Der FX-Markt wird nahezu vollständig durch Zinsdifferenzen (UIP) getrieben.
Ohne verlässliche 10Y-Serien aller G8-Währungen ist automatisierte Pair-Selection
(z. B. EUR vs. JPY) unmöglich. Realrenditen steuern Gold-/BTC-Flüsse.

**Wo:** [fredSeries.ts](../frontend-next/lib/constants/fredSeries.ts), Cron
[app/api/cron/daily/route.ts](../frontend-next/app/api/cron/daily/route.ts),
Supabase `fred_series` / `fred_series_meta`.

**Aufwand:** Mittel (Audit klein; Aufwand hängt an Zahl der toten Serien).

---

### 2. COT-Upgrade auf TFF-Report & Bitcoin-Integration

**Was:**
- a) CFTC **TFF-Report** („Traders in Financial Futures") zusätzlich zum Legacy-Report ziehen —
  gleiche Socrata-API, anderes Dataset, andere Spaltenstruktur
  (Dealer / Asset Manager / **Leveraged Funds** / Other).
- b) Neue Tabelle `cot_tff_reports` (Legacy bleibt für Kontinuität und Gold/Öl/Kupfer bestehen).
- c) BTC integrieren: CFTC-Code `133741` in [cftcContracts.ts](../frontend-next/lib/constants/cftcContracts.ts),
  `BTC_USD` in [instruments.ts](../frontend-next/lib/constants/instruments.ts), OANDA-Preisbackfill.
- d) BTC in bestehende Makro-Logik als Risk-Asset einhängen (Risk-Gauge, US-Realrendite aus Schritt 1).

**Warum:** Legacy wirft im FX alles in den Topf „Non-Commercials". TFF isoliert
**Leveraged Funds** (Hedgefonds) — der präziseste Indikator für aggressives Momentum-Kapital
in Forex und Bitcoin.

**Wo:** Cron [app/api/cron/daily/route.ts](../frontend-next/app/api/cron/daily/route.ts),
[lib/data/cot.ts](../frontend-next/lib/data/cot.ts), neue Supabase-Migration.

**Aufwand:** Mittel.

---

### 3. Berechnungen komplett Δ-zentriert umbauen

**Was:**
- a) **COT-Flow statt Niveau:** 1W- und 4W-Delta der Leveraged-Funds-Nettoposition,
  jeweils normiert in % des Open Interest + Δ-Perzentil (wie ungewöhnlich vs. 5 Jahre).
- b) **Zins-Drehung:** Yield-Spread-Veränderung je Pair über 4/12 Wochen als eigene Kennzahl
  (nicht nur Niveau-Differenz).
- c) Screener-Faktoren ([screenerReasoning.ts](../frontend-next/lib/calc/screenerReasoning.ts))
  auf die neuen Δ-Kennzahlen umstellen: COT-Faktor = Δ-basiert, Yield-Faktor = Drehung
  (Niveau bleibt als Kontext-Text erhalten).
- d) Backend-Loop ([Backend/macro.py](../Backend/macro.py)) liefert dieselben Δ-Kennzahlen
  über `/api/fundamentals` mit aus, damit Journal/Signals sie sehen.

**Warum:** Konstanter Zufluss über Wochen = institutionelle Akkumulation — der zuverlässigste
Trend-Katalysator im Swingtrading. Ein Niveau-Extrem kann monatelang extrem bleiben (Crowded
Trade); das Signal entsteht, wenn das Δ kippt.

**Wo:** [Backend/macro.py](../Backend/macro.py),
[screenerReasoning.ts](../frontend-next/lib/calc/screenerReasoning.ts),
[lib/data/cot.ts](../frontend-next/lib/data/cot.ts) (neue Aggregat-Query),
[CotSnapshotTable.tsx](../frontend-next/components/cot/CotSnapshotTable.tsx) (Δ-Einordnung statt Rohzahl).

**Aufwand:** Hoch.

---

## Phase 2 — Operative Kommandozentrale (Sonntagabend)

### 4. Weekly-Outlook-Cockpit (neue Seite `/weekly`)

**Was:** Neue Seite mit einer **Dossier-Karte pro Pair (28 + BTC/USD)**:
- COT-Δ-Gegenüberstellung beider Währungen (aus Schritt 3), farbcodiert + Δ-Perzentil
- Zinsdifferenz-Trend (Drehung, nicht nur Niveau)
- High-Impact-Events der kommenden Woche für beide Währungen (ForexFactory + `cb_meetings`)
- Saisonalität aktueller Monat, Retail-Sentiment inkl. Δ zur Vorwoche
- Aggregierter fundamentaler Bias → **Matrix-Sortierung nach Signalstärke**
- BTC-Karte: Risk-Gauge, US-Realrendite-Trend, TFF-Leveraged-Funds-Δ

**Warum:** Ersetzt das Suchen über 8 Tabs; digitalisiert die Top-Down-Wochenendanalyse.
Sonntagabend eine Seite öffnen, sortiert nach stärkstem Bias arbeiten.

**Wo:** Neu `frontend-next/app/(app)/weekly/page.tsx` + Komponenten unter
`components/weekly/`; Daten via `unstable_cache` wie Dashboard/COT-Seite.

**Aufwand:** Hoch. **Abhängig von Schritt 1–3** (sonst zeigt das Cockpit Niveau-Müll).

---

### 5. Outlook-Wizard-Autofill & Event-Drift-Filter

**Was:**
- a) Button „Fundamental übernehmen" auf der Dossier-Karte → öffnet Outlook-Wizard mit
  vorbefülltem „Fundamental"-Step (Text-Snippets aus Screener-Faktoren + COT-Δ + Events;
  Muster: `fundamentalsNote()` in [lib/journal/fundamentals.ts](../frontend-next/lib/journal/fundamentals.ts)).
- b) Event-Drift-Filter im Cockpit: CPI / NFP / Zinsentscheide der Vorwoche markieren
  Währungen als „in Play" (Post-Event-Drift erzeugt wochenlange FX-Trends).

**Warum:** Der Outlook-Wizard-Step „Fundamental" ist heute leerer Freitext — Medienbruch.
Montags muss reaktiv klar sein, welche Währung fundamental „in Play" ist.

**Wo:** [OutlookWizardModal.tsx](../frontend-next/components/journal/OutlookWizardModal.tsx),
[lib/journal/fundamentals.ts](../frontend-next/lib/journal/fundamentals.ts), Cockpit-Karte.

**Aufwand:** Gering (nach Schritt 4).

---

## Phase 3 — Validierung & Edge Analytics

### 6. COT-Δ-Backtest & Basisraten-Validierung

**Was:**
- a) Neuer Backtest-Modus in [cotBacktest.ts](../frontend-next/lib/calc/cotBacktest.ts):
  Signal = ungewöhnlich großes Wochen-/4-Wochen-Δ (Δ-Perzentil ≥ Schwelle) statt Niveau-Extrem.
- b) Jede Statistik erhält eine **Basisrate**: unconditional Ø-Return desselben Horizonts
  → ausgewiesene „Edge" = Signal-Return minus Basisrate.
- c) Automatisches Klartext-Fazit + Ampel (belastbar / schwach / n zu klein) im
  [BacktestPanel.tsx](../frontend-next/components/cot/BacktestPanel.tsx).
- d) Läuft für Legacy (lange Historie) **und** TFF (kürzer, präziser) — Umschalter im Panel.

**Warum:** Die These „nur die Veränderung zählt" muss **pro Contract empirisch beweisbar**
sein, nicht Bauchgefühl. Ohne Basisrate ist jeder Backtest-Wert bedeutungslos.

**Wo:** [cotBacktest.ts](../frontend-next/lib/calc/cotBacktest.ts),
[BacktestPanel.tsx](../frontend-next/components/cot/BacktestPanel.tsx),
API-Route `app/api/data/cot/backtest`.

**Aufwand:** Mittel.

---

### 7. Conditional-Outcome-Panel (Konfluenz-Tool auf Pair-Ebene)

**Was:** Modul in der Pair-Detailansicht: „Wenn Zinsdifferenz-Drehung positiv **und**
COT-Δ stark positiv → historischer Forward-Return 4/8/12 Wochen: Ø X %, Median Y %, n Z."
Bewusst **nur 2 Faktoren** (≈260 Wochenpunkte, mehr Dimensionen = zu dünn), n immer ausweisen,
Basisrate aus Schritt 6 wiederverwenden.

**Warum:** Asymmetrie entsteht durch Konfluenz unabhängiger Datenpunkte. Das Panel beantwortet
direkt: „Bei dieser Konstellation passierte historisch was?"

**Wo:** Pair-/COT-Detailseite (`app/(app)/cot/[code]` bzw. Cockpit-Karte aufklappbar),
neue Calc-Lib `lib/calc/conditionalOutcome.ts`.

**Aufwand:** Mittel.

---

## Reihenfolge & Abhängigkeiten

```
1 (FRED-Audit) ──┐
2 (TFF + BTC) ───┼──► 3 (Δ-Kennzahlen) ──► 4 (Cockpit) ──► 5 (Autofill)
                 └──────────────────────► 6 (Δ-Backtest) ─► 7 (Conditional)
```

- 1 und 2 sind unabhängig, parallelisierbar.
- 3 braucht 1 + 2 (Δ auf TFF-Daten, Spread-Drehung auf frischen Renditen).
- 4/5 und 6/7 sind zwei getrennte Stränge nach 3.

## Bewusst gestrichen (Aktien-Erbe)

- PEAD-/Earnings-Logik, Float/Volumen-Screening, Aktien-Gap-Saisonalität.
- Wochentagsanomalien nur noch als FX-Liquidity-Sweeps (z. B. Montag nach Weekend-Gap) —
  optionales Add-on im Cockpit, kein eigener Schritt.
