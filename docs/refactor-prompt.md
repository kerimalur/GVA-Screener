# Prompt: GVA-Screener Umbau — Fokus Funktion & Effizienz statt Verkauf

> Kontext: GVA-Screener ist ab jetzt ein **privates Trading-Tool**, kein Verkaufsprodukt.
> Wir arbeiten **lokal** (kein Push nach jeder Änderung). Jede Änderung wird lokal
> mit `npm run build` + `npm run dev` verifiziert, bevor committet wird.
> Endziel: aufgeräumte Basis für ein ML-/Backtesting-Modul über die Weekly Outlooks.

---

## Aufgabe 1 — Marketing/Verkauf komplett raus (höchste Priorität)

Alle Verkaufs-/Marketing-Teile aus dem Frontend entfernen und in einen Backup-Ordner
verschieben, der **nicht mehr gepusht wird**.

**Backup-Ordner:** `marketing-verkauf-backup/` im Repo-Root, Eintrag in `.gitignore`.
Darin eine `README.md` mit Liste, was drin liegt und wo es herkam (Original-Pfade),
damit Wiederherstellung möglich bleibt.

**Zu verschieben (Frontend `frontend-next/`):**
- `app/LandingPage.tsx` + Landing-Rendering in `app/page.tsx` (Root-Page leitet danach direkt auf `/dashboard` bzw. `/login`)
- `app/upgrade/page.tsx`
- `app/api/stripe/` (checkout, portal, webhook) + `lib/stripe/`
- `lib/constants/plans.ts` (Plan-/Pricing-Logik)
- `components/onboarding/OnboardingTour.tsx` + alle Aufrufe
- `app/api/feedback/route.ts` (Feedback-Formular war fürs Produkt)
- Scanner-Gate/Unlock-Mechanik (`components/scanner/ScannerGate.tsx`, `app/api/auth/scanner-status`, `scanner-unlock`), falls sie nur Zahlschranke war — Scanner soll für den eingeloggten Nutzer einfach offen sein
- `app/agb/`, `app/datenschutz/`, `app/impressum` → auch ins Backup (privates Tool braucht keine Rechtstexte)

**Danach aufräumen:**
- Alle Imports/Referenzen auf verschobene Dateien entfernen (Subscription-Checks im Layout/Proxy, Stripe-Env-Variablen aus `.env.example`, Plan-Badges in der UI)
- Auth bleibt (Login via Supabase), aber ohne Plan-/Abo-Logik: eingeloggt = voller Zugriff
- `npm run build` muss fehlerfrei durchlaufen, `npm run dev` alle Seiten prüfen

---

## Aufgabe 2 — Erklär-Bericht (HTML) zu den Analyse-Daten

Einen eigenständigen HTML-Bericht erstellen (z.B. `docs/analyse-leitfaden.html`),
der für **jede Datenquelle** erklärt:

1. **COT**: Was bedeuten Netto-Position, Perzentil, 4W-Flow (% OI), Streak?
   Konkrete Lese-Regeln: "Wenn Währung X im 90. Perzentil steht, heißt das …",
   "Flow +4 % OI in 4 Wochen heißt …", Extrem-Perzentil = Konträr-Warnung, usw.
2. **Makro & Zinsen**: Welche Serien werden geladen (FRED), was bedeutet
   Leitzins-Trend / 10Y-Spread, wie lese ich die Panels?
3. **Retail-Sentiment**: Quelle (Myfxbook), Aktualität, Konträr-Logik
   (≥65 % long = Short-Signal), was Delta-pp bedeutet.
4. **Intermarket**: Was zeigen Korrelationsmatrix/DXY/Overlay, wofür nützlich,
   und ehrliche Einordnung der Relevanz fürs GVA/BOS-Trading.
5. **Wichtig — für jede Quelle explizit beantworten: wird sie nur ANGEZEIGT
   oder fließt sie in Signale ein?** Ist-Zustand (verifiziert im Code):
   - **Weekly Outlook (`evaluatePair`, 5 Faktoren):** Zinsdifferenz, COT-Flow/Perzentil,
     Saisonalität, 10Y-Yield-Spread, Retail-Sentiment (konträr) → ≥2 gleichgerichtete
     Faktoren = Richtung. **Alles davon wird also verarbeitet, nicht nur angezeigt.**
   - **Currency Bias (Dashboard/Vergleich, `evaluateCurrency`, 4 Faktoren):** COT-Flow 4W,
     Leitzins-Trend 6M, CB-Stance (manueller Score), Stärke 1M.
   - **Nur Anzeige, fließt in KEIN Signal:** Intermarket (Korrelationen, DXY),
     Kalender, Makro-Detailpanels über die Zins-Serien hinaus.

