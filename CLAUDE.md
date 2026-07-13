# GVA-Screener — Claude Code Kontext

## Was dieses Projekt ist
Trading-Scanner für 28 FX-Pairs. Erkennt GVA-Kerzenmuster, bildet Linien (Short/Long).
Live-Hit → Telegram-Alert. Dashboard zeigt alle Pairs farbig.
**Primär für Kerim selbst** — nicht für den Markt.

## Wichtige Dateien lesen
- `STATUS.md` — detaillierter Projektstand, Architektur, offene TODOs → **immer zuerst lesen**
- `../CONTEXT.md` — sessionübergreifender Handoff (was zuletzt gemacht wurde, was noch offen ist)
- `../CLAUDE.md` — Kerims persönliche Infos, Projekte, Präferenzen

## Aktueller Fokus (Stand 2026-07-13)
**ML-Engine** — kontinuierliche Experiment-Suche (GitHub Actions, nächtlich) +
wöchentliches Währungs-Ranking als fundamentale Confluence. Gebaut und getestet;
siehe STATUS.md → "ML-Engine" (inkl. offener manueller Schritte: GitHub-Secrets,
erster Workflow-Dispatch). Spec: `docs/superpowers/specs/2026-07-13-ml-engine-design.md`

## Deployment
- Backend: Render → https://gva-screener.onrender.com (`Backend/`, FastAPI)
- Frontend: Vercel (`frontend-next/`, Vite/React), `VITE_API_URL` ohne `/` am Ende

## Präferenzen
- Kurze, präzise Antworten
- Kompletten, funktionierenden Code — nichts weglassen
- Bei Unklarheiten zuerst fragen
- Sprache: Deutsch
