# Terminal-Design-System app-weit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Nur Styling/Komponenten — keine Fachlogik.

**Goal:** Ein Token-Set + 8 Basis-Komponenten (`components/ui/terminal/`), app-weit angewendet; Charts auf reduzierte Terminal-Palette; Screenshot-Konsistenz aller Bereiche mit dem Macro Terminal.

**Befund:** Token-Set existiert bereits in `app/globals.css` (@theme: bg/surface/surface2/border/text/muted/faint/accent/up/down/warn/neutral + Manrope/JetBrains Mono). Kern-Inkonsistenzen: (1) `chartTheme.ts` nutzt abweichende GitHub-Palette (#3fb950/#58a6ff/8-Farben-bunt) statt Terminal-Tokens; (2) Layout-Kern (Panel/TopBar/Sidebar/PairSearchBar) + StatCard/ml/einstellungen/journal mit Inline-Styles bzw. Ad-hoc-Hex; (3) kein gemeinsames Karten/Tag/Metric-Vokabular — jede Seite baut eigene Divs.

**Architektur:** globals.css bleibt Single Source (ergänzt um Regime-Farben, Dim-Varianten, Radius-Tokens). chartTheme.ts wird auf die Tokens gemappt (ein Fix wirkt in alle Recharts-Wrapper). Neue Terminal-Komponenten kapseln das Vokabular; bestehende `components/ui/*` bleiben (Segmented/Modal/Skeleton werden wiederverwendet), StatCard wird im Terminal-Stil neu implementiert und re-exportiert.

---

## Tasks

### Task 1: Tokens erweitern (`app/globals.css`)
- [ ] @theme ergänzen: `--color-warn-dim`, `--color-neutral-dim`, Regime-Paare (`--color-regime-goldilocks` grün-tint, `-stagflation` rot, `-reflation` orange, `-overheating` gelb, `-disinflation` blau; je Text + Dim-Hintergrund), `--radius-card: 12px`, `--radius-tag: 4px`

### Task 2: Chart-Palette (`components/charts/chartTheme.ts`)
- [ ] Farben auf Terminal-Tokens: up #3ddc97, down #ef6461, accent #6c8cff, warn #f5a623, neutral/faint #565d6b, text #8d94a3, grid/axis blasses Weiß-Alpha auf #131519, surface #131519, border rgba(255,255,255,0.07)
- [ ] `palette` reduziert: Akzent + Grau-Abstufungen + semantische (up/down/warn) — dataviz-Validator (`--mode dark`, Surface #131519) laufen lassen, Ergebnis notieren; Legenden existieren in den Wrappern (kein color-alone)
- [ ] tooltipStyle auf Card-Look (surface2, border, radius 8, mono)

### Task 3: `components/ui/terminal/` (8 Komponenten + index.ts)
- [ ] `TerminalCard` (surface2, border, radius-card, p-3.5, optional onClick/hover: heller + border2)
- [ ] `BiasScore` (mono, fett, +/-, Farbe up/down/neutral; size sm/lg)
- [ ] `DirectionTag` (LONG/SHORT/NEUTRAL, dim-bg + farbiger Text, uppercase, radius-tag)
- [ ] `RegimeTag` (variant goldilocks|stagflation|reflation|overheating|disinflation, gleiche Anatomie)
- [ ] `Metric` (Uppercase-Label 9px faint, Mono-Wert 13px)
- [ ] `TerminalTable` (thead uppercase faint, mono-Zellen via Prop, Zeilen-Trenner border/40, kein Zebra)
- [ ] `TerminalHeader` (Titel + Untertitel muted)
- [ ] `StatCard` (Terminal-Look, ersetzt components/ui/StatCard-Optik; ui/index re-exportiert weiter)

### Task 4: Layout-Kern Inline→Token-Klassen (visuell gleich)
- [ ] `Panel.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `PairSearchBar.tsx`: style={{}} → Tailwind-Klassen mit Tokens

### Task 5: Bereichs-Anwendung (nur Klassen/Komponenten tauschen, keine Logik)
- [ ] Dashboard: NewsPanel-Zeilen (Zeit mono links, Impact-Tag rechts im DirectionTag-Stil), Umschalter → `ui/Segmented`
- [ ] Macro Terminal: TerminalOverview/CurrencyModal/DetailSections/Vergleich auf TerminalCard/BiasScore/DirectionTag/Metric umstellen
- [ ] Weekly: WeeklyPairCard/WeeklyBtcCard → TerminalCard + BiasScore + DirectionTag + Metric
- [ ] COT Intelligence (CotIntelligence/CotCurrencyDetail): Tags→DirectionTag-Anatomie, Karten→TerminalCard, Heatmap-Zellen aus up/down-Dim-Stufen
- [ ] Journal: Hex-Codes raus (CalendarView, EquityView), KPI→StatCard, Tabellen→TerminalTable-Klassen
- [ ] Scanner: HeatmapGrid/SpectrumBar/Radar-Farben auf Tokens
- [ ] ML: TrainingPanel/ml/page Hex→Tokens; Charts erben Task 2
- [ ] System: einstellungen/page Hex→Tokens, Leitfaden-Typo prüfen; login/page Hex→Tokens

### Task 6: Verifikation
- [ ] `grep` auf verbliebene Ad-hoc-Hex in app/components (außer globals.css/chartTheme) → 0 relevante Treffer
- [ ] `npm run build` grün; Lint keine NEUEN Fehler
- [ ] Stichproben-Review der Kernseiten im Code (Karten/Tags/Mono überall aus terminal/)
- [ ] Commit + Push
