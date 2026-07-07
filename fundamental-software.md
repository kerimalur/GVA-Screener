# Fundamentaldaten in der Software

Dieses Dokument beschreibt **alle Fundamentaldaten**, die die GVA-Screener-App führt: woher sie kommen, was man daraus lesen kann und wie oft sie aktualisiert werden.

Die App hat **zwei getrennte Fundamental-Datenwelten**, die nicht dieselbe Quelle teilen:

| System | Läuft wo | Speicher | Endpoint / Konsument |
|---|---|---|---|
| **A · Live-Makro-Loop** | Python-Backend (FastAPI, z. B. Render) | RAM-Cache (`MACRO_CACHE`) | `GET /api/fundamentals`, `GET /api/calendar` → Power Index, Stärke-Matrix, Signal-Snapshot |
| **B · Terminal-Datenbank** | Next.js Cron-Jobs → Supabase | Postgres-Tabellen | Terminal-Seiten (Dashboard, COT, Makro, Sentiment, Saisonalität, Kalender) |

Beide degradieren sauber: fällt eine Quelle aus, bleiben Fallback-/Bestandswerte stehen, es gibt keinen Crash.

---

## System A — Live-Makro-Loop (Backend)

Quelle: [`Backend/macro.py`](Backend/macro.py) + [`Backend/fundamentals.py`](Backend/fundamentals.py). Ein eigener Thread (`_macro_loop`) rechnet die 8 G8-Währungen durch und legt das Ergebnis in `MACRO_CACHE` ab. Alle Quellen sind **gratis und ohne API-Key**.

### Datenquellen & Felder je Währung (`G8Currency`)

| Feld | Bedeutung | Quelle | Was man liest |
|---|---|---|---|
| `rate` | Leitzins (%) | STATIC (redaktionell gepflegt) | Zinsniveau der Notenbank |
| `tenY` | 10-Jahres-Rendite (%) | FRED CSV (`IRLTLT01..M156N`) | Langfristzins, Kapitalmarkt-Erwartung |
| `cpi` | Inflation YoY (%) | FRED CSV (`CPALTT01..M661N`, selbst gerechnet) | Teuerung → Kaufkraft, Zinsdruck |
| `realRate` | Realzins = `rate − cpi` | berechnet | echte Attraktivität der Währung für Kapital |
| `chg` | Zins-Drehung (Δ 10Y über ~3 Monate) | FRED | steigend = hawkish, fallend = dovish |
| `score` | Stärke-Score −10…+10 | Heuristik `realRate·1.4 + chg·2.0` | fundamentale Gesamtstärke der Währung |
| `cot` | 52-Wochen-Serie Commercials-Netto (long−short, in Tsd. Kontrakten) | CFTC Socrata JSON | Positionierung des „Smart Money" |
| `gdpRole` | Text zur BIP-Rolle | STATIC redaktionell | konjunktureller Kontext |
| `tradeRole` | Text zur Handelsbilanz-Rolle | STATIC redaktionell | Außenhandels-Kontext |

Währungen: **USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF**.

**Ableitung Pair-Bias:** pro Paar = `Score(Basis) − Score(Quote)`. Fehlt eine Quelle, bleibt der Faktor neutral.

### Wirtschaftskalender (`/api/calendar`)

- Quelle: **ForexFactory-Wochenkalender** über faireconomy-CDN (`ff_calendar_thisweek.json`), keyfrei.
- Felder je Event: Zeit, Währung, Impact (High=3 / Medium=2 / Low=1), Event-Name, Actual, Forecast, Previous.
- Holiday-Events werden herausgefiltert, sortiert nach Impact, max. 40 Events.

### Aktualisierung System A

| Was | Intervall | Quelle im Code |
|---|---|---|
| Makro-Loop (FRED-Score, CPI, 10Y, COT) | **alle 6 Stunden** | `MACRO_INTERVAL = 60*60*6` in [`Backend/main.py`](Backend/main.py) |
| Kalender | im selben 6-h-Loop neu gezogen | `_macro_loop` |
| Fallback bis erster Loop durch ist | sofort STATIC-Werte | `macro.static_currencies()` |

> Begründung im Code: Makrodaten ändern sich langsam, 6 h reicht. FRED liefert 10Y/CPI ohnehin nur monatlich, CFTC-COT nur wöchentlich (Release Fr ~20:30 UTC).

### Verwendung des Snapshots

