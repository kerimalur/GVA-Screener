# Vergleich-Stats & Währungs-Kompass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vergleich-Seite bekommt eine Δ-Stats-Tabelle (1W/1M/3M/1J) unter dem Chart; Dashboard bekommt einen "Währungs-Kompass" — Long/Short-Bias je G8-Währung aus 4 Faktoren mit Detail-Modal, ersetzt die COT-Schnellübersicht.

**Architecture:** Zwei pure Calc-Module (`changeStats.ts`, `currencyBias.ts`) ohne I/O, dazu zwei präsentationale Komponenten. Datenfluss unverändert: `loadDashboardData` berechnet den Bias serverseitig aus bereits geladenen Maps (null neue Supabase-Queries, 5-min-Cache greift weiter); die Vergleich-Tabelle nutzt die im `OverlayChart` bereits geladenen Serien (kein Doppel-Fetch).

**Tech Stack:** Next.js (App Router), React Client Components, Tailwind-Tokens des Projekts (`bg-surface2`, `text-up`/`text-down`, Mono-Font), bestehende `Modal.tsx`.

**Spec:** `docs/superpowers/specs/2026-07-06-vergleich-stats-currency-bias-design.md`

**Test-Hinweis:** Projekt hat keine Test-Infrastruktur (nur `eslint`; laut freigegebener Spec kein Framework einführen). Ersatz: Calc-Module werden per `npx tsx`-Sanity-Skript mit erwarteten Werten verifiziert (Skript danach löschen, nicht committen), UI per `npm run lint` + `npm run build` + manuellem Check.

**Arbeitsverzeichnis aller Befehle:** `frontend-next/` (`cd "c:/Projekte/VS Studio Test/GVA-Screener/frontend-next"`). Git-Befehle laufen im Repo-Root oder mit Pfaden relativ zu `frontend-next` — Pfade unten sind relativ zu `frontend-next/`, bei `git add` entsprechend `frontend-next/...` voranstellen.

---

## Feature 1 — Vergleich: Stats-Tabelle

### Task 1: Calc-Modul `changeStats.ts`

**Files:**
- Create: `frontend-next/lib/calc/changeStats.ts`
- Temporär (nicht committen): `frontend-next/tmp-sanity-changestats.mts`

- [ ] **Step 1: Modul schreiben**

`frontend-next/lib/calc/changeStats.ts`:

```ts
import type { SeriesPoint } from "./seriesMath";

export type ChangeWindow = "1W" | "1M" | "3M" | "1J";

export const CHANGE_WINDOW_DAYS: Record<ChangeWindow, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 91,
  "1J": 365,
};

export const CHANGE_WINDOWS = Object.keys(CHANGE_WINDOW_DAYS) as ChangeWindow[];

export interface ChangeStat {
  /** absolute Veränderung */
  delta: number;
  /** prozentual — null wenn Basiswert <= 0 (z. B. negatives COT-Netto) */
  pct: number | null;
}

export interface ChangeStats {
  last: number | null;
  lastDate: string | null;
  changes: Record<ChangeWindow, ChangeStat | null>;
}

/**
 * Δ-Statistik einer Serie mit datumsbasierten Lookbacks:
 * Vergleichswert = letzter Punkt <= Cutoff — funktioniert für
 * tägliche Preise und wöchentliche COT-Serien gleichermaßen.
 * Erwartet chronologisch sortierte Punkte.
 */
export function computeChangeStats(points: SeriesPoint[]): ChangeStats {
  const changes: ChangeStats["changes"] = { "1W": null, "1M": null, "3M": null, "1J": null };
  if (points.length === 0) return { last: null, lastDate: null, changes };

  const last = points[points.length - 1];

  for (const w of CHANGE_WINDOWS) {
    const cutoff = new Date(last.date);
    cutoff.setDate(cutoff.getDate() - CHANGE_WINDOW_DAYS[w]);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const past = [...points].reverse().find((p) => p.date <= cutoffStr);
    if (!past) continue;
    const delta = last.value - past.value;
    changes[w] = { delta, pct: past.value > 0 ? (delta / past.value) * 100 : null };
  }

  return { last: last.value, lastDate: last.date, changes };
}
```

