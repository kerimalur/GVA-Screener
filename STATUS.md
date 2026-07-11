# GVA-Screener — Projekt-Status & Resume-Notiz

> Notiz für Geräte-/Session-Wechsel. Der Chat-Verlauf ist NICHT im Repo —
> diese Datei ersetzt ihn als Kontext. Bei neuer Session: "lies STATUS.md".

Stand: 2026-07-11

## Ausrichtung (WICHTIG, seit 2026-07-11)
**Privates Trading-Tool. Kein Verkaufsprodukt mehr.** Fokus: Funktion, Effizienz,
Mehrwert für Kerims eigenes Trading — Endziel ML-/Backtesting über die Weekly Outlooks.
Alles Marketing/Verkauf (Landing, Stripe, Upgrade, Onboarding-Tour, AGB/Impressum,
Scanner-Zugangscode, Feedback-API) liegt in `marketing-verkauf-backup/` (gitignored,
README mit Original-Pfaden drin). Eingeloggt = voller Zugriff; Scanner bleibt Admin-only.

Masterplan der laufenden Umbauten: `docs/refactor-prompt.md`.

## Architektur
- **Backend (Render):** `Backend/`, FastAPI → https://gva-screener.onrender.com
  GVA-Kerzenmuster-Scanner für 28 FX-Pairs, Live-Preis-HIT-Check, Telegram-Alerts.
  (Details/Sticky-HIT-Logik: siehe Git-History dieser Datei, unverändert seit Juni.)
- **Frontend (Vercel):** `frontend-next/` (Next.js 16), Projekt `gva-screener`,
  https://gva-screener.vercel.app — Analyse-Suite + Journal + Markt-Scanner-UI.
