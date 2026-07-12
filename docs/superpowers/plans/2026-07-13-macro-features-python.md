# Macro-Feature-Tabelle (Python) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Checkboxen = Fortschritt.

**Goal:** Python-Modul `Backend/macro_features/` — pro G8-Währung 3 Sub-Scores (COT/Zinsen/Saisonalität, je −1…+1) + Rohwerte in einer wöchentlich aktualisierbaren Pandas-Feature-Tabelle, ohne Look-ahead, CSV-exportierbar.

**Architecture:** Eigenständiges Paket, unabhängig von Supabase (lokal kein Service-Key). Public-Quellen mit lokalem CSV-Cache: CFTC Socrata API (Legacy + TFF), FRED CSV (Leitzinsen), Stooq (7 USD-Majors, 17+ Jahre; Kreuze synthetisch). `build_feature_table(as_of)` → DataFrame (8 Zeilen); as-of steuert alle drei Faktoren (Backtest-tauglich).

**Tech:** Python 3.11+, pandas, numpy, requests (alles in Backend/requirements.txt vorhanden). Kein sklearn nötig (Z-Score/Clip via numpy).

---

## Dateien (alle neu, `Backend/macro_features/`)

| Datei | Verantwortung |
|---|---|
| `config.py` | G8-Liste, CFTC-Contract-Codes (aus frontend cftcContracts gespiegelt), FRED-Policy-Rate-IDs, Stooq-Symbole, Lags (COT_RELEASE_LAG_DAYS=3, FRED_PUBLICATION_LAG_DAYS=42), Cache-Pfad `Backend/macro_features/cache/` |
| `data_sources.py` | `fetch_cot_legacy(code)`, `fetch_cot_tff(code)` (Socrata JSON, paginiert), `fetch_fred(sid)` (CSV), `fetch_prices(sym)` (Stooq daily) — je mit File-Cache (max_age 1 Tag) und `as_of`-Filter NICHT hier (roh laden, Filter in Faktoren) |
| `cot_factor.py` | Levels/Δ1W je Kategorie (NonComm, Comm, Retail/NonRept, Dealer aus TFF; fehlend→NaN), Divergenz-Flag (Δcomm vs. Δnoncomm gegenläufig), `comm_z` = Z-Score Comm-Netto über 17J-Rolling-Fenster, Score = clip(−comm_z/2) (contrarian per Spec: extreme Comm-Long → negativ). Look-ahead: nur Reports mit release_date = report_date+3d ≤ as_of |
| `rates_factor.py` | Level, Differenzial vs. Ø der 7 anderen, Momentum = Δ über ~6M, Score = clip(0.5·diff/2 + 0.5·mom/1.0). Look-ahead: FRED-Monatsbeobachtung erst ab obs_date+42d nutzbar (OECD-Lag, Revisionen dokumentiert) |
| `seasonality_factor.py` | Monats-Returns je Währung = Ø ccy-relativer Monatsreturn über 7 Pairs (synthetische Kreuze aus USD-Majors), 12 Buckets, letzte 17 abgeschlossene Jahre vor as_of; Konsistenz = Jahre mit Mehrheitsrichtung; Score nur wenn ≥12/17, sonst 0.0; Score = clip(mean_ret/0.5) |
| `feature_table.py` | `build_feature_table(as_of=None)` → DataFrame: index=ccy, Spalten Sub-Scores + alle Rohwerte + avg_score (nur Sortierschlüssel, Subs bleiben einzeln), sortiert long→short; `to_csv` |
| `__main__.py` | CLI: `python -m macro_features [--as-of 2024-06-01] [--csv out.csv] [--audit]`; `--audit` druckt je Quelle den letzten verwendeten Datenpunkt + Release-Datum (manuelle Look-ahead-Verifikation, Akzeptanzkriterium) |
| `__init__.py` | Re-Export `build_feature_table` |

## Formeln / Konventionen

```
COT:    comm_z = (comm_net − rolling_mean_884w) / rolling_std_884w  (min_periods 156)
        cot_score = clip(−comm_z / 2, −1, 1)          # Spec: Comm extrem long → negativ
        divergence = sign(Δcomm_net) · sign(Δnoncomm_net) == −1
        USD über Dollar-Index-Future 098662; Dealer nur TFF (ab 2006), sonst NaN
Zinsen: diff_score = clip((rate − Ø andere7) / 2, −1, 1)     # 2pp = Extrem
        mom_score  = clip(Δrate_6M / 1.0, −1, 1)             # 100bps/6M = Extrem
        rates_score = clip(0.5·diff + 0.5·mom, −1, 1)
Saison: ccy_monthly_ret = Ø über 7 Pairs (Quote invertiert), Monats-Schlusskurse
        aktiv wenn hit_years ≥ 12 von 17; season_score = clip(mean_ret/0.5, −1, 1), sonst 0
```

Look-ahead-Regeln zentral in config, in jedem Faktor-Docstring dokumentiert. FRED-Revision: Policy-Rate-Serien (FEDFUNDS/ECBDFR/OECD-Geldmarktsätze) sind revisionsarm (Zinssätze = Fakten), OECD-MEI-Werte können nachträglich leicht revidiert werden → nur revidierte Werte verfügbar (kein ALFRED ohne Key), kompensiert durch konservativen 42-Tage-Publikations-Lag. Im Modul-Docstring festgehalten.

## Tasks

### Task 1: Gerüst + Datenquellen
- [ ] config.py, data_sources.py mit Cache; Smoke: 1 COT-Contract, 1 FRED-Serie, 1 Stooq-Symbol laden, Zeilenzahlen drucken

### Task 2: COT-Faktor
- [ ] cot_factor.py; Selftest: EUR-Werte drucken, Vorzeichen-Check (comm_z hoch → Score negativ), Delta gegen Vorwochen-Report manuell

### Task 3: Zins-Faktor
- [ ] rates_factor.py; Selftest: 8 Level + Diffs, Summe aller Diffs ≈ 0-Symmetrie-Check

### Task 4: Saisonalitäts-Faktor
- [ ] seasonality_factor.py; Selftest: 12 Buckets je Währung, Filter-Wirkung zeigen (aktive vs. neutrale Monate)

### Task 5: Feature-Tabelle + CLI + Audit
- [ ] feature_table.py, __main__.py; Lauf ohne as_of + mit as_of=2024-06-03; --audit zeigt: letzter COT-Report ≤ 2024-05-28 (Release 2024-05-31), FRED-Obs ≤ 2024-04, Saison-Fenster 2007–2023
- [ ] CSV-Export prüfen; Commit