- [ ] **Step 2: Sanity-Skript schreiben und ausführen**

`frontend-next/tmp-sanity-changestats.mts`:

```ts
import { computeChangeStats } from "./lib/calc/changeStats";

// 400 Tagespunkte, linear steigend
const daily = Array.from({ length: 400 }, (_, i) => {
  const d = new Date(2025, 0, 1);
  d.setDate(d.getDate() + i);
  return { date: d.toISOString().slice(0, 10), value: 100 + i * 0.1 };
});
const s = computeChangeStats(daily);
console.log("daily:", JSON.stringify(s.changes));
console.log("last:", s.last);

// negativer Basiswert → pct muss null sein
const negBase = [
  { date: "2026-06-01", value: -50 },
  { date: "2026-07-01", value: -20 },
];
console.log("negBase 1M:", JSON.stringify(computeChangeStats(negBase).changes["1M"]));

// leere Serie
console.log("empty:", JSON.stringify(computeChangeStats([])));
```

Run: `npx tsx tmp-sanity-changestats.mts`

Expected:
- `daily`: `last` = 139.9; Δ1W ≈ 0.7, Δ1M ≈ 3.0, Δ3M ≈ 9.1, Δ1J ≈ 36.5, alle `pct` ≠ null und positiv
- `negBase 1M`: `{"delta":30,"pct":null}`
- `empty`: `last` null, alle `changes` null

- [ ] **Step 3: Sanity-Skript löschen**

Run: `rm tmp-sanity-changestats.mts` (bzw. `Remove-Item tmp-sanity-changestats.mts`)

- [ ] **Step 4: Commit**

```bash
git add frontend-next/lib/calc/changeStats.ts
git commit -m "feat(vergleich): Delta-Statistik-Berechnung (changeStats)"
```

---

### Task 2: Komponente `CompareStatsTable.tsx`

**Files:**
- Create: `frontend-next/components/vergleich/CompareStatsTable.tsx`

- [ ] **Step 1: Komponente schreiben**

Kein `"use client"` nötig — reine Präsentation, wird vom Client-Component `OverlayChart` importiert.

`frontend-next/components/vergleich/CompareStatsTable.tsx`:

