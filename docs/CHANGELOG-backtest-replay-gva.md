# Änderungen — Backtest, Replay & GVA-Logik (2026-07-13)

Zusammenfassung der Arbeit an Backtest-Lab, GVA-Replay und der GVA-Kerzen-/
Muster-Logik. Neueste Änderung zuerst.

---

## 1. GVA-3D-Kerzen wie TradingView (Commit `b44d1e0`) — Kern-Fix

**Problem:** Replay/Scanner zeigten andere GVA-Linien als das Pine Script auf
TradingView. Ursache (an TV-Referenzkerzen von EURUSD verifiziert):

- **Gruppierung:** TradingView bildet eine 3D-Kerze aus **3 aufeinanderfolgenden
  echten Handelstagen** und überspringt Feiertage. Das Backend zählte dagegen
  **Kalender-Werktage ÷ 3** ab festem Anker → über Feiertage driftete das Raster
  jahrweise gegen TV weg (nahe heute korrekt, ein Jahr zurück alles verschoben).
- **Datenquelle Replay:** las aus `price_daily` (Supabase) — dort fehlen alle
  Freitage, dafür sind Sonntags-Kerzen drin → völlig andere Kerzen-Bodies.

**Fix** (`Backend/data_pipeline.py`, geteilt von Scanner + Replay):
- `fetch_daily_oanda()` — sauberer OANDA-Tages-Feed (NY-Alignment 17 Uhr, ohne
  Wochenenden). Basis für Scanner UND Replay.
- `resample_3d_bars()` — gruppiert nach **Kerzen-Position** (je 3), phasiert am
  TV-verifizierten Block-Start **2025-05-06**. Feiertage verschieben die Phase
  nicht mehr gegen TV. Reproduziert exakt `{6,7,8}{9,12,13}{14,15,16}`.
- `Backend/replay/gva_history.py` + `trade_result.py`: nutzen jetzt denselben
  OANDA-Feed + dieselbe Resample; `price_daily`-Abhängigkeit im Replay entfernt.

**Offen:** Live-Vergleich gegen TV (OANDA-Key nur auf Render). Anker ggf. um
1 Kerze nachjustieren, falls OANDA und TV an einem historischen Feiertag
differieren — dafür braucht es eine TV-3D-Kerze aus 2026 (Datum + O/C).

## 2. GVA-Muster auf Pine Script v4.0 (Commit `3e15e4c`)

Detection-Logik in `Backend/analyzer.py` (zentral, Replay importiert sie):
- **LONG:** Kerze A bearisch → B bullisch, `Body B ≥ 1.4 × Body A`,
  `|Body-Boden A − Body-Boden B| ≤ 5 % von Body A` → Level = Body-Boden B
- **SHORT:** A bullisch → B bearisch, Body-Tops analog → Level = Body-Top B
- Touch: Wick zählt, exakt. Ersetzt die alte Gap-Logik (2.5 Pips, Faktor 1.3).
- Parameter: `GVA_TOL_PCT = 0.05`, `GVA_SIZE_FACTOR = 1.4`.

## 3. GVA-Replay mit Session-Struktur (Commit `2793453`)

`Backend/replay/routes.py`, `frontend-next/components/ml/ReplayExplorer.tsx`:
- Landing mit allen Sessions: weiterfahren, auswerten, umbenennen, löschen.
- Wizard fragt Pair + Start-/Enddatum **vor** dem Laden.
- Raum springt beim Fortsetzen zum ersten unbewerteten Hit; Abschliessen →
  Session-Auswertung (WR, R:R, PF, Breakdown Richtung/Pair/Jahr).
- Endpoints: `POST/GET/PATCH/DELETE /replay/sessions`, `?session_id=` in stats.
- **Rein technisch** — Fundamentals im Replay bewusst entfernt.

## 4. Backtest-Lab: Fundamental-Modus + Skips (Commits `5c489fc`, `b8d847f`, `2d5de0d`, `0915be8`)

- Session-Wizard 2-stufig: Daten → Wahl **mit/ohne fundamentale Daten**.
- `GET /replay/rankings`: alle Wochen-Rankings (as-of Zins+Saison + Q-Stufen)
  eines Pairs im Zeitraum, **24 h im localStorage gecacht**.
- Erfassungs-Raum: Fundamental-Panel je Woche (Q-Badges, JA/NEIN/NEUTRAL),
  Datum-Navigation ◀ ▶ +1W, Skip-Erfassung mit Grund (Fundamental / kein BOS),
  Trades löschbar.
- Auswertung: „Fundamental — mit vs. gegen Rückenwind" (A/B) + Skip-Tabelle;
  Skips zählen nie in Winrate/Equity.
- **TZ-Bug gefixt:** Wochen-Keys nutzten `toISOString()` → UTC-Kipp verschob
  alle Wochen um 1 Tag; jetzt lokale Formatierung.

## 5. Navigation (Commit `5c489fc`)

- Neue Gruppe **Backtest** (Backtest-Lab + Replay), eigenständig.
- **Strategien → System** (raus aus Journal).
- **Training** aus Nav (Seite bleibt unter `/ml/training`).
- Sidebar-Active-Fix: längster Pfad-Match gewinnt (Daten-Check leuchtete zuvor
  bei jeder `/ml`-Unterseite mit).

---

## Offene manuelle Schritte

1. **Replay-Migration** in Supabase ausführen: Inhalt von
   `Backend/replay/migrations_sessions.sql` (SQL-Editor) — sonst schlagen
   Replay-Sessions fehl (Tabelle `replay_sessions` fehlt).
2. Nach Deploy: Replay EURUSD gegen TradingView prüfen; Anker ggf. nachjustieren.
3. Kurzer Blick auf Scanner-Aktivlinien vor dem Vertrauen auf Telegram-Alerts
   (Scanner teilt jetzt die neue 3D-Logik).