Bei jedem GVA-Line-**HIT** hängt [`Backend/supabase_signals.py`](Backend/supabase_signals.py) einen **Fundamental-Snapshot** beider Währungen (ohne die 52-Wochen-`cot`-Serie, damit kompakt) an die `signals`-Zeile → landet in der Journal-Inbox. So ist zu jedem Signal der fundamentale Kontext zum Zeitpunkt des Treffers eingefroren.

---

## System B — Terminal-Datenbank (Supabase)

Befüllt durch tägliche Next.js-Cron-Jobs ([`app/api/cron/daily/route.ts`](frontend-next/app/api/cron/daily/route.ts)), gesteuert über [`vercel.json`](frontend-next/vercel.json). Alle Tabellen sind **Service-Role-only** (RLS aktiv, keine Policies → Anon sieht nichts). Schema: [`supabase/schema.sql`](supabase/schema.sql).

### Tabellen, Quellen & Aussage

| Tabelle | Inhalt | Quelle | Was man liest |
|---|---|---|---|
| `price_daily` | Tages-OHLC + Volumen je Instrument | **OANDA** ([`sources/oanda.ts`](frontend-next/lib/sources/oanda.ts)) | Kursbasis für Stärke, Trend, Saisonalität, Risk-Gauge |
| `cot_reports` | CFTC-Positionen (NonComm / Comm / NonRept, long+short, OI, Wochen-Δ) | **CFTC** ([`sources/cftc.ts`](frontend-next/lib/sources/cftc.ts)) | institutionelle Positionierung + Perzentil-Extreme |
| `fred_series` | Makro-Zeitreihen (siehe Katalog unten) | **FRED** ([`sources/fred.ts`](frontend-next/lib/sources/fred.ts)) | Zinsen, Inflation, Arbeitslosigkeit, BIP, Vorlauf, Handel |
| `fred_series_meta` | Metadaten je Serie (`last_date`, `is_stale`) | berechnet | erkennt tote/eingestellte FRED-Serien |
| `sentiment_snapshots` | Retail Long-/Short-% je Pair | **Myfxbook** ([`sources/myfxbook.ts`](frontend-next/lib/sources/myfxbook.ts)) | Retail-Positionierung (konträr genutzt) |
| `calendar_events` | Wirtschaftstermine | **ForexFactory** ([`sources/forexfactory.ts`](frontend-next/lib/sources/forexfactory.ts)) | anstehende High-Impact-Events |
| `cb_meetings` | Notenbank-Sitzungen (erwartete/tatsächliche bps) | manuell/redaktionell | Zins-Fahrplan der Notenbanken |
| `cb_stance` | Hawkish/Dovish-Score je Bank (−10…+10) | manuell/redaktionell | geldpolitische Grundhaltung |
| `cron_runs` | Protokoll der Cron-Läufe (ok/error/skipped/deferred) | System | Betriebs-/Aktualitäts-Monitoring |

### FRED-Serien-Katalog

Aus [`lib/constants/fredSeries.ts`](frontend-next/lib/constants/fredSeries.ts), je G8-Währung (soweit verfügbar):

| Kategorie | Aussage | Granularität |
|---|---|---|
| `policy_rate` | Leitzins / Geldmarktsatz | monatlich (USD täglich) |
| `rate_2y` | 2Y-Rendite (Zins-Erwartungs-Proxy) | täglich (US) |
| `yield_10y` | 10Y-Staatsanleihe | US täglich, Rest OECD monatlich (DE = EUR-Proxy) |
| `cpi` | Verbraucherpreise (Index → YoY berechnet) | monatlich (AUD/NZD quartalsweise) |
| `unemployment` | Arbeitslosenquote | monatlich/quartalsweise |
| `gdp` | reales BIP | quartalsweise |
| `cli` | OECD Composite Leading Indicator (PMI-Proxy) | monatlich (kein NZD) |
| `trade` | Handelsbilanz | monatlich |
| `market` | VIX, Broad Dollar Index, USD/SEK (DXY-Formel) | täglich |

> Hinweis aus dem Code: Einige OECD-Serien wurden 2023/24 auf FRED eingestellt. Der Backfill probt jede ID und markiert tote Serien in `fred_series_meta.is_stale`.

### Views (abgeleitet, in Postgres)

- `monthly_closes` — Monats-Schlusskurse aus `price_daily`.
- `seasonality_stats` — je Instrument & Kalendermonat: Ø-Return, Trefferquote, Anzahl Jahre.

### Aktualisierung System B

Ein Cron-Lauf täglich, dann Job für Job (Zeitbudget 250 s, sonst wird auf den nächsten Lauf verschoben):