```tsx
import {
  computeChangeStats,
  CHANGE_WINDOWS,
  type ChangeStat,
} from "@/lib/calc/changeStats";
import type { SeriesPoint } from "@/lib/calc/seriesMath";

export interface CompareStatsRow {
  label: string;
  points: SeriesPoint[];
}

/** Kompakte Zahl: 98,4k für COT-Kontrakte, 4 Nachkommastellen für FX-Preise. */
function formatValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  if (abs >= 10) return v.toFixed(2);
  if (abs > 0) return v.toFixed(4);
  return "0";
}

function DeltaCell({ stat }: { stat: ChangeStat | null }) {
  if (!stat) {
    return <td className="px-3 py-2 text-right font-mono text-faint">–</td>;
  }
  const up = stat.delta > 0;
  const flat = stat.delta === 0;
  const cls = flat ? "text-faint" : up ? "text-up" : "text-down";
  return (
    <td className={`px-3 py-2 text-right font-mono ${cls}`}>
      <div className="font-bold">
        {up ? "+" : ""}
        {formatValue(stat.delta)} {flat ? "" : up ? "▲" : "▼"}
      </div>
      {stat.pct !== null && (
        <div className="text-[10px] opacity-80">
          {stat.pct > 0 ? "+" : ""}
          {stat.pct.toFixed(2)} %
        </div>
      )}
    </td>
  );
}

/** Δ-Statistik (1W/1M/3M/1J) je Serie — Zahlen zum Chart. */
export default function CompareStatsTable({ rows }: { rows: CompareStatsRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-faint border-b border-border">
            <th className="px-3 py-2 text-left font-medium">Serie</th>
            <th className="px-3 py-2 text-right font-medium">Letzter Wert</th>
            {CHANGE_WINDOWS.map((w) => (
              <th key={w} className="px-3 py-2 text-right font-medium">
                Δ {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stats = computeChangeStats(row.points);
            return (
              <tr key={row.label} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium max-w-56 truncate">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {stats.last !== null ? formatValue(stats.last) : "–"}
                  {stats.lastDate && (
                    <div className="text-[10px] text-faint font-normal">{stats.lastDate}</div>
                  )}
                </td>
                {CHANGE_WINDOWS.map((w) => (
                  <DeltaCell key={w} stat={stats.changes[w]} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: keine Fehler in `CompareStatsTable.tsx`

- [ ] **Step 3: Commit**

```bash
git add frontend-next/components/vergleich/CompareStatsTable.tsx
git commit -m "feat(vergleich): CompareStatsTable-Komponente"
```

---

### Task 3: OverlayChart-Prop `showStats` + Anbindung SeriesPicker

**Files:**
- Modify: `frontend-next/components/intermarket/OverlayChart.tsx`
- Modify: `frontend-next/components/vergleich/SeriesPicker.tsx:112-117`

- [ ] **Step 1: OverlayChart erweitern**

Drei Änderungen in `frontend-next/components/intermarket/OverlayChart.tsx`:

1. Import ergänzen (nach den bestehenden Imports):

```tsx
import CompareStatsTable from "@/components/vergleich/CompareStatsTable";
```

2. Interface `OverlayChartProps` — neues optionales Feld:

```tsx
  /** rollierende Korrelation (Fenster in Tagen) im Untertitel */
  corrWindow?: number;
  /** Δ-Stats-Tabelle (1W/1M/3M/1J) unter dem Chart */
  showStats?: boolean;
