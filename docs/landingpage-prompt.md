# Prompt: Landing Page für FX Terminal

> Diesen Prompt direkt in Claude Code / VS Code einfügen.
> Die mit `[SCREENSHOT: ...]` markierten Stellen bitte als Bild-Anhänge mitschicken.

---

## Aufgabe

Baue eine professionelle, konversionsoptimierte Landing Page für ein SaaS-Produkt namens **FX Terminal** — ein fundamentales Analyse-Terminal für FX-Swing-Trader. Die Page soll als neue Next.js-Route `/` im bestehenden Projekt (`frontend-next/`) integriert werden. Nicht eingeloggte User sehen die Landing Page; eingeloggte User mit aktiver Subscription werden direkt zum Dashboard (`/dashboard`) weitergeleitet.

---

## Zielgruppe

- Devisenhändler (Forex), hauptsächlich deutschsprachig
- Swing-Trader (halten Positionen 1–10 Tage)
- Kennen Trading-Begriffe (COT, Zinsdifferenz, Risk-On/Off, R-Multiple)
- Suchen ein Tool, das ihnen Analyse-Arbeit abnimmt und Daten strukturiert aufbereitet

---

## Tech-Stack (bestehend, anpassen)

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS v4** (PostCSS)
- **Supabase Auth** (Google OAuth) — Login-Button auf der Page verlinkt auf `/login`
- Bestehende CSS-Custom-Properties aus `app/globals.css` verwenden:
  ```css
  --bg, --surface, --surface2, --border, --text, --muted, --faint
  --accent (Blau), --up (Grün), --down (Rot), --warn (Gelb/Orange)
  ```
- Schriften: `system-ui` (Sans), `ui-monospace` (Mono)
- Keine externen UI-Libraries verwenden

---

## Seitenstruktur (Abschnitte in dieser Reihenfolge)

### 1. Navbar (sticky)
- Links: Logo + "FX Terminal" Schriftzug
- Rechts: Anker-Links zu Features, Preisen + Button "Anmelden" → `/login`
- Dunkel, halb-transparent mit `backdrop-blur`

### 2. Hero
- **Headline (groß, fett):**
  > „Alle fundamentalen FX-Daten. Ein Terminal."
- **Subline:**
  > „COT-Positionierung, Zinsdifferenzen, Makro-Daten, Retail-Sentiment und Saisonalität — automatisch aggregiert und täglich aktualisiert. Für Swing-Trader, die wissen wollen, was das große Geld macht."
- **CTAs:** Primär „Jetzt abonnieren – CHF 34.95/Monat" (→ `/upgrade`), Sekundär „Anmelden" (→ `/login`)
- **Visual:** Großer Screenshot des Dashboards als dunkler, leicht gedimmter Hero-Image-Hintergrund oder als Card daneben.

  > [SCREENSHOT: Haupt-Dashboard — zeigt Currency Strength, Risk Gauge, Pair Screener, CB-Spektrum nebeneinander]

### 3. Social Proof / Vertrauensleiste
- Datenquellen als Logos/Badges:
  `OANDA` · `CFTC` · `FRED (US Fed)` · `ForexFactory` · `Myfxbook`
- Text darunter: „Daten direkt von den Quellen. Täglich automatisch aktualisiert."

### 4. Problem → Lösung
Zweispaltiges Layout:

| Ohne FX Terminal | Mit FX Terminal |
|---|---|
| 3–5 Tabs offen (FRED, CFTC, Myfxbook…) | Alles in einer App |
| Daten manuell zusammensuchen | Täglich automatisch geladen |
| COT-Report selbst auswerten | Direktes Signal + historischer Edge |
| Zinsdifferenz im Kopf berechnen | Fertige Spread-Charts |
| Journal in Excel | Integriertes Journal mit R-Auswertung |

### 5. Kernfeatures (6 Feature-Kacheln, 2×3 Grid)

**Kachel 1 — Pair Screener**
- Icon: 🎯
- Titel: „Automatische Trade-Ideen"
- Text: „28 FX-Paare, bewertet nach 5 unabhängigen Faktoren: Zinsdifferenz, COT-Flow, Saisonalität, Zinstrend und Retail-Sentiment. Nur Paare mit echter Konfluenz werden angezeigt."
- Screenshot: Pair-Screener mit Long/Short-Labels

  > [SCREENSHOT: Pair Screener Panel — zeigt Paare mit LONG/SHORT-Chips und Faktor-Begründung]