| Job | Aktualisiert | Kadenz |
|---|---|---|
| `cron:prices` | `price_daily` (inkrementell ab letztem Datum, sonst 5000 Kerzen) | **täglich 05:30 UTC** |
| `cron:fred` | `fred_series` + `fred_series_meta` | täglich |
| `cron:calendar` | `calendar_events` | täglich |
| `cron:sentiment` | `sentiment_snapshots` | täglich |
| `cron:cot` | `cot_reports` | **nur Sa/So/Mo** oder wenn Daten > 8 Tage alt (CFTC-Release Fr ~20:30 UTC) |

Cron-Schedule: `"30 5 * * *"` in `vercel.json`. Manueller Fallback ohne lokalen Node: `GET /api/admin/backfill?task=prices|cot|fred|calendar|sentiment` (Header `Authorization: Bearer <CRON_SECRET>`).

---

## Was die App aus den Fundamentaldaten ableitet

Berechnet in [`lib/data/dashboard.ts`](frontend-next/lib/data/dashboard.ts) + [`lib/calc/`](frontend-next/lib/calc/), gezeigt in den Terminal-Seiten (`nav.ts`):

| Analyse | Datei | Input | Aussage |
|---|---|---|---|
| **Währungsstärke** | `calc/strength.ts` | Tagesschlusskurse der 28 Paare | Ø signierter Return je Währung über 1W / 1M / 3M → Ranking (stärkste zuerst) |
| **Risk-Gauge** | `calc/riskGauge.ts` | VIX, Gold, JPY/CHF-Stärke, S&P 500 | Composite 0–100 → Regime **Risk-On / Neutral / Risk-Off** |
| **CB-Stance** | `calc/cbStance.ts` | manueller Score (60 %) + Leitzins-Trajektorie 6M (40 %) | Hawkish/Dovish-Spektrum −10…+10 je Notenbank |
| **COT-Perzentil** | `data/cot.ts` | NonComm-Netto, rollend 260 Wochen | Positionierung im historischen Perzentil (Extrem-Warnung ≥90 / ≤10) |
| **Saisonalität** | `seasonality_stats` (View) | Monats-Returns über alle Jahre | Ø-Return & Trefferquote je Kalendermonat |
| **Screener-Verdict** | `calc/screenerReasoning.ts` | 5 Faktoren (s. u.) | LONG/SHORT je Pair, wenn ≥ 2 gleichgerichtete Faktoren |

### Die 5 Screener-Faktoren je Paar

1. **Zinsdifferenz** — Leitzins Basis vs. Quote (Niveau + Drehung über 6M).
2. **COT** — NonComm-Perzentil-Differenz Basis vs. Quote (Extrem-Konträr-Warnung).
3. **Saisonalität** — historischer Ø-Return des aktuellen Monats (≥ 8 Jahre Basis).
4. **Yield-Spread** — 10Y-Spread Basis−Quote, Trend über 3 Monate.
5. **Retail-Sentiment** — Myfxbook Long-% (konträr: ≥ 65 % long → Short-Signal).

---

## Kurzfassung Aktualisierungs-Kadenz

| Datentyp | System | Intervall |
|---|---|---|
| Live-Preise (GVA-Screener-Kern) | Backend | **30 Sekunden** |
| GVA-Zonen-Neuberechnung | Backend | **15 Minuten** |
| Makro-Score / COT / Kalender (Live-Cache) | Backend | **6 Stunden** |
| Tageskurse, FRED, Kalender, Sentiment (DB) | Cron | **täglich 05:30 UTC** |
| COT-Reports (DB) | Cron | **Sa/So/Mo** bzw. > 8 Tage alt |
| Leitzins / redaktionelle Texte / cb_stance | manuell | selten, editorial |

---

### Zusammengefasst

- **Zinsen & Inflation** (FRED): Leitzins, 2Y/10Y-Rendite, CPI, Realzins → treiben Stärke-Score, CB-Stance und Zinsdifferenz-Faktor.
- **Konjunktur** (FRED): Arbeitslosenquote, BIP, OECD-CLI, Handelsbilanz → makroökonomischer Kontext.
- **Positionierung** (CFTC-COT): institutionelles Netto + Perzentil → Smart-Money-Bias und Extrem-Warnungen.
- **Retail-Sentiment** (Myfxbook): Long/Short-% → konträres Signal.
- **Markt/Risiko** (OANDA + VIX): Preise, Gold, S&P, Safe-Haven-Stärke → Risk-On/Off-Regime.
- **Termine** (ForexFactory): High-Impact-Events → Timing-Kontext.
