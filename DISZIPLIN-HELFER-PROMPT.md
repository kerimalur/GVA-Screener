# Prompt: Consistency-/Disziplin-Helfer

> Status: **Idee — noch nicht umgesetzt.** Diese Datei hält Kerims Idee fest und
> beauftragt Claude Code, einen sinnvollen, mehrwertigen Einbau zu entwerfen.

## Kerims Idee (Rohform)

Bei **1:4 RR** und **1 Trade/Woche**:
- 1 Win/Monat = **+4 %**
- ~50 % Winrate über den Monat = **~+6 %**

**Das Problem — Disziplin, nicht Strategie:**
Sobald ein *zusätzliches* Setup auftaucht, kippt die Frage „nehmen oder warten?"
die ganze Rechnung. Jeder Extra-Trade erhöht die Varianz, verwässert die
Selektivität und verführt zum Overtrading. Genau in diesem Moment — Setup sichtbar,
Entscheidung offen — soll der Helfer unterstützen: **erinnern, was der Plan war,
und die Konsequenz des Extra-Trades sichtbar machen**, damit die Entscheidung
diszipliniert statt impulsiv fällt.

Kern-Wert für Kerim: **Konsistenz erzwingen** (wenige, saubere Trades) statt aus
Langeweile/FOMO die Frequenz hochzudrehen.

## Auftrag an Claude Code

Bevor du Code schreibst: **überlege dir, wie man das sinnvoll einbaut, sodass es
echten Mehrwert hat** — kein Gimmick. Nutze das brainstorming-Skill.

Arbeite mindestens folgende Fragen heraus und stelle sie Kerim (eine nach der anderen):

1. **Wo lebt der Helfer?** Dashboard-Widget · Journal · eigener Tab · Modal beim
   Trade-Eintrag? (Er soll im Entscheidungsmoment sichtbar sein.)
2. **Welche Datenbasis?** Vorhandenes Journal (Trades, RR, Datum) + Wochen-Cadence.
   Was ist schon da (`frontend-next/lib/journal/*`), was fehlt?
3. **Was zeigt er konkret?** Vorschläge, die Mehrwert bringen könnten:
   - Trades-diese-Woche-Zähler + Soll (z.B. „1/1 genutzt — weiterer Trade = außerhalb Plan").
   - Live-Monats-Projektion: „aktuell +4 %; dieser Extra-Trade bei Loss = −1 %, Erwartungswert ändert sich um X".
   - Selektivitäts-Ampel: passt das Setup zu den A+-Kriterien (Q5/Q1-Konfluenz, Session, GVA)?
   - Cool-down/Bestätigungs-Hürde bei einem zweiten Trade in derselben Woche.
4. **Guardrails gegen Overtrading:** wie verhindert das Design, dass der Helfer selbst
   zum Rechtfertigungs-Tool für mehr Trades wird?
5. **Messbarkeit:** woran erkennt Kerim nach 1–2 Monaten, dass der Helfer wirkt
   (weniger Trades? höhere Ø-RR? bessere Winrate)?

**Vorgehen:** 2–3 Ansätze mit Trade-offs vorschlagen, Empfehlung nennen, Design von
Kerim freigeben lassen, **dann** implementieren. YAGNI — lieber ein Element, das er
täglich anschaut, als fünf, die er ignoriert.

## Kontext-Verweise
- RR/Winrate-Mathematik: siehe oben.
- Journal-Daten: `frontend-next/lib/journal/` (Trades, Strategien, Outlooks).
- Dashboard-Muster: `frontend-next/components/dashboard/WeekPlan.tsx` (Client-Widget mit Live-Poll).
- Ursprung: `FX-Terminal/Offene-Punkte_2026-07-15.md`, Punkt 14.
