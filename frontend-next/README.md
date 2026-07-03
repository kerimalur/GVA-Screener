# FX Terminal — Swing-Trading Suite

Professionelles fundamentales Swing-Trading-Terminal (Next.js App Router + Supabase + Vercel).
Ersetzt das frühere Vite-Frontend. Das Python-Backend (`../Backend`, FastAPI auf Render)
bleibt unverändert und wird nur read-only für den GVA-Scanner angesprochen.

## Module

| Route | Modul |
|---|---|
| `/` | Dashboard: Currency Strength, Pair-Screener (begründete Long/Short-Signale), Hawkish/Dovish-Spektrum, Risk-On/Off-Gauge |
| `/cot` | COT: aktueller Report, 5J+-Historie, Perzentile, Extrem-Backtest, Contract-Vergleich |
| `/makro` | Makro: Regionen-Vergleich, Zins-/Yield-Spreads, Markterwartungen, Commodity-Korrelationen |
| `/sentiment` | Retail-Sentiment (Myfxbook) mit Konträr-Auswertung |
| `/intermarket` | Korrelationsmatrix, freies Overlay, DXY-Dashboard |
| `/saisonalitaet` | Monats-Heatmap + Detail je Instrument |
| `/kalender` | Wirtschaftskalender (ForexFactory) + Zentralbank-Kalender |
| `/vergleich` | Freier 2-Serien-Vergleich (COT/Preis/Spreads/Sentiment/FRED) |
| `/scanner/radar`, `/scanner/heatmap` | GVA-Scanner (Port, spricht FastAPI auf Render an) |

## Datenquellen (alle kostenlos)

- **CFTC** (Socrata, keyless) — COT Legacy Futures-only, 12 Contracts ab 2006
- **FRED** (CSV, keyless) — Zinsen, 10Y-Yields, CPI, Arbeitsmarkt, BIP, OECD-CLI (PMI-Proxy), VIX, USD-Indizes
- **OANDA** (API-Key) — Tageskerzen 28 FX-Paare + Gold/WTI/Brent/Kupfer/S&P 500 (~19 Jahre)
- **Myfxbook** (kostenloser Account) — Retail Community Outlook
- **ForexFactory** (keyless) — Wirtschaftskalender

Architektur: Externe APIs → Cron/Backfill → **Supabase** → Server Components/Route Handler → UI.
Page-Loads rufen nie externe APIs auf.

## Setup

1. **Supabase:** bestehendes Journal-Projekt verwenden (siehe `../MIGRATION.md`), im SQL-Editor ausführen:
   - `../supabase/schema.sql` (Master: Journal + Terminal + signals, idempotent)
   - `../supabase/seed.sql` (Instrumente, CB-Stances, CB-Meetings)
2. **Env:** `.env.example` → `.env.local` kopieren und füllen
   (Supabase-URL + Anon-Key + Service-Role-Key, OANDA-Key, Myfxbook-Login, `CRON_SECRET`).
3. **Install + Backfill** (einmalig, lädt ~5 Jahre COT + ~19 Jahre Preise + FRED-Historie):
   ```bash
   npm install
   npx tsx scripts/backfill.mts all      # oder: prices | cot | fred | calendar | sentiment
   ```
4. **Check:** `npm run dev` → `http://localhost:3000/api/health` zeigt Row-Counts je Tabelle.

## Vercel-Deploy

1. Vercel-Projekt: **Root Directory = `frontend-next`**.
2. Alle Env-Vars aus `.env.example` in den Project Settings setzen (`CRON_SECRET` zufällig).
3. `vercel.json` registriert den täglichen Cron `/api/cron/daily` (05:30 UTC):
   Preise + FRED + Kalender + Sentiment-Snapshot täglich, COT Sa/So/Mo bzw. wenn älter als 8 Tage.
   Jobs sind idempotent — verpasste Tage heilen sich selbst.
4. Backfill-Fallback ohne lokalen Node:
   `GET /api/admin/backfill?task=prices&chunk=0..6` (Header `Authorization: Bearer <CRON_SECRET>`),
   analog `task=cot|fred|calendar|sentiment`.

## Pflegbare Daten (Supabase Table Editor)

- `cb_meetings` — Zentralbank-Termine + erwartete Änderung in bps (Seeds teils unbestätigt, `notes` beachten)
- `cb_stance` — manueller Hawkish/Dovish-Score (−10…+10), fließt zu 60 % ins Spektrum
- `cron_runs` — Job-Protokoll (Observability)

## Degradation

- Myfxbook down/blockt → Cron loggt `skipped`, Sentiment-Seite zeigt Empty-State, Screener nutzt die restlichen Faktoren.
- Eingestellte FRED-Serien → `fred_series_meta.is_stale`, UI zeigt Stale-Badge statt Crash.
- `TRADING_ECONOMICS_KEY` ist vorbereitet (echter PMI statt OECD-CLI), aber ungenutzt.

## Entwicklung

```bash
npm run dev     # http://localhost:3000
npm run build   # Produktions-Build (muss sauber durchlaufen)
npm run lint
```

Struktur: `app/` (Routen + API), `components/<modul>/`, `lib/sources` (externe Fetcher),
`lib/jobs` (idempotente Upsert-Jobs), `lib/calc` (reine Berechnungen), `lib/data` (Supabase-Reads),
`lib/constants` (Instrumente, CFTC-Codes, FRED-Katalog, Banken).