- **Supabase** (Projekt `bpggwelpuvbkeudrqoiv`): Marktdaten + Journal + Snapshots.
  Alle Daten-Tabellen: RLS an, KEINE Policies → nur Service-Role-Key (liegt nur in
  Vercel-Env, nicht lokal!). Lokal fehlt `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
  → Daten-Seiten laufen lokal nur eingeschränkt; URL + Anon-Key sind eingetragen.
- **Crons (Vercel):** `/api/cron/daily` 05:30 UTC (Preise), `/api/cron/fundamentals`
  06:00 UTC (FRED, Kalender, Sentiment, COT-wenn-fällig, Outlook-Backfill+Snapshot).
  Manuelle Ausführung: Vercel Dashboard → Settings → Cron Jobs → Run.
  Backfill einzeln: `/api/admin/backfill?task=outlooks` (Bearer CRON_SECRET).

## Was am 2026-07-11 geändert wurde
1. **Marketing raus** (Commit `446899b`): Dateien in Backup-Ordner verschoben,
   proxy.ts ohne Abo-/Tier-Checks, `/` redirectet direkt Dashboard/Login,
   Einstellungen ohne Abo-Karte, `stripe`-Dependency entfernt.
2. **Nav aufgeräumt** (`141dd5c`): Analyse zeigt nur Dashboard, Weekly Outlook,
   Vergleich. Rest (COT, Makro, Sentiment, Intermarket, Saisonalität, Kalender)
   in einklappbarer "Details"-Gruppe (localStorage, Auto-Open bei aktiver Route).
3. **ML-Fundament** (`680204d`, `86e3b6d`):
   - Tabelle `weekly_outlook_snapshots` (PK week_start+instrument): eingefrorene
     Wochen-Verdicts des 5-Faktoren-Screeners als Backtest-Datenbasis.
   - `lib/ml/outlookSnapshots.ts`: as-of-Rekonstruktion (Rolling-Perzentile/Flows
     enden am Stichtag, kein Lookahead), `ensureOutlookBackfill` (selbstheilend im
     Cron), `snapshotCurrentWeek` (Insert-only, erster Lauf der Woche gewinnt).
   - Seite **/ml "Machine Learning → Daten-Check"**: Frische aller Quellen,
     Snapshot-Abdeckung, fehlende/unvollständige Wochen, Signal-Quote.

## Was FUNKTIONIERT (verifiziert 2026-07-11)
- Deployment READY, `/` → Login, `/upgrade` & Co. weg, Build fehlerfrei.
- Backfill gelaufen: **2912 Backfill-Zeilen** (104 Wochen × 28 Pairs,
  2024-07-08 … 2026-06-29, Ø 4.0 Faktoren — ohne Sentiment, korrekt) +
  **28 Live-Zeilen** (Woche 2026-07-06, Ø 5.0 Faktoren). Signal-Quote 66 %.
- Wöchentlicher Live-Snapshot läuft ab jetzt automatisch im 06:00-Cron.

## Was NOCH NICHT geht / offen
- **Login-Flow nach Marketing-Umbau nur per Redirect-Codes getestet**, nicht mit
  echtem Login durchgeklickt (kein Credential lokal). Kurz manuell prüfen.
- **/ml-Seite noch nicht im Browser gesichtet** (liegt hinter Auth) — Daten dahinter
  stimmen (SQL-geprüft), Rendering einmal anschauen.
- **Sentiment-Historie beginnt erst 2026-07-03** → Backtest über 2 Jahre kann den
  Retail-Faktor nicht nutzen; per `source`/`factor_count` unterscheidbar.
- Signal-Quote 66 % ist hoch (≥2 gleichgerichtete von 4 Faktoren ist leicht erfüllt)
  → Backtest sollte nach `aligned_count` (2 vs. 3 vs. 4) getrennt auswerten.
- Saisonalität im Backfill nutzt die heutige `seasonality_stats`-View
  (minimales Lookahead, bewusst akzeptiert — Kommentar in outlookSnapshots.ts).

## Aufgabe 3 — ERLEDIGT (2026-07-11, Commit 64d59aa)
- **Dashboard = Währungs-Cockpit:** 8 Währungen untereinander (Commit oben).
  `lib/calc/currencyCockpit.ts` reichert currencyBias an (nicht neu gebaut) um
  Retail-Aggregat (Ø über die 7 Pairs je Währung, konträr), Saisonalität (pro/contra
  Pairs des Monats) und High-Impact-News-Flag (7 Tage). Retail/Saison/News sind reine
  Anzeige, ändern die Bias-Richtung NICHT. Zeile aufklappbar → Faktor-Details.
  `components/dashboard/CurrencyCockpit.tsx`; loadDashboardData lädt zusätzlich
  High-Impact-Events + Sentiment-Latest (limit 120). Alter `CurrencyBiasPanel`
  nicht mehr im Dashboard (Datei bleibt, evtl. woanders genutzt).
- **Weekly Outlook:** "seit N Wochen · KWxx" je Signal aus weekly_outlook_snapshots
  (Streak = gleiche Richtung rückwärts). News waren schon auf den Karten.
- Verifiziert: Build sauber, Deploy READY, Routen 307→Login. Rendering hinter Auth
  noch nicht visuell gesichtet (kein Login lokal) — bei nächstem Login prüfen.

## Aufgabe 2 — ERLEDIGT (2026-07-11, Commit f2ee336)
- **/leitfaden** (Nav: System) — statische Erklär-Seite. Pro Datenquelle (COT,
  Makro/Zinsen, Retail, Saisonalität, Intermarket, Kalender) konkrete Lese-Regeln
  mit den echten Code-Schwellenwerten + "So liest du das" / "So handelst du danach".
  Oben Übersicht: Signale = Pair-Screener (5 Faktoren) + Währungs-Bias (4);
  nur Anzeige = Intermarket, Kalender, Makro-Detail, Cockpit-Zusätze.

## Backtest-Modul + 8 Jahre — ERLEDIGT (2026-07-11, Commit 514f1b3)
- `lib/ml/backtest.ts`: Weekly-Outlook-Signale × `price_daily` über 1–4 Wochen.
  Trefferquote (Close in Signalrichtung) + Ø gerichtete Rendite, aufgeschlüsselt
  nach Horizont, Faktor-Konfluenz (`aligned_count`), Basiswährung, Pair. Ohne Kosten.
- `BacktestPanel` auf /ml (unstable_cache 30 min, key `ml-backtest-v1`).
- **BACKTEST_WEEKS = 416 (8 J.)** zentral in outlookSnapshots.ts — Backfill,
  Cron-Selbstheilung (ensureOutlookBackfill), Health-Coverage, Script, Admin-Route.

### OFFEN / zu prüfen
- **DB hat noch 104 Wochen** — der 416-Backfill füllt sich beim nächsten
  `fundamentals`-Cron (06:00 UTC) ODER manuell: Vercel → Cron Jobs → „fundamentals“
  → Run. Danach zeigt /ml 416/416; Backtest-Tabelle refresht in ≤ 30 min (Cache).
- Backtest-Seite lädt beim ersten (uncached) Aufruf ~8 J. FX-Kurse (≈ 56k Zeilen,
  paginiert) → kann 15–30 s dauern; danach gecacht.
- MCP-Supabase-Server war zeitweise disconnected (nur Info; kein Code-Problem).
- Signal-Quote historisch hoch → Backtest nach aligned_count getrennt auswerten
  (Panel „Nach Faktor-Konfluenz“ zeigt genau das).

## ML-Labor — ERLEDIGT (2026-07-11, Commit 10290fa)
- **/ml/labor** (Nav: Machine Learning → Labor): interaktiver Faktor-Explorer.
  `lib/ml/factorMatrix.ts` rechnet pro Woche × Pair alle Faktor-Varianten direkt
  aus Rohdaten (as-of): Zins, COT-NC (Non-Comm), **COT-C (Commercials)**, Saison,
  Yield + Forward-Returns 1–4W. `/api/ml/matrix` (1h-Cache) → Client aggregiert
  alles im Browser (Filter ohne Roundtrip).
- Filter: Horizont 1–4W (Default 2), Zeitraum 2/4/8J, Faktor-Checkboxen
  (einstimmige Kombination), Min-n 10/30/100. Ansichten: Kennzahlen der Auswahl,
  Währung×Faktor-Heatmap, Kombi-Bestenliste (alle 31 Teilmengen), Pair-Tabelle.
  Signifikanz (95%-Konfidenz) markiert, kleine n ausgegraut.
- **Backtest-Erkenntnisse (8J, SQL-verifiziert):** Outlook-Verdict gesamt ~50 %
  (keine Edge). Einzeln: Saison 53,5→55,7 % (1→4W, bester Faktor), Zins ~51,5 %,
  Yield ~49 %, COT-NC 48,9→46,7 % (schädlich). Beste Kombi: **Zins+Saison 57,9 %**
  (4W, n=1499). Alle-4-Kombi 47,4 % → mehr Konfluenz ≠ besser. COT je Währung:
  NZD/CAD → Commercials besser (53,5/52,8 %), CHF → Non-Comm (51,6 %) — Tendenz,
  einzeln knapp unter 95%-Signifikanz.
- Nächster logischer Schritt: Weekly-Outlook-Verdict-Logik auf die Labor-
  Erkenntnisse umbauen (Kern Zins+Saison, COT-Variante je Währung) — erst nach
  Kerims Review der Labor-Zahlen.

## ML-Labor v2 — z-Scores + Walk-Forward (2026-07-11, Commit 968a164)
Adressiert die bewiesenen Kernprobleme der Faktor-Logik:
- **#1 starre Schwellen** → jeder Faktor zusätzlich als rollierender z-Score
  (156W, as-of, per Pair) in factorMatrix.ts. Row v3: [wi,pi, d0-4, z0-4, r0-3].
- **#2 Gleichgewichtung** → Edge-Gewichte 2·(WR−0.5) aus In-Sample; konträre
  Faktoren → negatives Gewicht (Auto-Invert). COT-NC bekam −0.05, COT-C +0.04.
- **#5 kein OOS** → Walk-Forward-Split (50/60/70) im Labor, IS vs OOS getrennt.
- **#6 binär** → kontinuierlicher Composite Σ(w·z) + Konfidenz-Quintile (OOS).

### Validiertes Ergebnis (live-Daten, out-of-sample)
- Zins+Saison edge: IS 51.9 / OOS 51.8 % (2W), IS 52.7 / OOS 52.0 % (4W) →
  **kein Overfit** (IS≈OOS), aber breit angewandt nur schwache Edge.
- **Konfidenz-Quintile OOS (alle 5, 4W): Q1 49.5 → Q5 57.6 %** → Edge lebt NUR
  im oberen Konfidenz-Fünftel. Design-Regel für Weekly-Outlook-Umbau: nur die
  Top-~20%-Konfidenz-Signale flaggen, nicht jedes Pair.

### Noch offen (nicht bewiesen / größer)
- **#3 Regime-Filter**: Risk-Gauge existiert (riskGauge.ts, nur für BTC genutzt).
  Erst im Labor testen ob Zins in Risk-On besser läuft, DANN bauen.
- **#4 COT-pro-Währung** feiner: aktuell global via Edge-Gewicht; per-Währungs-
  Auswahl (NZD/CAD→Commercials, CHF→NonComm) braucht currency-level Umbau.
- **Produktiv-Umbau Weekly Outlook** auf Composite+Konfidenz — erst nach Kerims
  Review, wenn Filter-Regel steht.

## Arbeitsweise
- Lokal arbeiten, Commits je Aufgabe, Push = Deploy auf Vercel (main → Production).
- Nach jeder Aufgabe `npm run build` + Smoke-Test.
- Trading-Roadmap-Kontext: Backtest GVA/BOS (manuell) läuft parallel; FTMO erst
  wenn Backtest positiv; ML erst mit genug Daten.
