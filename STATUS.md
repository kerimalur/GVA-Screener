# GVA-Screener — Projekt-Status & Resume-Notiz

> Notiz für Geräte-/Session-Wechsel. Der Chat-Verlauf ist NICHT im Repo —
> diese Datei ersetzt ihn als Kontext. Bei neuer Session: "lies STATUS.md".

Stand: 2026-06-20

## Was die Software macht
Trading-Scanner für 28 FX-Pairs. Erkennt GVA-Kerzenmuster → bildet Linien (Short/Long).
Wird eine Linie live berührt → Telegram-Alert. Dashboard zeigt alle Pairs farbig.

## Deployment (alles Cloud, läuft 24/7 unabhängig vom PC)
- **Backend (Render):** Service `gva-screener` → https://gva-screener.onrender.com
  - Repo-Ordner `Backend/`, FastAPI, `uvicorn main:app`
  - Env vars in Render gesetzt: `OANDA_API_KEY`, `OANDA_ACCOUNT_ID`, `OANDA_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
  - Free Tier → Cron-Ping (cron-job.org) auf `/api/health` alle 10 min hält wach
- **Frontend (Vercel):** Vite/React, Root Directory = `Frontend`
  - Env var `VITE_API_URL = https://gva-screener.onrender.com` (KEIN `/` am Ende, KEIN `-backend`)

## Architektur Backend (`Backend/`)
- `data_pipeline.py` — OANDA: `fetch_and_resample_3d` (3-Tage-Blöcke), `fetch_live_prices` (1 Call alle Pairs)
- `analyzer.py` — `analyze_gva_zones` → gibt closest + ALLE aktiven Short/Long-Lines zurück
- `main.py`:
  - 2 Background-Threads: `_zones_loop` (15 min, schwer) + `_price_loop` (30s, Live-Preis + HIT-Check)
  - `evaluate_pair` — Bewertung je Pair, Sticky-HIT-Logik
  - Endpoints: `GET /api/screener`, `GET /api/health`, `POST /api/mark`
  - State in `state.json` (gitignored): `TRIGGERED` (sticky HITs) + `CONSUMED` (verbrauchte Lines)

## Features fertig & live
- Live-Preis-HIT-Erkennung (mid-price), Alert nur bei echtem Touch/Cross (0.1 Pip), kein 2.5-Pip-Frühalarm
- Re-Trigger verhindert (ALERT_CACHE pro Line-Level)
- Farb-Logik: nahe Long-GVA = grün, nahe Short-GVA = rot, relevante Linie fett
- **Sticky HIT**: getroffenes Pair behält gelben Rand bis User reagiert
  - Popup-Aktionen: **Pending** (bleibt gelb, Label "HIT · PENDING") / **Setup Fertig** (Line verbraucht → nächste untouched Line → neutral)
  - Jede Line nur 1× nutzbar (CONSUMED-Blacklist)

## IN ARBEIT — Fundamental-Bias-Modul (NÄCHSTER SCHRITT)
Ziel: separater Fundamental-Block je Pair. Pro Währung Sub-Scores → Pair-Bias = Base − Quote.
Entscheidungen des Users: **FRED automatisch** + **Phase 1 inkl. Zinsen komplett**.

Datei `Backend/fundamentals.py` angelegt (WIP, noch NICHT importiert/verdrahtet):
- ✅ FRED-Fetcher fertig: `long_term_rate` (OECD 10Y + 3M-Änderung), `cpi_yoy` (aus Index), Real-Zins
- Verifiziert live: FRED CSV ohne Key funktioniert; CFTC Socrata-JSON funktioniert

### TODO Reihenfolge
1. `fundamentals.py` testen: `python fundamentals.py` (selftest druckt Zins/CPI/Real-Zins-Tabelle) → FRED-Coverage je Währung prüfen, fehlende Serien-IDs fixen (v.a. NZD `IRLTLT01NZ...`, evtl. EUR/CHF CPI-Index-Code)
2. **COT Z-Score** ergänzen: CFTC `https://publicreporting.cftc.gov/resource/6dca-aqww.json` (Legacy Futures), Felder `noncomm_positions_long_all`/`short_all`, Netto = long−short, Z-Score über ~156 Wochen. Contract-Namen: "EURO FX", "BRITISH POUND STERLING", "JAPANESE YEN", "AUSTRALIAN DOLLAR", "NEW ZEALAND DOLLAR", "CANADIAN DOLLAR", "SWISS FRANC", "U.S. DOLLAR INDEX". → Umkehr-Warnung, NICHT Richtung
3. **Risk-Regime** (OANDA): SPX500_USD + AUDJPY + XAU_USD Trend → Risk-On/Off-Ampel. Adjustiert AUD/NZD/CAD (+) vs JPY/CHF (−)
4. **Öl-Trend** (OANDA WTICO_USD) → CAD (stark), AUD/NZD (leicht)
5. **Saisonalität** je Pair aus Kerzen-History (Durchschnittsrendite aktueller Monat über N Jahre) — Tiebreaker
6. Scoring: Richtungs-Score je Währung = Real-Zins + Zins-Drehung + Risk-Adj + Commodity. COT & Saisonalität separat anzeigen
7. Background-Loop (z.B. alle 6h, Fundamentaldaten ändern langsam) → `FUND_CACHE`, in Screener-Output je Pair als `fundamentals`-Block mergen
8. Frontend: eigener Fundamental-Abschnitt im Pair-Popup (+ kleine Bias-Ampel auf Karte)

### Bewusst weggelassen
- Lower-Timeframe-Automatik (zu komplex, kleiner Mehrwert)
- Tier 4 (Monatsende-Flows, Handelsbilanz — zu verrauscht)

## Bekannte offene Punkte / Ideen (Backlog)
- Signal-Journal (jeden HIT loggen → Win-Rate messen) — wichtig für "ist die Strategie profitabel?"
- Alert-Message aufwerten: TradingView-Chart-Link, Session, News-Flag
- News-Blackout-Filter (High-Impact-News unterdrücken)
- `state.json` überlebt Render-Redeploy NICHT (ephemeres FS) → bei Bedarf auf DB/Supabase
