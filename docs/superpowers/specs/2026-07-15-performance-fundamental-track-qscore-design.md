# Performance-Paket + Fundamental-Track-Zeiträume + Q-Score an GVA-Linien

Datum: 2026-07-15 · Status: von Kerim freigegeben (AskUserQuestion)

## Problem

Seiten, die das Render-Backend (Free Tier, schläft nach 15 min) oder ungecachte
schwere Berechnungen treffen, laden extrem langsam:

| Seite | Ursache |
|---|---|
| Fundamental-Track, Replay (GVA-Hits), Scanner, Dashboard „Nahe GVA-Linien" | Render-Kaltstart ~50 s + Panel-Aufbau + OANDA-Fetches, kein Ergebnis-Cache |
| Währungs-Ranking | `loadRankingData` = ~7 Supabase-Queries, `force-dynamic`, **kein Cache** (Daten ändern sich wöchentlich) |
| COT Intelligence, Season 2.0, Macro Terminal | Server-Cache vorhanden (1 h/5 min), aber erster Treffer nach Ablauf/Deploy rechnet alles neu (Season: 17 J Preisdaten) |

Schnelle Seiten (Journal, Trades, Kalender) gehen direkt auf Supabase ohne
schwere Rechnung.

## Entscheidungen (Kerim)

- Keep-Alive: **GitHub-Actions-Ping** (gratis), nicht Render Starter.
- Gesamtpaket umsetzen (Perf + beide Features).

## Design

### 1. Keep-Alive
`.github/workflows/keepalive.yml`: cron `*/10 * * * *` + workflow_dispatch,
curl `https://gva-screener.onrender.com/api/health` mit Retry. Render Free
750 h/Monat reicht für 1 Service always-on. GH-Cron kann sich verzögern —
akzeptiert (Warmup beim Login fängt Rest ab).

### 2. Backend-Warmup + Cache
- Startup-Thread (zusätzlich zu zones/price/macro): baut `replay.fundamentals._panel()`
  vor, damit der erste Fundamental-/Replay-Request nicht die 25-J-Daten zieht.
- `fundamental_track`-Ergebnis-Cache: TTL 1 h, Key = (pair, weeks, date_from, date_to).
  Einfacher In-Prozess-Dict mit Zeitstempel (wie OANDA-TTL-Cache in data_pipeline).

### 3. Fundamental-Track Zeiträume + alle Pairs
- Backend `/replay/fundamental-track`: `weeks` Limit 4…520 (10 J); neu optional
  `date_from`/`date_to` (ISO). Wenn Range gesetzt → `ranking_series(lo, hi)` direkt,
  kein `rows[-weeks:]`-Cut. OANDA `count=5000` deckt ~19 J.
- Frontend `FundamentalTrack.tsx`: Zeitraum-Select 52 W / 2 J / 5 J / 10 J /
  „Eigener Zeitraum" (zwei Date-Inputs). Pair-Selector (28 Pairs) existiert schon —
  Langsamkeit pro Wechsel löst der Cache.

### 4. Ranking-Server-Cache
`loadRankingData` in `unstable_cache` (key `ml-ranking-v1`, revalidate 300 s).
Konsumenten: /ml/ranking-Seite + `loadWeekPlan` (Dashboard) — teilen einen Eintrag.

### 5. Hintergrund-Laden (flüssig nach Login)
- Client-Komponente `Prefetcher` im (app)-Layout: bei Mount fire-and-forget
  `GET ${API}/api/health` (weckt Render sofort) + `/api/cot/intelligence` +
  `/api/ml/season` (füllt Server-Caches) + `router.prefetch` der Analyse-Routen.
- Stale-first-Hook `useCachedFetch(key, url)`: localStorage-Ergebnis sofort
  rendern, frische Daten im Hintergrund holen und ersetzen. Einsatz:
  CotIntelligence, SeasonVerdict, SeasonExplorer, FundamentalTrack.

### 6. Q-Score-Badge an „Nahe GVA-Linien" (Dashboard)
- Dashboard-Server lädt Ranking (gecacht) und übergibt `quintiles:
  Record<ccy, number>` an `NearGva`.
- Pro Box: Linien-Richtung (near/HIT SHORT|LONG) vs. Pair-Bias nach **strikter
  Q5/Q1-Regel** (identisch `derivePairIdeas`): beide extrem gleichgerichtet → neutral;
  Q5-Basis/Q1-Quote → long; umgekehrt → short; einseitig extrem → dessen Richtung.
- Anzeige: Bias == Linien-Richtung → grün „✓ CHF Q1" (Ranking bestätigt);
  entgegengesetzt → rot „✗ gegen Ranking"; neutral → kein Badge.

## Nicht-Ziele
- Kein Umzug der Backend-Rechnung nach Vercel.
- Keine Änderung der Q5/Q1-Regel (Q2–Q4 bleiben neutral — siehe Memory).
- Season/COT-Berechnung selbst wird nicht optimiert, nur Cache-Treffer erhöht.

## Verifikation
- `npm run build` sauber, `pytest Backend/tests` grün.
- fundamental-track mit Range-Params lokal gegen Backend testen.
- NearGva-Badge: Unit-Logik (Bias-Funktion) + Sichtprüfung.
