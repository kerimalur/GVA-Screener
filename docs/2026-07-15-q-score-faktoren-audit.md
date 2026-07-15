# Audit: Fundamental-Faktoren im Q-Score

Datum: 2026-07-15 · Reines Read-Audit, **kein Code verändert**.

Repo-Hinweis: Die Engine liegt im **GVA-Screener** (nicht FX-Terminal); FX-Terminal hat nur
die alten EUR/USD-Wochen-Scores als Datenbestand.

## Kernbefund

Der **live Q-Score ist heute exakt: `0.5 · Zins-Score + 0.5 · Saison-Score`** — sonst nichts.
`ml_champion` ist leer → `Backend/ml_engine/run_weekly.py` fällt auf `BASELINE_CFG` zurück
(`Backend/ml_engine/baseline.py:12-15`). COT-Features existieren im Panel und im ML-Suchraum,
fließen aber erst in den Live-Score, wenn je ein COT-Modell zum Champion befördert wird.
Alles andere (Inflation, CB-Stance, Retail, Meetings) ist Anzeige-Schicht im Macro Terminal.

## Faktor-Tabelle

| # | Faktor | Status | Code-Beleg | Verwendung | Quelle |
|---|--------|--------|-----------|------------|--------|
| 1 | Zins-Level + Momentum | ✅ **im Score** | `_rates_features`, `Backend/macro_features/panel.py:162-194` | `rates_score = 0.5·Differenz zum Ø der anderen 7 (±2 pp→±1) + 0.5·6M-Momentum (±100 bps→±1)`; davon 50 % im Baseline-Score | FRED Policy Rates (FEDFUNDS, ECBDFR, OECD-Serien), 42-Tage-Publikationslag |
| 2 | Zins-**Erwartungen** (markt-gepreist) | ❌ **nur Anzeige** | `cb_meetings.expected_change_bps` → `frontend-next/lib/data/terminal.ts:382`, `frontend-next/lib/data/weekly.ts:228`; CB-Stance `frontend-next/lib/calc/cbStance.ts` (60 % **manueller** Score + 40 % 6M-Trajektorie) | Kein OIS/Forward-Feed. `expected_change_bps` ist eine handgepflegte Tabelle, kein Markt-Preis. Geht in Macro-Terminal-Zinsen-Sub (`currencyScore.ts:91-112`) = Kontroll-Anzeige, **nicht** Q-Score | manuell (Supabase `cb_meetings`/`cb_stance`) |
| 3 | Inflation | ❌ nur Anzeige | `cpiYoY` + `classifyRegime`, `frontend-next/lib/data/terminal.ts:126-140` — Kommentar dort explizit: „reine ANZEIGE, kein Score-Beitrag" | CPI-Index→YoY, Regime-Label (Goldilocks/Stagflation …) | FRED CPI — **Nicht-US-Serien tot/stale** (Audit-Kommentar `fredSeries.ts:60-62`) |
| 4 | Reale Zinsdifferenz (Nominal − Inflation) | ❌ **fehlt komplett** | nirgends berechnet (nur US-TIPS `real_10y` als Marktserie für Gold/BTC) | — | — |
| 5 | Arbeitsmarkt | ❌ nur Anzeige | `unemployment`-Serien `fredSeries.ts:73-81`, Terminal-Datenzentrum | Level-Anzeige; teils Quartals-/stale-Serien | FRED/OECD |
| 6 | Wachstum/BIP | ❌ nur Anzeige | `gdp`-Serien + OECD-CLI als Wachstums-Proxy im Regime (`terminal.ts:131-139`) | Anzeige/Regime-Label | FRED/OECD (stale-tolerant) |
| 7 | COT (Level + Extrem) | ⚠️ **Panel ja, Live-Score nein** | `_cot_features`, `panel.py:95-143`: Nets, 1W-Deltas, `comm_z` (17J-z), `comm_net_pct156` (Perzentil), Divergenz, OI, TFF; Gruppen `ml_engine/models.py:7-20` | Level UND Extrem (z-Score, Perzentil) — aber nur im ML-Suchraum; Baseline nutzt sie nicht. Labor-Befund: COT-NC allein **schädlich** (48.9→46.7 %). Anzeige: COT Intelligence + Terminal-Flow (4W-Δ %OI) | CFTC Legacy+TFF, 3-Tage-Release-Lag |
| 8 | Economic Surprise | ❌ **Rohdaten da, kein Faktor** | `calendar_events.actual/forecast/previous` (`lib/supabase/types.ts:84-86`), ForexFactory-Cron | Nur Event-Anzeige; kein Surprise-Index, keine Aggregation je Währung | ForexFactory; Historie erst seit Projektstart 2026 |
| 9 | Risk-On/Off-Regime | ❌ gebaut, ungenutzt für FX | `frontend-next/lib/calc/riskGauge.ts`: 30 % VIX-Perzentil + 20 % Gold + 25 % JPY/CHF-Stärke + 25 % SPX vs 50d-MA | Nur für **BTC-Bias** in `weekly.ts`. STATUS.md: bewusst offen („#3 Regime-Filter: erst im Labor testen") | OANDA/FRED |
| 10 | Rohstoff/Terms-of-Trade (AUD/NZD/CAD) | ❌ fehlt komplett | kein per-Währung-Rohstoff-Faktor (Gold nur global im riskGauge) | — | — |
| 11 | Sentiment | ❌ nur Anzeige/Kontrolle | `retailSub` in `currencyScore.ts` (Ø Retail-Long-% über 7 Pairs, konträr) | Macro-Terminal-Sub, nicht Q-Score. Historie erst ab **2026-07-03** | Myfxbook |
| 12 | Seasonality | ✅ **im Score** | `_season_features`/`_season_lookup`, `panel.py:197-245` | Monats-Saison 17 J, aktiv nur bei ≥12/17 gleicher Richtung, Score = Ø-Return/0.5 % gekappt; 50 % im Baseline-Score | FRED-H.10-FX-Kurse |
| 13 | Relative/paarweise Verrechnung | ⚠️ **hybrid** | Targets korb-demeaned `panel.py:84-87`; Zins vs. Ø der anderen `panel.py:180-188`; Pair-Ebene: `_pair_bias` (`Backend/replay/fundamentals.py`) / `derivePairIdeas` (`lib/ml/ranking.ts`) | Zins ist relativ (vs. G8-Korb), Saison/COT absolut je Währung. Pair = zwei Per-Währungs-Quintile **nebeneinander** (strikt Q5/Q1), keine paarweise Treiber-Differenz (z. B. Zinsdiff EUR−CHF direkt) | — |

## Lückenliste (quantitativ fehlend)

- Markt-gepreiste Zinserwartungen (OIS/Forward)
- Inflation / reale Zinsdifferenz
- Arbeitsmarkt
- BIP/Wachstum
- Economic-Surprise-Index je Währung
- Risk-On/Off-Regime (gebaut, aber nur BTC)
- Rohstoff-Beta / Terms-of-Trade
- Pair-Sentiment
- COT: vorhanden, aber nur latent (ML-Suchraum, nicht im Live-Score)

## Priorisierte Empfehlung (Overfitting-Perspektive)

Hypothese „Zins-Erwartungen + Surprise zuerst" bestätigt sich beim **Fehlen** der Faktoren,
aber die verfügbare Daten-Historie dreht die Reihenfolge:

1. **Risk-Regime als Konditionierungs-Filter** (nicht als eigener Score).
   Einziger Kandidat mit **freier 25J+-Historie** (FRED VIXCLS, SPX, Gold) → im bestehenden
   Purged-Walk-Forward sofort ehrlich testbar. Hypothese: Zins-Faktor läuft in Risk-On besser.
   Geringe Parameterzahl (1 Schwelle) = kleines Overfitting-Risiko. Deckt sich mit dem offenen
   STATUS-Punkt „#3 Regime-Filter".
2. **Zins-Erwartungs-Proxy statt echtem OIS.**
   Echte OIS/STIR-Futures-Historie ist nicht frei verfügbar → nicht backtestbar = nicht als
   Direktkauf empfehlenswert. Testbarer Proxy: kurzlaufende Staatsanleihen-Rendite minus
   Leitzins (Markt preist Pfad). FRED-Abdeckung für G8-2Y ist lückig — erst Datenverfügbarkeit
   je Währung prüfen, dann als Panel-Feature in den **Suchraum** (nicht in die Baseline).
   `cb_meetings` taugt nicht als Quelle: manuell, kein Backfill, Historie Monate.
3. **Economic Surprise: jetzt sammeln, später testen.**
   `calendar_events` speichert actual/forecast bereits — es fehlt nur ein aggregierter
   Surprise-Index je Währung. Aber: Historie beginnt 2026 → **kann sich heute in keinem
   Backtest verdienen**. Empfehlung: Persistenz sicherstellen (Events nicht überschreiben/
   löschen), Index bauen wenn ~1–2 Jahre Daten da sind. Citi-ESI o. ä. ist nicht frei.

Nicht empfohlen: Inflation/Realzins als Score-Faktor, solange die Nicht-US-CPI-Quellen tot
sind (`fredSeries.ts`-Audit) — Datenqualität vor Faktor-Idee.

## Bestätigung

Kein Code verändert — Audit-only.
