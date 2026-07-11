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

## Nächste Schritte (Reihenfolge aus docs/refactor-prompt.md)
1. **Aufgabe 3 — Dashboard = Währungs-Cockpit:** 8 Währungen untereinander mit
   COT/Zinsen/Retail/Saisonalität + High-Impact-News-Flag (currencyBias.ts erweitern,
   nicht neu bauen). Weekly Outlook: "Signal seit KW x / n Wochen" aus
   weekly_outlook_snapshots + News auf den Karten.
2. **Aufgabe 2 — Erklär-Bericht** (`docs/analyse-leitfaden.html`): Was bedeuten
   COT-Perzentil/Flow, Makro, Retail, Intermarket — und was fließt in Signale ein
   (Weekly: 5 Faktoren; Currency-Bias: 4; Intermarket/Kalender: nur Anzeige).
3. **Backtest-/ML-Modul:** Snapshots × price_daily → Trefferquote nach 1–4 Wochen,
   je Währung/Faktor/aligned_count. Erst bauen, wenn 1+2 stehen.

## Arbeitsweise
- Lokal arbeiten, Commits je Aufgabe, Push = Deploy auf Vercel (main → Production).
- Nach jeder Aufgabe `npm run build` + Smoke-Test.
- Trading-Roadmap-Kontext: Backtest GVA/BOS (manuell) läuft parallel; FTMO erst
  wenn Backtest positiv; ML erst mit genug Daten.