**Kachel 2 — COT-Analyse**
- Icon: 📊
- Titel: „Institutionelle Positionierung"
- Text: „Wöchentlicher CFTC-Report aufbereitet: Netto-Position, 5-Jahres-Perzentil, Flow-Trend und historischer Backtest. Sehe, was das große Geld wirklich macht — nicht nur das Niveau, sondern die Veränderung."
- Screenshot: COT-Chart mit Perzentil-Anzeige

  > [SCREENSHOT: COT-Analyse — History-Chart mit Positionierung + Extrem-Übersicht]

**Kachel 3 — Makro & Zinsen**
- Icon: 🏦
- Titel: „Zins & Makro"
- Text: „Leitzinsen, 10Y-Renditen, Inflationsraten, Arbeitslosenquoten und Wirtschaftswachstum für alle G8-Währungsräume — direkt aus der FRED-Datenbank. Mit Zinserwartungs-Panel und Spread-Charts."
- Screenshot: Regionen-Vergleich

  > [SCREENSHOT: Regionen-Vergleich — zwei Länder nebeneinander mit allen Makro-Kennzahlen]

**Kachel 4 — Währungs-Kompass**
- Icon: 🧭
- Titel: „4-Faktoren-Bias je Währung"
- Text: „Jede der 8 G8-Währungen erhält einen Long/Short/Neutral-Bias aus COT-Flow, Leitzins-Trend, Zentralbank-Stance und Preisstärke. Stärkste gegen schwächste = sauberstes Paar."
- Screenshot: Currency-Bias-Kacheln

  > [SCREENSHOT: Currency Bias Panel — 8 Kacheln mit LONG/SHORT/NEUTRAL je Währung]

**Kachel 5 — Trading Journal**
- Icon: 📒
- Titel: „Integriertes Journal"
- Text: „Trades erfassen mit R-Multiple, Strategie, Confluences und Screenshot. Automatische Auswertung: Win-Rate, Profit-Faktor, Expectancy, Drawdown, Equity-Kurve. Plus Backtest-Raum zum Üben."
- Screenshot: Journal Dashboard

  > [SCREENSHOT: Journal Dashboard mit Equity-Kurve und Performance-Kennzahlen]

**Kachel 6 — Weekly Outlook**
- Icon: 📅
- Titel: „Sonntagabend-Cockpit"
- Text: „Paar-Karten mit vollständigem Wochen-Dossier: institutionelle Positionierung, Saison, Sentiment, bevorstehende Termine — sortiert nach Konfluenz-Stärke. Ein Klick erstellt direkt einen Journal-Outlook."
- Screenshot: Weekly Outlook Karten

  > [SCREENSHOT: Weekly Outlook — Paar-Karten mit Score, Richtung und aufgeklappten Signal-Gründen]

### 6. Detailierter Feature-Walkthrough (alternierend, links/rechts)

**Block A — Risk-On/Off-Anzeige**
- Text: „Weißt du gerade, ob der Markt risikofreudig oder defensiv ist? VIX, Gold-Trend, JPY/CHF-Stärke und S&P-500-Trend werden zu einem einzigen Regime-Score zusammengefasst. Risk-On → AUD, NZD, CAD bevorzugt. Risk-Off → JPY, CHF gesucht."
- Screenshot rechts

  > [SCREENSHOT: Risk Gauge Panel]

**Block B — Saisonalität**
- Text: „Manche Monate sind historisch verlässlich — andere nicht. Die Saisonalitäts-Heatmap zeigt für alle 28 Paare den Durchschnittsreturn und die Trefferquote je Kalendermonat über die gesamte verfügbare Historie. Mit automatischer Warnung wenn die Stichprobe zu klein ist."
- Screenshot links

  > [SCREENSHOT: Saisonalitäts-Heatmap]

**Block C — Intermarket & Korrelationen**
- Text: „Bewegen sich EUR/USD und GBP/USD gerade parallel? Eine Korrelationsmatrix zeigt auf einen Blick, welche Paare sich gleich oder gegenläufig bewegen — wichtig, um unbewusstes Doppel-Risiko zu vermeiden. Plus DXY-Chart und freies Overlay-Tool für Rohstoff-Währungs-Vergleiche."
- Screenshot rechts

  > [SCREENSHOT: Korrelationsmatrix oder DXY-Chart]

### 7. Preisblock

Zentrierung, klarer Card-Style:

```
FX Terminal
──────────────────────────────
CHF 34.95 / Monat
Monatlich kündbar · keine Mindestlaufzeit
──────────────────────────────
✓  28 FX-Paare — COT, Screener, Stärke
✓  Makro-Fundamentals (FRED, CFTC, OANDA)
✓  Zentralbank-Stance & Zinsdifferenzen
✓  Retail-Sentiment (Myfxbook)
✓  Saisonalität & Intermarket-Korrelationen
✓  COT-Backtest & historischer Edge-Test
✓  Integriertes Trading Journal
✓  Weekly Outlook & Wirtschaftskalender
✓  Täglich automatisch aktualisiert
──────────────────────────────
[ Jetzt abonnieren ]
Sichere Zahlung via Stripe · SSL-verschlüsselt
```

