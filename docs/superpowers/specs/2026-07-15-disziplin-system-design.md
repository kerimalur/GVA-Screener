# Disziplin-System: A+-Checkliste · Adherence-Score · Expectancy

Datum: 2026-07-15 · Status: von Kerim freigegeben (AskUserQuestion, inkl. DB-Migration)

## Ziel
Bessere Setup-Auswahl + Prozess-Disziplin im Journal. Drei Teile auf gemeinsamen
Trade-Daten, kein Prognose-/ML-Element. Rein additiv — bestehende Journaling-,
Balance- und Dashboard-Logik bleibt unverändert.

Hinweis: Das Trading-Journal-Repo ist archiviert; das Journal lebt in
`GVA-Screener/frontend-next` (Migration Juli 2026). Hier wird gebaut.

## Reale Datenstruktur (verifiziert)
- Tabelle `trades` (DB: `symbol`/`side`/`result`/`r_multiple`/`risk_percent`/`date`),
  Mapping in `lib/journal/trades.ts` (mapDbToApp/mapAppToDb).
- Settings-Persistenz: `user_preferences` Key/Value je User (`lib/journal/prefs.ts`).
- Formular: `components/journal/TradeFormModal.tsx`; Save-Flow
  `JournalView.handleSaveTrade` → `tradeService.saveTrade`.

## DB-Migration (additiv, nullable)
```sql
alter table trades
  add column if not exists aplus_criteria jsonb,
  add column if not exists aplus_verdict boolean,
  add column if not exists adherence_answers jsonb,
  add column if not exists adherence_score numeric;
```
Alte Trades: NULL = „ohne Checkliste erfasst" → fallen aus der A+-Auswertung.

## Teil 1 — A+-Checkliste (Pflicht bei neuen Trades)
- Kriterienliste editierbar in Journal-Settings, persistiert als
  `user_preferences.aplus_criteria` (string[]). Seeds: „GVA-Hit",
  „BOS bestätigt", „Richtige Session (London 08–10 / NY 14–16 Uhr)",
  „Fundamental Q5/Q1 aligned".
- TradeFormModal: pro Kriterium Ja/Nein-Toggle, Start unbeantwortet.
  **Neue Trades:** Speichern blockiert bis alle beantwortet.
  **Bearbeiten:** gespeicherte Antworten editierbar; Alt-Trades ohne
  Checkliste → optional (kein Zwang nachträglich).
- Verdikt live sichtbar, sobald vollständig: A+ (alle ja) grün, sonst
  „NICHT A+" orange mit Hinweis „trotzdem loggen möglich".
- Pro Trade gespeichert: `aplus_criteria` = `[{label, met}]`, `aplus_verdict`.

## Teil 2 — Adherence-Score (nach dem Speichern)
- Fragenliste editierbar, `user_preferences.adherence_questions` (string[]).
  Seeds: „Entry nach Plan?", „Stop nach Plan?", „Kein Revenge/Overtrading?",
  „Exit nach Plan?".
- Nach erfolgreichem Save eines NEUEN Trades öffnet JournalView das
  AdherenceModal: jede Frage Ja/Nein → Score = erfüllt/gesamt in %.
  Speichern erst wenn alles beantwortet; „Überspringen" lässt NULL.
- Update auf den Trade: `adherence_answers` = `[{label, yes}]`, `adherence_score`.

## Teil 3 — ExpectancyCard (wiederverwendbar)
- Formel: `((WR · RR · Risiko%) − ((1−WR) · Risiko%)) · Trades/Monat` = %/Monat.
- Winrate live aus den geladenen Trades der Seite (aktiver Kontotyp);
  bei < 20 Trades → Fallback-Winrate aus Settings, klar gekennzeichnet („manuell").
- Parameter in `user_preferences.expectancy_params`:
  `{ riskPct, rr, tradesPerMonth, fallbackWinrate }`
  (Defaults 1 / 4 / 4 / 40).
- Kontrollwerte (1 %, RR 4, 4 Trades/Mt): WR 25 % → +1.0 %, WR 50 % → +6.0 %.
- Einbau: Journal (unter KPI-Reihe), Journal-Dashboard, Equity.

## Payoff — A+ vs. Nicht-A+ (Journal-Dashboard)
Panel mit zwei Spalten (nur Trades mit `aplus_verdict` ≠ NULL):
Anzahl · Winrate · Ø-Adherence-Score. Sichtbarer Beweis, ob A+-Selektion
die Winrate hebt.

## Nicht-Ziele
- Kein ML/Prognose-Element, keine Änderung bestehender Statistiken.
- Backtest-Room bleibt unberührt (Checkliste nur im Live-Journal-Formular).

## Verifikation
- `npm run build` sauber.
- Expectancy-Kontrollwerte rechnerisch geprüft.
- Neuer Trade ohne vollständige Checkliste nicht speicherbar; A+/Nicht-A+
  korrekt persistiert; Adherence-Modal erscheint nach Save.