Der Bericht soll praxisnah sein: pro Abschnitt eine "So handle ich danach"-Box.

---

## Aufgabe 3 — Dashboard & Weekly Outlook umbauen

**Dashboard = Währungs-Cockpit:** Die 8 Währungen (USD, EUR, GBP, JPY, CHF, AUD, NZD, CAD)
untereinander als Übersicht. Pro Währung eine Zeile/Karte mit:
- COT: bullish/bearish/neutral (Flow + Perzentil-Kontext)
- Zinsen: letzte Bewegung (Richtung, bps in 6M)
- Retail-Positionierung (aggregiert über die Pairs der Währung)
- Saisonalität: welche Pairs der Währung diesen Monat historisch long/short tendieren
- **High-Impact-News-Flag**: anstehende High-Impact-Events dieser Währung
  (aus dem vorhandenen Kalender/ForexFactory-Feed) direkt an der Währung anzeigen

Basis existiert schon: `lib/calc/currencyBias.ts` liefert fast alles — erweitern statt neu bauen
(Retail-Aggregation + Saisonalität je Währung + News-Flag ergänzen).

**Weekly Outlook:**
- Nur Outlooks mit Signal anzeigen (Direction ≠ null) — ist schon so, beibehalten
- **Datum ergänzen: seit wann besteht dieser Outlook?** Dafür Outlook-Verdicts
  wöchentlich persistieren (neue Supabase-Tabelle `weekly_outlook_snapshots`:
  Woche, Pair, Richtung, Faktoren-JSON, alignedCount). Anzeige: "Signal seit KW … / n Wochen"
- High-Impact-News der beteiligten Währungen auf der Outlook-Karte anzeigen

> Die Snapshot-Tabelle ist gleichzeitig die **Datenbasis fürs spätere ML-Backtesting**
> (siehe unten) — deshalb Teil dieses Umbaus, nicht später.

---

## Aufgabe 4 — Navigation vereinfachen

Analyse-Gruppe umbauen:
- **Immer sichtbar:** Dashboard, Weekly Outlook, Vergleich
- **Einklappbare Untergruppe "Details"** (zu/auf wie Akkordeon): COT-Analyse, Makro & Zinsen,
  Retail Sentiment, Intermarket, Saisonalität, Kalender
- Detail-Seiten bleiben bestehen (COT-Seite hat Backtest/Conditional-Tools — nicht in
  Vergleich hineinquetschen, nur seltener sichtbar)
- Markt-Scanner- und Journal-Gruppen unverändert

---

## Kontext für später (NICHT jetzt bauen): ML-/Backtest-Modul

Ziel: Weekly-Outlook-Signale über ~2 Jahre backtesten.
- Fragen: Trefferquote nach 1/2/3/4 Wochen? Welche Währung liefert die besten Signale?
  Welche Faktor-Kombination? Ab wie vielen alignierten Faktoren lohnt es sich?
- Voraussetzung 1: `weekly_outlook_snapshots` (Aufgabe 3) sammelt ab sofort echte Snapshots
- Voraussetzung 2: Historische Rekonstruktion — COT- und FRED-Historie sind rückwirkend
  ladbar, Saisonalität berechenbar; **Retail-Sentiment-Historie existiert nur ab Beginn
  der eigenen Snapshots** → historische Verdicts ohne Sentiment-Faktor rechnen (4 Faktoren)
  und das im Backtest kennzeichnen
- Kursdaten für die Erfolgsmessung: Oanda (vorhandene Anbindung)

---

## Arbeitsweise

- Reihenfolge: Aufgabe 1 → 4 → 3 → 2 (erst aufräumen, dann Struktur, dann Inhalt, dann Doku)
- Nach jeder Aufgabe: `npm run build` + lokaler Smoke-Test, erst dann weiter
- Commits lokal je Aufgabe, Push erst am Ende nach Freigabe