```

3. Funktionssignatur + Render. Signatur:

```tsx
export default function OverlayChart({
  a,
  b,
  height = 300,
  normalize = false,
  corrWindow = 60,
  showStats = false,
}: OverlayChartProps) {
```

Render — nach dem Korrelations-Block (`{corr !== null && (...)}`), noch innerhalb des äußeren `<div>`:

```tsx
      {showStats && (
        <div className="mt-3">
          <CompareStatsTable
            rows={[
              { label: seriesA.label, points: seriesA.points },
              { label: seriesB.label, points: seriesB.points },
            ]}
          />
        </div>
      )}
```

- [ ] **Step 2: SeriesPicker anbinden**

In `frontend-next/components/vergleich/SeriesPicker.tsx` den `OverlayChart`-Aufruf ersetzen:

```tsx
      <OverlayChart
        a={{ type: typeA, key: keyA }}
        b={{ type: typeB, key: keyB }}
        height={380}
        normalize={normalize}
        showStats
      />
```

- [ ] **Step 3: Build-Check**

Run: `npm run lint` und `npm run build`
Expected: beide fehlerfrei (Build-Warnungen zu anderen Seiten ignorieren, keine neuen Fehler)

- [ ] **Step 4: Manuelle Verifikation**

Run: `npm run dev`, dann `/vergleich` öffnen.
Expected: Tabelle unter dem Chart mit 2 Zeilen (Default: COT-Netto EUR + EUR/USD), Δ-Spalten farbig mit ▲/▼; COT-Zeile ohne %-Angabe wenn Netto negativ; Serienwechsel im Picker aktualisiert die Tabelle. `/intermarket` optisch unverändert (kein Stats-Block).

- [ ] **Step 5: Commit**

```bash
git add frontend-next/components/intermarket/OverlayChart.tsx frontend-next/components/vergleich/SeriesPicker.tsx
git commit -m "feat(vergleich): Stats-Tabelle unter Overlay-Chart"
```

---

## Feature 2 — Dashboard: Währungs-Kompass

### Task 4: Calc-Modul `currencyBias.ts`

**Files:**
- Create: `frontend-next/lib/calc/currencyBias.ts`
- Temporär (nicht committen): `frontend-next/tmp-sanity-bias.mts`

- [ ] **Step 1: Modul schreiben**

Nur type-only-Imports aus Nachbarmodulen — Modul bleibt pure und per `tsx` direkt ausführbar. Währungsliste kommt als Parameter (kein `@/`-Alias-Import nötig).

`frontend-next/lib/calc/currencyBias.ts`:

```ts
import type { SeriesPoint } from "./seriesMath";
import type { CotFlowSummary } from "./cotDelta";
import type { StanceResult } from "./cbStance";
import type { Lookback, StrengthResult } from "./strength";

export interface CurrencyFactor {
  name: string;
  dir: -1 | 0 | 1; // -1 Short, +1 Long (bezogen auf die Währung)
  text: string;
}

export interface CurrencyBias {
  ccy: string;
  direction: "LONG" | "SHORT" | null; // null = NEUTRAL
  alignedCount: number;
  factorCount: number;
  factors: CurrencyFactor[];
  /** COT-Niveau-Perzentil — nur Kontext/Extremwarnung, kein Richtungsfaktor */
  percentile: number | null;
  strength: Record<Lookback, number>;
}

export interface CurrencyBiasInputs {
  cotFlowByCcy: Map<string, CotFlowSummary>;
  cotPercentileByCcy: Map<string, number>;
  policyByCcy: Map<string, SeriesPoint[]>;
  stanceByCcy: Map<string, StanceResult>;
  strength: StrengthResult;
}

function latestValue(series: SeriesPoint[] | undefined): number | null {
  return series && series.length > 0 ? series[series.length - 1].value : null;
}

function valueMonthsAgo(series: SeriesPoint[] | undefined, months: number): number | null {
  if (!series || series.length === 0) return null;
  const cutoff = new Date(series[series.length - 1].date);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return [...series].reverse().find((p) => p.date <= cutoffStr)?.value ?? null;
}

/**
 * Long/Short-Bias einer einzelnen Währung aus 4 Faktoren:
 * COT-Flow 4W (% OI), Leitzins-Trend 6M, CB-Stance (nur manueller Score —
 * die Raten-Trajektorie steckt bereits im Leitzins-Faktor, sonst Doppelzählung),
 * Stärke 1M. Wie beim Pair-Screener: ≥2 gleichgerichtete Faktoren + Mehrheit → Richtung.
 * Fehlende Datenquellen lassen den jeweiligen Faktor weg.
 */
export function evaluateCurrency(ccy: string, inputs: CurrencyBiasInputs): CurrencyBias {
  const factors: CurrencyFactor[] = [];

  // 1) COT-Flow 4W (% OI)
  const flow = inputs.cotFlowByCcy.get(ccy);
  if (flow?.delta4wPctOi != null) {
    const v = flow.delta4wPctOi;
    const dir: -1 | 0 | 1 = v >= 2 ? 1 : v <= -2 ? -1 : 0;
    const streak =
      flow.streakWeeks >= 3 && flow.direction !== 0
        ? ` Flow seit ${flow.streakWeeks} Wochen ${flow.direction > 0 ? "positiv (Akkumulation)" : "negativ (Distribution)"}.`
        : "";
    factors.push({
      name: "COT-Flow 4W",
      dir,
      text: `Smart-Money-Flow ${v > 0 ? "+" : ""}${v.toFixed(1)} % OI in 4 Wochen — ${
        dir === 1 ? "Kapital fließt zu" : dir === -1 ? "Kapital fließt ab" : "kein klarer Trend"
      }.${streak}`,
    });
  }

  // 2) Leitzins-Trend 6M
  const rateNow = latestValue(inputs.policyByCcy.get(ccy));
  const ratePast = valueMonthsAgo(inputs.policyByCcy.get(ccy), 6);
  if (rateNow !== null && ratePast !== null) {
    const delta = rateNow - ratePast;
    const dir: -1 | 0 | 1 = delta >= 0.25 ? 1 : delta <= -0.25 ? -1 : 0;
    const deltaText =
      delta === 0
        ? "unverändert"
        : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)} bps ${delta > 0 ? "gestiegen" : "gefallen"}`;
    factors.push({
      name: "Leitzins-Trend",
      dir,
      text: `Leitzins ${rateNow.toFixed(2)} %, in 6M ${deltaText}.`,
    });
  }

  // 3) CB-Stance — bewusst nur der manuelle Score (−10…+10)
  const stance = inputs.stanceByCcy.get(ccy);
  if (stance) {
    const m = stance.manualScore;
    const dir: -1 | 0 | 1 = m >= 2 ? 1 : m <= -2 ? -1 : 0;
    factors.push({
      name: "CB-Stance",
      dir,
      text: `${stance.bank}: manueller Score ${m > 0 ? "+" : ""}${m.toFixed(0)} von ±10 — ${
        dir === 1 ? "hawkish" : dir === -1 ? "dovish" : "neutral"
      }.`,
    });
  }

  // 4) Stärke 1M
  const s1m = inputs.strength.scores["1M"][ccy] ?? 0;
  {
    const dir: -1 | 0 | 1 = s1m >= 0.4 ? 1 : s1m <= -0.4 ? -1 : 0;
    factors.push({
      name: "Stärke 1M",
      dir,
      text: `Ø signierter Pair-Return 1M: ${s1m > 0 ? "+" : ""}${s1m.toFixed(2)} % — ${
        dir === 1 ? `Momentum pro ${ccy}` : dir === -1 ? `Momentum contra ${ccy}` : "kein klares Momentum"
      }.`,
    });
  }

  const longCount = factors.filter((f) => f.dir === 1).length;
  const shortCount = factors.filter((f) => f.dir === -1).length;
  let direction: "LONG" | "SHORT" | null = null;
  let alignedCount = 0;
  if (longCount >= 2 && longCount > shortCount) {
    direction = "LONG";
    alignedCount = longCount;
  } else if (shortCount >= 2 && shortCount > longCount) {
    direction = "SHORT";
    alignedCount = shortCount;
  }

  return {
    ccy,
    direction,
    alignedCount,
    factorCount: factors.length,
    factors,
    percentile: inputs.cotPercentileByCcy.get(ccy) ?? null,
    strength: {
      "1W": inputs.strength.scores["1W"][ccy] ?? 0,
      "1M": s1m,
      "3M": inputs.strength.scores["3M"][ccy] ?? 0,
    },
  };
}

/** Bias für alle übergebenen Währungen (Reihenfolge bleibt erhalten). */
export function evaluateAllCurrencies(
  ccys: readonly string[],
  inputs: CurrencyBiasInputs,
): CurrencyBias[] {
  return ccys.map((c) => evaluateCurrency(c, inputs));
}
```

- [ ] **Step 2: Sanity-Skript schreiben und ausführen**

`frontend-next/tmp-sanity-bias.mts`:

```ts
import { evaluateCurrency, type CurrencyBiasInputs } from "./lib/calc/currencyBias";

const strength = {
  scores: { "1W": { EUR: 0.3 }, "1M": { EUR: 0.9 }, "3M": { EUR: 1.5 } },
  ranking: { "1W": [], "1M": [], "3M": [] },
} as unknown as CurrencyBiasInputs["strength"];

// Alle 4 Faktoren long → LONG 4/4
const inputs: CurrencyBiasInputs = {
  cotFlowByCcy: new Map([
    ["EUR", { date: "2026-07-03", delta1wPctOi: 1.1, delta4wPctOi: 3.2, deltaPercentile: 80, streakWeeks: 4, direction: 1 }],
  ]),
  cotPercentileByCcy: new Map([["EUR", 92]]),
  policyByCcy: new Map([
    ["EUR", [
      { date: "2025-12-01", value: 2.0 },
      { date: "2026-06-20", value: 2.5 },
    ]],
  ]),
  stanceByCcy: new Map([
    ["EUR", { bank: "EZB", ccy: "EUR", score: 3, manualScore: 4, trajectoryScore: 2, rationale: "" }],
  ]),
  strength,
};
const bias = evaluateCurrency("EUR", inputs);
console.log("EUR:", bias.direction, `${bias.alignedCount}/${bias.factorCount}`, "pct:", bias.percentile);
console.log(bias.factors.map((f) => `${f.dir} ${f.name}`).join(" | "));

// Leere Datenlage → nur Stärke-Faktor (neutral) → NEUTRAL
const emptyBias = evaluateCurrency("JPY", {
  cotFlowByCcy: new Map(),
  cotPercentileByCcy: new Map(),
  policyByCcy: new Map(),
  stanceByCcy: new Map(),
  strength,
});
console.log("JPY:", emptyBias.direction, `${emptyBias.alignedCount}/${emptyBias.factorCount}`);
```

Run: `npx tsx tmp-sanity-bias.mts`

Expected:
- `EUR: LONG 4/4 pct: 92` und alle vier Faktoren mit `1` (Flow 3.2 ≥ 2, Zins-Δ +50 bps ≥ 0.25 pp, manualScore 4 ≥ 2, Stärke 0.9 ≥ 0.4)
- `JPY: null 0/1` (nur Stärke-Faktor vorhanden, dir 0)

- [ ] **Step 3: Sanity-Skript löschen**

Run: `rm tmp-sanity-bias.mts` (bzw. `Remove-Item tmp-sanity-bias.mts`)

- [ ] **Step 4: Commit**

```bash
git add frontend-next/lib/calc/currencyBias.ts
git commit -m "feat(dashboard): 4-Faktoren-Waehrungs-Bias (currencyBias)"
```

---

### Task 5: `currencyBias` in `DashboardData`

**Files:**
- Modify: `frontend-next/lib/data/dashboard.ts`

- [ ] **Step 1: dashboard.ts erweitern**

Drei Änderungen:

1. Import ergänzen (bei den anderen Calc-Imports):

```ts
import { evaluateAllCurrencies, type CurrencyBias } from "@/lib/calc/currencyBias";
```

2. Interface `DashboardData` — neues Feld nach `cotFlows`:

```ts
  /** Δ-zentrierter COT-Flow je Währung (TFF Leveraged Funds, Fallback Legacy) */
  cotFlows: Array<{ ccy: string } & CotFlowSummary>;
  /** Long/Short-Bias je Währung (4-Faktoren-Modell) für den Währungs-Kompass */
  currencyBias: CurrencyBias[];
  sentimentAge: string | null;
```

3. In `loadDashboardData` nach der `verdicts`-Berechnung:

```ts
  const currencyBias = evaluateAllCurrencies(G8_CURRENCIES, {
    cotFlowByCcy,
    cotPercentileByCcy,
    policyByCcy,
    stanceByCcy: new Map(stances.map((s) => [s.ccy, s])),
    strength,
  });
```

und im `return`-Objekt `currencyBias,` ergänzen (z. B. nach `verdicts,`).

`cotPercentiles` bleibt unverändert im Interface — `lib/data/weekly.ts` nutzt es weiter.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: fehlerfrei

- [ ] **Step 3: Commit**

```bash
git add frontend-next/lib/data/dashboard.ts
git commit -m "feat(dashboard): currencyBias in DashboardData"
```

---

### Task 6: Komponente `CurrencyBiasPanel.tsx`

**Files:**
- Create: `frontend-next/components/dashboard/CurrencyBiasPanel.tsx`

- [ ] **Step 1: Komponente schreiben**

`frontend-next/components/dashboard/CurrencyBiasPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import type { CurrencyBias } from "@/lib/calc/currencyBias";

const LOOKBACKS = ["1W", "1M", "3M"] as const;

/** Währungs-Kompass: 8 klickbare Kacheln mit Long/Short-Bias, Details im Modal. */
export default function CurrencyBiasPanel({
  biases,
  extremeHi,
  extremeLo,
}: {
  biases: CurrencyBias[];
  extremeHi: number;
  extremeLo: number;
}) {
  const [selected, setSelected] = useState<CurrencyBias | null>(null);

  if (biases.length === 0) {
    return (
      <p className="text-muted text-sm font-mono">Daten fehlen — Backfill ausführen.</p>
    );
  }

  const isExtreme = (b: CurrencyBias) =>
    b.percentile !== null && (b.percentile >= extremeHi || b.percentile <= extremeLo);

  return (
    <>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {biases.map((b) => (
          <button
            key={b.ccy}
            onClick={() => setSelected(b)}
            className="bg-surface2 border border-border rounded p-2.5 text-center hover:border-border2 transition-colors cursor-pointer"
          >
            <div className="text-[12px] font-mono font-bold">
              {b.ccy}
              {isExtreme(b) && <span className="text-warn ml-1">⚠</span>}
            </div>
            <div
              className={`text-[11px] font-black tracking-widest my-1 ${
                b.direction === "LONG"
                  ? "text-up"
                  : b.direction === "SHORT"
                    ? "text-down"
                    : "text-faint"
              }`}
            >
              {b.direction ?? "NEUTRAL"}
            </div>
            <div className="text-[9px] text-faint uppercase tracking-wider">
              {b.alignedCount}/{b.factorCount} Faktoren
            </div>
          </button>
        ))}
      </div>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.ccy} — ${selected.direction ?? "NEUTRAL"}` : undefined}
        subtitle="4-Faktoren-Modell: COT-Flow · Leitzins-Trend · CB-Stance · Stärke"
      >
        {selected && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {selected.factors.map((f) => (
                <div key={f.name} className="flex items-start gap-2 text-[11px]">
                  <span
                    className={`shrink-0 mt-0.5 w-14 font-bold font-mono ${
                      f.dir === 1 ? "text-up" : f.dir === -1 ? "text-down" : "text-faint"
                    }`}
                  >
                    {f.dir === 1 ? "LONG" : f.dir === -1 ? "SHORT" : "–"}
                  </span>
                  <span className="text-muted">
                    <span className="text-text font-medium">{f.name}:</span> {f.text}
                  </span>
                </div>
              ))}
            </div>

            {selected.percentile !== null && (
              <p
                className={`text-[11px] font-mono ${
                  isExtreme(selected) ? "text-warn" : "text-muted"
                }`}
              >
                {isExtreme(selected) ? "⚠ " : ""}COT-Perzentil {selected.percentile.toFixed(0)} (5J-Fenster)
                {selected.percentile >= extremeHi
                  ? " — Extrem-Long (Konträr-Risiko)"
                  : selected.percentile <= extremeLo
                    ? " — Extrem-Short (Konträr-Risiko)"
                    : ""}
              </p>
            )}

            <div className="flex gap-4 pt-2 border-t border-border/50">
              {LOOKBACKS.map((lb) => (
                <div key={lb} className="text-[11px] font-mono">
                  <span className="text-faint uppercase mr-1">Stärke {lb}</span>
                  <span className={selected.strength[lb] >= 0 ? "text-up" : "text-down"}>
                    {selected.strength[lb] > 0 ? "+" : ""}
                    {selected.strength[lb].toFixed(2)} %
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: fehlerfrei

- [ ] **Step 3: Commit**

```bash
git add frontend-next/components/dashboard/CurrencyBiasPanel.tsx
git commit -m "feat(dashboard): CurrencyBiasPanel mit Detail-Modal"
```

---

### Task 7: Dashboard-Seite — Währungs-Kompass ersetzt COT-Schnellübersicht

**Files:**
- Modify: `frontend-next/app/(app)/page.tsx:90-113`

- [ ] **Step 1: Panel ersetzen**

1. Import ergänzen (bei den Dashboard-Imports):

```tsx
import CurrencyBiasPanel from "@/components/dashboard/CurrencyBiasPanel";
```

2. Den kompletten Block

```tsx
      <Panel title="COT-Schnellübersicht" subtitle="Non-Comm-Perzentil je Währung (5J-Fenster) — Details auf der COT-Seite">
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {data.cotPercentiles.map((c) => (
            <div key={c.ccy} className="bg-surface2 border border-border rounded p-2.5 text-center">
              <div className="text-[12px] font-mono font-bold">{c.ccy}</div>
              <div
                className={`text-lg font-black font-mono ${
                  c.percentile >= hi ? "text-up" : c.percentile <= lo ? "text-down" : "text-text"
                }`}
              >
                {c.percentile.toFixed(0)}
              </div>
              <div className="text-[9px] text-faint uppercase tracking-wider">
                {c.percentile >= hi ? "Extrem-Long" : c.percentile <= lo ? "Extrem-Short" : "Perzentil"}
              </div>
            </div>
          ))}
          {data.cotPercentiles.length === 0 && (
            <p className="col-span-full text-muted text-sm font-mono">
              COT-Daten fehlen — Backfill ausführen.
            </p>
          )}
        </div>
      </Panel>
```

ersetzen durch:

```tsx
      <Panel
        title="Währungs-Kompass"
        subtitle="Long/Short-Bias je Währung aus 4 Faktoren (COT-Flow, Leitzins-Trend, CB-Stance, Stärke) — Details per Klick"
      >
        <CurrencyBiasPanel biases={data.currencyBias} extremeHi={hi} extremeLo={lo} />
      </Panel>
```

`hi`/`lo` bleiben erhalten (werden jetzt als Props durchgereicht und weiter oben nicht mehr benötigt — Definition Zeile 24/25 unverändert lassen).

- [ ] **Step 2: Lint + Build**

Run: `npm run lint` und `npm run build`
Expected: beide fehlerfrei

- [ ] **Step 3: Manuelle Verifikation**

Run: `npm run dev`, Dashboard `/` öffnen.
Expected:
- Panel "Währungs-Kompass" mit 8 Kacheln (EUR, USD, JPY, GBP, CHF, CAD, AUD, NZD), Badge LONG/SHORT/NEUTRAL, "n/m Faktoren"
- ⚠ auf Kacheln mit Perzentil-Extrem
- Klick öffnet Modal: Faktorliste mit LONG/SHORT/–, Perzentil-Zeile, Stärke 1W/1M/3M; Escape und Klick außerhalb schließen
- Weekly-Seite (`/weekly`) lädt weiter fehlerfrei (nutzt `cotPercentiles` unverändert)

- [ ] **Step 4: Commit**

```bash
git add "frontend-next/app/(app)/page.tsx"
git commit -m "feat(dashboard): Waehrungs-Kompass ersetzt COT-Schnelluebersicht"
```

---

## Abschluss-Verifikation

- [ ] `npm run lint` — fehlerfrei
- [ ] `npm run build` — fehlerfrei
- [ ] `/vergleich`: Stats-Tabelle reagiert auf Serienwechsel; COT-Serien ohne %-Angabe bei negativer Basis
- [ ] `/intermarket`: unverändert
- [ ] `/`: Kompass-Kacheln + Modal funktionieren; `/weekly` unverändert
- [ ] Keine `tmp-sanity-*.mts`-Dateien mehr im Repo (`git status` sauber)