### 8. FAQ

- **Brauche ich Trading-Vorwissen?** → Die App richtet sich an aktive FX-Trader. Grundkenntnisse in COT-Reports und Fundamentalanalyse sind von Vorteil.
- **Wie aktuell sind die Daten?** → Preise, Zinsen und Sentiment täglich aktualisiert; COT-Report wöchentlich (freitags); Makrodaten monatlich.
- **Kann ich jederzeit kündigen?** → Ja, monatlich kündbar. Kein Abo-Trap.
- **Welche Währungspaare werden abgedeckt?** → Alle 28 Major- und Minor-Paare der G8-Währungen: USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD.
- **Gibt es eine Testphase?** → Derzeit nicht, aber du kannst monatlich kündigen.
- **Was ist der Unterschied zur kostenlosen Alternative?** → FX Terminal aggregiert Daten aus 6 Quellen vollautomatisch, berechnet Backtests und zeigt institutionelle Positionierung mit historischem Kontext — das dauert manuell Stunden pro Woche.

### 9. Footer

- © 2026 FX Terminal
- Links: Datenschutz (`/datenschutz`) · AGB (`/agb`) · Anmelden (`/login`)
- Haftungsausschluss (klein): „FX Terminal stellt keine Anlageberatung dar. Alle Inhalte dienen ausschließlich zu Informationszwecken."

---

## Design-Vorgaben

**Farbschema:** Dunkel-First (wie die App selbst)
- Hintergrund: `var(--bg)` = `#0b0f14`
- Cards: `var(--surface)` = `#10151c`
- Borders: `var(--border)` = `#232c38`
- Accent: `var(--accent)` = `#58a6ff`
- Text: `var(--text)` = `#c9d3df`
- Muted: `var(--muted)` = `#8b96a5`
- Up/Long: `var(--up)` = `#3fb950`
- Down/Short: `var(--down)` = `#f85149`

**Typografie:**
- Headlines: `font-weight: 700–800`, `letter-spacing: -0.02em`, groß und mutig
- Body: 16–17px, `line-height: 1.6`
- Monospace-Highlights (für Datenpunkte/Zahlen): `ui-monospace`

**Stil-Prinzipien:**
- Kein weißer Hintergrund
- Daten-orientiert: Zahlen und Beispielwerte direkt in den Text einbauen (z.B. „5-Jahres-Perzentil", „28 Paare", „€29/Monat")
- Subtle Glows / Gradients erlaubt (z.B. blauer Accent-Glow hinter Hero)
- Screenshots als dunkle, border-umrahmte Cards (`border: 1px solid var(--border); border-radius: 8px`)
- Feature-Chips für Labels: `LONG` in Grün, `SHORT` in Rot, `NEUTRAL` in Gelb — kleine `font-mono`-Badges

---

## Routing-Integration (Next.js)

Die Landing Page ersetzt die aktuelle Root-Route. Passe die Middleware (`proxy.ts`) so an, dass:
- Nicht eingeloggte User auf `/` die Landing Page sehen (kein Redirect zu `/login`)
- Eingeloggte User ohne Subscription auf `/upgrade` weitergeleitet werden (wie bisher)
- Eingeloggte User mit aktiver Subscription direkt zum Dashboard (`/`) weitergeleitet werden

Konkret in `proxy.ts`:
```typescript
const isPublic =
  pathname === "/" ||                  // Landing Page
  pathname.startsWith("/login") ||
  pathname.startsWith("/auth") ||
  pathname.startsWith("/upgrade");
```

Und für das Dashboard: das bisherige `/` im `(app)`-Segment bleibt, aber die Landing Page liegt als `app/page.tsx` außerhalb der `(app)`-Gruppe.

---

## Was du NICHT bauen sollst

- Keine Animationen, die die Performance beeinflussen (kein GSAP, kein Framer Motion)
- Kein Blog, keine Docs-Sektion
- Keine Mehrsprachigkeit
- Kein Chat-Widget / Intercom / Tawk

---

## Ablieferformat

- Eine einzige Datei: `frontend-next/app/page.tsx`
- Plus Anpassung `frontend-next/proxy.ts` (isPublic-Ergänzung)
- Alle Inhalte inline (keine separaten CSS-Dateien nötig, Tailwind-Klassen reichen)
- Screenshots werden später als `public/screenshots/` eingebunden — vorerst Placeholder-`<div>`s mit fixer Höhe und `bg-surface2` + zentriertem Text `[Screenshot: ...]`
