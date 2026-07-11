# GVA-Screener — Claude Code Kontext

## Was dieses Projekt ist
Trading-Scanner für 28 FX-Pairs. Erkennt GVA-Kerzenmuster, bildet Linien (Short/Long).
Live-Hit → Telegram-Alert. Dashboard zeigt alle Pairs farbig.
**Primär für Kerim selbst** — nicht für den Markt.

## Wichtige Dateien lesen
- `STATUS.md` — detaillierter Projektstand, Architektur, offene TODOs → **immer zuerst lesen**
- `../CONTEXT.md` — sessionübergreifender Handoff (was zuletzt gemacht wurde, was noch offen ist)
- `../CLAUDE.md` — Kerims persönliche Infos, Projekte, Präferenzen

## Aktueller Fokus (Stand 2026-07-11)
Nächster grosser Schritt: **Fundamental-Bias-Modul** (siehe STATUS.md → "IN ARBEIT")

Reihenfolge:
1. `fundamentals.py` testen (FRED-Selftest, fehlende Serien-IDs fixen)
2. COT Z-Score ergänzen
3. Risk-Regime (OANDA)
4. Öl-Trend (OANDA)
5. Saisonalität
6. Scoring + Background-Loop
7. Frontend-Integration

## Deployment
- Backend: Render → https://gva-screener.onrender.com (`Backend/`, FastAPI)
- Frontend: Vercel (`frontend-next/`, Vite/React), `VITE_API_URL` ohne `/` am Ende

## Präferenzen
- Kurze, präzise Antworten
- Kompletten, funktionierenden Code — nichts weglassen
- Bei Unklarheiten zuerst fragen
- Sprache: Deutsch
