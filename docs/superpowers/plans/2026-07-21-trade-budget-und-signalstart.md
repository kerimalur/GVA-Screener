# Trade-Budget + Signalstart-Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Trade-Budget von fest 8 Trades pro Monat sichtbar machen (8 Kästchen, blockweise freigeschaltet) und den falschen „seit"-Zeitpunkt im Performance-Panel des Währungs-Rankings korrigieren.

**Architecture:** Beide Teile folgen dem bestehenden Muster: reine Berechnung in `lib/`, ohne I/O und ohne Browser, geprüft über ein `tsx`-Kontrollwert-Skript; die Komponente liest nur. Das Budget kommt vollständig aus `trades` (kein Schema, keine Preference). Der Signalstart wird aus der Historie von `ml_weekly_rankings` je Pair abgeleitet.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4 (Tokens aus `app/globals.css`), Supabase (Service-Client, server-only), `tsx` für Kontrollwerte.

**Spec:** `docs/superpowers/specs/2026-07-21-trade-budget-design.md`

---

## Kontext, den du brauchst

**Es gibt kein Jest/Vitest in diesem Projekt.** Tests heissen hier „Kontrollwerte":
ausführbare `.mts`-Skripte unter `frontend-next/scripts/`, die mit `npx tsx` laufen,
Ist gegen Soll vergleichen und `process.exitCode` setzen. Vorbild:
`frontend-next/scripts/cockpit-board-check.mts`. Halte dich an dessen Aufbau
(`check(name, actual, expected)`, `console.log`, Schlusszeile).

**Alle Pfade unten sind relativ zu `frontend-next/`,** sofern nicht anders angegeben.
Befehle werden aus `c:\Projekte\Claude Cowork\GVA-Screener\frontend-next` ausgeführt.

**Farben nie hartkodieren.** Nutze Token-Klassen (`bg-accent`, `text-muted`,
`border-border2`, `bg-down/15`). Die Tokens stehen in `app/globals.css`.

**Der `Trade`-Typ** (`lib/journal/types.ts`) hat u.a.:
`date: string` (Format `"YYYY-MM-DD"`), `sessionType: "live" | "backtest"`,
`type: AccountType` (`"funded" | "ek"`), `result`, `rMultiple`.

---

## Dateien

**Teil 1 — Trade-Budget**
- Erstellen: `lib/journal/budget.ts` — reine Budget-Berechnung, keine I/O
- Erstellen: `scripts/trade-budget-check.mts` — Kontrollwerte dazu
- Erstellen: `components/journal/TradeBudgetCard.tsx` — die acht Kästchen
- Ändern: `components/journal/DashboardView.tsx` — Widget einhängen
- Ändern: `lib/journal/discipline.ts` — `tradesPerMonth` raus, Konstante rein
- Ändern: `components/journal/ExpectancyCard.tsx:76` — Anzeigezeile
- Ändern: `components/journal/SettingsView.tsx:456-462` — Feld entfernen
- Ändern: `components/cockpit/CockpitBoard.tsx` — Budget-Chip + Warnung

**Teil 2 — Signalstart**
- Erstellen: `lib/ml/signalStart.ts` — Laufanfang je Pair, rein
- Erstellen: `scripts/signal-start-check.mts` — Kontrollwerte dazu
- Ändern: `lib/ml/ranking.ts` — Historie laden, `signalStartByPair` liefern
- Ändern: `components/ml/RankingPerformance.tsx` — Start je Pair statt global
- Ändern: `app/(app)/ml/ranking/page.tsx:228-235` — neue Prop, Untertitel

---

## Task 1: Budget-Berechnung

**Files:**
- Create: `lib/journal/budget.ts`
- Test: `scripts/trade-budget-check.mts`

- [ ] **Step 1: Kontrollwerte schreiben (schlagen fehl, Modul fehlt noch)**

Erstelle `scripts/trade-budget-check.mts`:

```ts
// Kontrollwerte für das Trade-Budget: npx tsx scripts/trade-budget-check.mts
//
// Deckt ab:
//   - Blockgrenzen (feste 7-Tage-Blöcke ab dem 1., Block 4 laeuft bis Monatsende)
//   - Freischaltung 2/4/6/8, kumulativ (ungenutzte Kaestchen verfallen nicht)
//   - Verbrauch von links, Ueberzug ab dem 9. Trade
//   - Nur Live-Trades des laufenden Monats, kontenuebergreifend
import {
  TRADE_BUDGET_PER_MONTH,
  budgetState,
  unlockedBoxes,
  usedThisMonth,
  weekBlockOf,
} from "../lib/journal/budget";
import type { Trade } from "../lib/journal/types";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

// --- Blockgrenzen ------------------------------------------------------------
check("1. -> Block 1", weekBlockOf(d("2026-07-01")), 1);
check("7. -> Block 1", weekBlockOf(d("2026-07-07")), 1);
check("8. -> Block 2", weekBlockOf(d("2026-07-08")), 2);
check("14. -> Block 2", weekBlockOf(d("2026-07-14")), 2);
check("15. -> Block 3", weekBlockOf(d("2026-07-15")), 3);
check("21. -> Block 3", weekBlockOf(d("2026-07-21")), 3);
check("22. -> Block 4", weekBlockOf(d("2026-07-22")), 4);
check("31. bleibt Block 4", weekBlockOf(d("2026-07-31")), 4);
check("28. im Februar bleibt Block 4", weekBlockOf(d("2026-02-28")), 4);

// --- Freischaltung -----------------------------------------------------------
check("Block 1 schaltet 2 frei", unlockedBoxes(d("2026-07-03")), 2);
check("Block 2 schaltet 4 frei", unlockedBoxes(d("2026-07-10")), 4);
check("Block 3 schaltet 6 frei", unlockedBoxes(d("2026-07-17")), 6);
check("Block 4 schaltet 8 frei", unlockedBoxes(d("2026-07-25")), 8);
check("Deckel bleibt bei 8", unlockedBoxes(d("2026-07-31")), TRADE_BUDGET_PER_MONTH);

// --- Verbrauch ---------------------------------------------------------------
const t = (over: Partial<Trade>): Trade =>
  ({
    id: "x", type: "funded", pair: "EURUSD", direction: "long",
    date: "2026-07-02", result: "win", rMultiple: 1,
    notes: "", comment: "", sessionType: "live", session: "",
    confluences: [],
    ...over,
  }) as Trade;

check(
  "nur Live-Trades zaehlen",
  usedThisMonth([t({}), t({ id: "b", sessionType: "backtest" })], d("2026-07-21")),
  1,
);
check(
  "Vormonat zaehlt nicht",
  usedThisMonth([t({}), t({ id: "v", date: "2026-06-30" })], d("2026-07-21")),
  1,
);
check(
  "Folgemonat zaehlt nicht",
  usedThisMonth([t({}), t({ id: "n", date: "2026-08-01" })], d("2026-07-21")),
  1,
);
check(
  "beide Kontotypen zaehlen zusammen",
  usedThisMonth([t({}), t({ id: "e", type: "ek" })], d("2026-07-21")),
  2,
);

// --- Zusammengesetzter Zustand ----------------------------------------------
// Block 3 (17.07.), 2 Trades verbraucht -> 6 frei, 4 offen
const s1 = budgetState([t({}), t({ id: "2", date: "2026-07-09" })], d("2026-07-17"));
check("used/unlocked/offen", [s1.used, s1.unlocked, s1.offen], [2, 6, 4]);
check("kein Ueberzug", s1.overrun, 0);
check(
  "Verbrauch von links, Rest offen, Block 4 gesperrt",
  s1.boxes,
  ["used", "used", "open", "open", "open", "open", "locked", "locked"],
);

// Uebertrag: Block 1 ohne Trades -> in Block 2 stehen alle 4 offen
const s2 = budgetState([], d("2026-07-10"));
check(
  "ungenutzte Kaestchen verfallen nicht",
  s2.boxes,
  ["open", "open", "open", "open", "locked", "locked", "locked", "locked"],
);
check("nichts verbraucht", [s2.used, s2.offen], [0, 4]);

// Ueberzug: 9 Trades im Monat
const neun = Array.from({ length: 9 }, (_, i) => t({ id: `t${i}`, date: "2026-07-23" }));
const s3 = budgetState(neun, d("2026-07-25"));
check("Ueberzug wird gezaehlt", s3.overrun, 1);
check("kein offenes Kaestchen mehr", s3.offen, 0);
check("neun Kaestchen, das letzte ist Ueberzug", s3.boxes.length, 9);
check("letztes Kaestchen ist overrun", s3.boxes[8], "overrun");

// Leerer Monat
const s4 = budgetState([], d("2026-07-01"));
check("Monatsanfang: 2 offen, 6 gesperrt", [s4.offen, s4.unlocked, s4.used], [2, 2, 0]);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
```

- [ ] **Step 2: Skript laufen lassen, Fehlschlag bestätigen**

Run: `npx tsx scripts/trade-budget-check.mts`
Expected: Abbruch mit `Cannot find module '../lib/journal/budget'`

- [ ] **Step 3: Modul implementieren**

Erstelle `lib/journal/budget.ts`:

```ts
/**
 * Trade-Budget: acht Kästchen pro Monat, blockweise freigeschaltet.
 * Spec: docs/superpowers/specs/2026-07-21-trade-budget-design.md
 *
 * Reine Berechnung ohne I/O — dasselbe Muster wie lib/cockpit/board.ts, damit
 * die Wochen- und Übertragsregel ohne Browser durchgerechnet werden kann.
 *
 * Das Budget ist eine Konstante, keine Einstellung. Es ist eine Zusage an sich
 * selbst und soll nicht in dem Moment verhandelbar sein, in dem sie drückt.
 */

import type { Trade } from "./types";

/** Fest. Bewusst nicht konfigurierbar. */
export const TRADE_BUDGET_PER_MONTH = 8;

/** Vier feste 7-Tage-Blöcke ab dem 1. des Monats. */
export const BUDGET_BLOCKS = 4;

export type BoxState =
  /** verbraucht */
  | "used"
  /** freigeschaltet und noch frei */
  | "open"
  /** dieser Block ist noch nicht erreicht */
  | "locked"
  /** jenseits des Monatsbudgets */
  | "overrun";

export interface BudgetState {
  total: number;
  unlocked: number;
  used: number;
  /** freigeschaltet und noch nicht verbraucht */
  offen: number;
  /** Trades über dem Monatsbudget */
  overrun: number;
  /** Länge = total + overrun */
  boxes: BoxState[];
  block: number;
}

/**
 * Block 1..4 nach Tag im Monat: 1–7, 8–14, 15–21, ab 22.
 *
 * Bewusst feste 7-Tage-Blöcke und keine Kalenderwochen: ein Monat berührt 5–6
 * Kalenderwochen, feste Blöcke ergeben immer exakt vier. Block 4 ist dadurch
 * 7–10 Tage lang.
 */
export function weekBlockOf(datum: Date): number {
  const tag = datum.getDate();
  return Math.min(BUDGET_BLOCKS, Math.floor((tag - 1) / 7) + 1);
}

/** Kumulativ: je Block kommen `total / 4` Kästchen dazu, gedeckelt auf `total`. */
export function unlockedBoxes(datum: Date, total: number = TRADE_BUDGET_PER_MONTH): number {
  const proBlock = Math.ceil(total / BUDGET_BLOCKS);
  return Math.min(total, proBlock * weekBlockOf(datum));
}

/**
 * Live-Trades im Kalendermonat von `datum` — kontenübergreifend.
 *
 * Das Budget begrenzt eine Trade-Entscheidung, kein Konto: dasselbe Setup auf
 * Funded und Eigenkapital sind zwei Entscheidungen. Backtest-Zeilen zählen nie.
 */
export function usedThisMonth(trades: Trade[], datum: Date): number {
  const praefix = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}`;
  return trades.filter(
    (t) => t.sessionType === "live" && typeof t.date === "string" && t.date.startsWith(praefix),
  ).length;
}

/**
 * Vollständiger Zustand für die Anzeige.
 *
 * Der Übertrag braucht keine eigene Regel: verbraucht wird von links,
 * freigeschaltet wird nach Block — ungenutzte Kästchen bleiben dadurch von
 * selbst offen.
 */
export function budgetState(
  trades: Trade[],
  datum: Date = new Date(),
  total: number = TRADE_BUDGET_PER_MONTH,
): BudgetState {
  const unlocked = unlockedBoxes(datum, total);
  const used = usedThisMonth(trades, datum);
  const overrun = Math.max(0, used - total);

  const boxes: BoxState[] = [];
  for (let i = 0; i < total; i++) {
    boxes.push(i < used ? "used" : i < unlocked ? "open" : "locked");
  }
  for (let i = 0; i < overrun; i++) boxes.push("overrun");

  return {
    total,
    unlocked,
    used,
    offen: Math.max(0, unlocked - used),
    overrun,
    boxes,
    block: weekBlockOf(datum),
  };
}

/** Beschriftung der vier Blöcke unter den Kästchenpaaren. */
export const BLOCK_LABELS = ["1.–7.", "8.–14.", "15.–21.", "ab 22."] as const;
```

- [ ] **Step 4: Kontrollwerte laufen lassen**

Run: `npx tsx scripts/trade-budget-check.mts`
Expected: letzte Zeile `Alle Kontrollwerte grün.`, Exit-Code 0

- [ ] **Step 5: Commit**

```bash
git add frontend-next/lib/journal/budget.ts frontend-next/scripts/trade-budget-check.mts
git commit -m "feat(journal): Trade-Budget-Berechnung, 8 Kaestchen pro Monat"
```

---

## Task 2: Expectancy auf das feste Budget umstellen

`tradesPerMonth` verschwindet als Einstellung. Sonst gäbe es zwei Zahlen für
dieselbe Sache, und die Prognose könnte mit einer Trade-Anzahl rechnen, die das
Budget gar nicht erlaubt.

**Files:**
- Modify: `lib/journal/discipline.ts:77-117`
- Modify: `components/journal/ExpectancyCard.tsx:76`
- Modify: `components/journal/SettingsView.tsx:456-462`
- Test: `scripts/trade-budget-check.mts` (ergänzen)

- [ ] **Step 1: Kontrollwerte für die neue Rechnung ergänzen**

Hänge in `scripts/trade-budget-check.mts` **vor** der Schlusszeile
(`console.log(fails === 0 ? ...)`) an:

```ts
// --- Expectancy rechnet mit dem festen Budget -------------------------------
// (WR·RR·Risiko%) − ((1−WR)·Risiko%), mal 8 Trades
const p = { riskPct: 1, rr: 4, fallbackWinrate: 40 };
check("WR 25 % -> +2,0 % / Monat", Math.round(expectancyPerMonth(25, p) * 10) / 10, 2);
check("WR 50 % -> +12,0 % / Monat", Math.round(expectancyPerMonth(50, p) * 10) / 10, 12);
check("WR 0 % -> −8,0 % / Monat", Math.round(expectancyPerMonth(0, p) * 10) / 10, -8);
```

Und ergänze oben den Import:

```ts
import { expectancyPerMonth } from "../lib/journal/discipline";
```

- [ ] **Step 2: Skript laufen lassen, Fehlschlag bestätigen**

Run: `npx tsx scripts/trade-budget-check.mts`
Expected: drei FAIL-Zeilen (die Funktion rechnet noch mit `p.tradesPerMonth`,
das im Objekt fehlt → `NaN`), Exit-Code 1

- [ ] **Step 3: `discipline.ts` umstellen**

In `lib/journal/discipline.ts` den Import ergänzen (unter `import { loadPref, savePref }`):

```ts
import { TRADE_BUDGET_PER_MONTH } from "./budget";
```

`ExpectancyParams` — Feld `tradesPerMonth` streichen:

```ts
export interface ExpectancyParams {
  /** Risiko pro Trade in % des Kontos */
  riskPct: number;
  /** geplantes Reward:Risk (z.B. 4 = 1:4) */
  rr: number;
  /** Fallback-Winrate in %, wenn zu wenig geloggte Trades */
  fallbackWinrate: number;
}

export const DEFAULT_EXPECTANCY_PARAMS: ExpectancyParams = {
  riskPct: 1,
  rr: 4,
  fallbackWinrate: 40,
};
```

`expectancyPerMonth` — Trades kommen aus der Konstante:

```ts
/**
 * Erwartetes Monats-Ergebnis in % des Kontos:
 * ((WR · RR · Risiko%) − ((1−WR) · Risiko%)) · Trades/Monat
 *
 * Die Trade-Anzahl ist das feste Budget (TRADE_BUDGET_PER_MONTH) und keine
 * eigene Einstellung mehr — sonst könnte die Prognose mit mehr Trades rechnen,
 * als du dir erlaubst.
 * Kontrollwerte (1 %, RR 4, 8 Trades/Mt): WR 25 % → +2.0 · WR 50 % → +12.0
 */
export function expectancyPerMonth(winratePct: number, p: ExpectancyParams): number {
  const wr = winratePct / 100;
  const perTrade = wr * p.rr * p.riskPct - (1 - wr) * p.riskPct;
  return perTrade * TRADE_BUDGET_PER_MONTH;
}
```

Ein bereits gespeicherter `tradesPerMonth`-Schlüssel in `user_preferences` bleibt
als toter Wert liegen. `loadExpectancyParams` spreadet ihn zwar weiterhin ins
Objekt, aber niemand liest ihn mehr — kein Migrationsschritt nötig.

- [ ] **Step 4: Anzeige in `ExpectancyCard.tsx` korrigieren**

Ersetze Zeile 76:

```tsx
          Risiko {params.riskPct} % · RR 1:{params.rr} · {params.tradesPerMonth} Trades/Mt
```

durch:

```tsx
          Risiko {params.riskPct} % · RR 1:{params.rr} · {TRADE_BUDGET_PER_MONTH} Trades/Mt (Budget)
```

Und ergänze den Import unter den bestehenden:

```tsx
import { TRADE_BUDGET_PER_MONTH } from "@/lib/journal/budget";
```

- [ ] **Step 5: Feld aus `SettingsView.tsx` entfernen**

Lösche den Block Zeile 456-462 vollständig:

```tsx
          <Field label="Trades / Monat">
            <Input
              type="number" step="1" min={1} max={100}
              value={expectancy.tradesPerMonth}
              onChange={(e) => updateExpectancy({ tradesPerMonth: parseInt(e.target.value) || 4 })}
            />
          </Field>
```

Ändere im selben Panel das Grid von vier auf drei Spalten (Zeile 441):

```tsx
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
```

Und ergänze die Erklärzeile unter dem Grid (nach Zeile 477, innerhalb des `<p>`):

```tsx
          {" "}· Gerechnet wird mit dem festen Budget von {TRADE_BUDGET_PER_MONTH} Trades/Monat.
```

Import in `SettingsView.tsx` ergänzen:

```tsx
import { TRADE_BUDGET_PER_MONTH } from "@/lib/journal/budget";
```

- [ ] **Step 6: Kontrollwerte + Typen prüfen**

Run: `npx tsx scripts/trade-budget-check.mts`
Expected: `Alle Kontrollwerte grün.`

Run: `npx tsc --noEmit`
Expected: keine Ausgabe (jede verbliebene Nutzung von `tradesPerMonth` würde
hier als Fehler auftauchen)

- [ ] **Step 7: Commit**

```bash
git add frontend-next/lib/journal/discipline.ts frontend-next/components/journal/ExpectancyCard.tsx frontend-next/components/journal/SettingsView.tsx frontend-next/scripts/trade-budget-check.mts
git commit -m "refactor(journal): Expectancy rechnet mit dem festen Trade-Budget"
```

---

## Task 3: Budget-Widget im Journal-Dashboard

**Files:**
- Create: `components/journal/TradeBudgetCard.tsx`
- Modify: `components/journal/DashboardView.tsx:113-123`

- [ ] **Step 1: Komponente erstellen**

Erstelle `components/journal/TradeBudgetCard.tsx`:

```tsx
"use client";

import type { Trade } from "@/lib/journal/types";
import {
  BLOCK_LABELS,
  budgetState,
  TRADE_BUDGET_PER_MONTH,
  type BoxState,
} from "@/lib/journal/budget";

/**
 * Trade-Budget des Monats als acht Kästchen, in vier Blöcken zu je zwei.
 *
 * Bewusst kontenübergreifend: das Widget steht über dem Konto-Umschalter und
 * ändert sich beim Umschalten nicht — sonst sähe es aus wie ein Konto-Wert.
 * Es bekommt deshalb ALLE Trades, nicht die gefilterten.
 */

const BOX_CLASS: Record<BoxState, string> = {
  used: "bg-accent border-accent",
  open: "bg-transparent border-border2",
  locked: "bg-surface2 border-transparent opacity-50",
  overrun: "bg-down/20 border-down",
};

const BOX_TITLE: Record<BoxState, string> = {
  used: "verbraucht",
  open: "frei",
  locked: "noch nicht freigeschaltet",
  overrun: "über dem Budget",
};

export default function TradeBudgetCard({
  trades,
  jetzt = new Date(),
}: {
  /** ALLE Trades, ungefiltert — das Budget gilt kontenübergreifend. */
  trades: Trade[];
  jetzt?: Date;
}) {
  const s = budgetState(trades, jetzt);
  const monat = jetzt.toLocaleDateString("de-CH", { month: "long" });

  return (
    <div className="bg-surface border border-border rounded-(--radius-card) px-5 py-4">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-faint">
          Budget {monat}
        </span>
        <span className="font-mono text-[12px] text-muted">
          {s.used} / {s.total}
          {s.overrun > 0 ? (
            <span className="text-down font-bold"> · {s.overrun} über Budget</span>
          ) : (
            <span className="text-faint"> · {s.offen} offen</span>
          )}
        </span>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        {BLOCK_LABELS.map((label, blockIdx) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex gap-1">
              {s.boxes.slice(blockIdx * 2, blockIdx * 2 + 2).map((state, i) => (
                <span
                  key={i}
                  title={BOX_TITLE[state]}
                  className={`w-6 h-6 rounded-(--radius-tag) border ${BOX_CLASS[state]}`}
                />
              ))}
            </div>
            <span className="font-mono text-[9px] text-faint text-center">{label}</span>
          </div>
        ))}

        {/* Überzug hängt sichtbar ausserhalb der vier Blöcke. */}
        {s.overrun > 0 && (
          <div className="flex flex-col gap-1 pl-2 border-l border-border">
            <div className="flex gap-1">
              {s.boxes.slice(TRADE_BUDGET_PER_MONTH).map((state, i) => (
                <span
                  key={i}
                  title={BOX_TITLE[state]}
                  className={`w-6 h-6 rounded-(--radius-tag) border ${BOX_CLASS[state]}`}
                />
              ))}
            </div>
            <span className="font-mono text-[9px] text-down text-center">Überzug</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: In `DashboardView.tsx` einhängen**

Import ergänzen (nach `import ExpectancyCard from "./ExpectancyCard";`):

```tsx
import TradeBudgetCard from "./TradeBudgetCard";
```

Direkt **vor** dem Block `{/* Tab + Streak */}` (Zeile 113) einfügen:

```tsx
      {/* Trade-Budget: gilt kontenuebergreifend, deshalb ALLE Trades und
          bewusst oberhalb des Konto-Umschalters. */}
      <TradeBudgetCard trades={trades} />
```

- [ ] **Step 3: Typen prüfen**

Run: `npx tsc --noEmit`
Expected: keine Ausgabe

- [ ] **Step 4: Commit**

```bash
git add frontend-next/components/journal/TradeBudgetCard.tsx frontend-next/components/journal/DashboardView.tsx
git commit -m "feat(journal): Budget-Widget mit acht Kaestchen im Dashboard"
```

---

## Task 4: Budget im Cockpit sichtbar machen

Der Zähler nützt am meisten dort, wo die Entscheidung fällt. Bewusst **kein**
`disabled` am Knopf: der Trade ist beim Broker eventuell schon offen, und ein
verweigertes Journal macht Winrate und Adherence wertlos.

**Files:**
- Modify: `components/cockpit/CockpitBoard.tsx`

- [ ] **Step 1: Trades laden und Zustand berechnen**

Importe ergänzen:

```tsx
import { loadTrades } from "@/lib/journal/trades";
import { budgetState } from "@/lib/journal/budget";
import type { Trade } from "@/lib/journal/types";
```

State ergänzen (neben `const [manuelle, setManuelle] = useState<OutlookRecord[]>([]);`):

```tsx
  const [trades, setTrades] = useState<Trade[]>([]);
```

In `loadSignalsSafe` das `Promise.all` um einen Eintrag erweitern und das
Ergebnis übernehmen — die bestehenden vier Einträge bleiben unverändert:

```tsx
      const [fresh, watch, gvaOutlooks, manual, alleTrades] = await Promise.all([
        loadSignals("new"),
        loadSignals("watchlist"),
        // Anreicherung ist optional: schlägt sie fehl, bleiben die Karten roh.
        loadGvaOutlooks().catch(() => [] as OutlookRecord[]),
        // Manuelle Setups sind die zweite Kartenquelle — fällt sie aus, zeigt
        // das Board weiterhin die GVA-Seite statt gar nichts.
        loadOpenManualOutlooks().catch(() => [] as OutlookRecord[]),
        // Nur für den Budget-Chip. Fällt es aus, entfällt der Chip still.
        loadTrades().catch(() => [] as Trade[]),
      ]);
      if (!aliveRef.current) return;
      setSignals([...fresh, ...watch]);
      setOutlooks(outlooksBySignal(gvaOutlooks));
      setManuelle(manual);
      setTrades(alleTrades);
```

Nach der Zeile `const zonesTxt = zonesLabel(state, meta.zones, meta.pairsTotal);` einfügen:

```tsx
  const budget = budgetState(trades);
```

- [ ] **Step 2: Chip in die Kopfzeile**

In der Kopfzeilen-Leiste, direkt **vor** `<div className="ml-auto">` mit dem
„+ Setup"-Knopf, einfügen:

```tsx
        {/* Budget-Stand am Ort der Entscheidung. Leeres Budget wird betont,
            aber nie erzwungen — siehe Warnung an der Karte. */}
        <span
          title={`Trade-Budget des Monats: ${budget.used} von ${budget.total} verbraucht`}
          className={
            budget.offen === 0
              ? "px-1.5 py-0.5 rounded bg-down/15 text-down text-[10px] font-bold font-mono"
              : "px-1.5 py-0.5 rounded bg-surface2 text-faint text-[10px] font-mono"
          }
        >
          {budget.offen === 0
            ? `Budget aufgebraucht (${budget.used}/${budget.total})`
            : `${budget.offen} von ${budget.total} übrig`}
        </span>
```

- [ ] **Step 3: Warnung an der Karte**

Die `Card`-Komponente bekommt eine zusätzliche Prop. Ändere die Signatur:

```tsx
function Card({
  card,
  busy,
  budgetLeer,
  onOpen,
  onTake,
  onWatch,
  onDismiss,
}: {
  card: CockpitCard;
  busy: boolean;
  budgetLeer: boolean;
  onOpen: (c: CockpitCard) => void;
  onTake: (c: CockpitCard) => void;
  onWatch: (c: CockpitCard) => void;
  onDismiss: (c: CockpitCard) => void;
}) {
```

Ersetze im Aktions-Block den „Genommen"-Knopf durch Knopf **plus** Hinweiszeile:

```tsx
          <button
            onClick={() => onTake(card)}
            disabled={busy}
            title={
              budgetLeer
                ? "Budget des Monats ist aufgebraucht — Trade wird trotzdem geloggt"
                : "Genommen → Journal"
            }
            className={`flex-1 py-1 rounded text-[10px] font-semibold hover:bg-active disabled:opacity-40 ${
              budgetLeer ? "text-warn" : "text-accent"
            }`}
          >
            <i className={`ph-bold ${budgetLeer ? "ph-warning" : "ph-notebook"}`} /> Genommen
          </button>
```

`Lane` reicht die Prop durch — Signatur ergänzen:

```tsx
function Lane({
  label,
  hint,
  cards,
  busy,
  budgetLeer,
  onOpen,
  onTake,
  onWatch,
  onDismiss,
}: {
  label: string;
  hint: string;
  cards: CockpitCard[];
  busy: boolean;
  budgetLeer: boolean;
  onOpen: (c: CockpitCard) => void;
  onTake: (c: CockpitCard) => void;
  onWatch: (c: CockpitCard) => void;
  onDismiss: (c: CockpitCard) => void;
}) {
```

und im `map` weiterreichen:

```tsx
            <Card
              key={c.key}
              card={c}
              busy={busy}
              budgetLeer={budgetLeer}
              onOpen={onOpen}
              onTake={onTake}
              onWatch={onWatch}
              onDismiss={onDismiss}
            />
```

Am Aufrufort der `Lane` ergänzen:

```tsx
              budgetLeer={budget.offen === 0}
```

- [ ] **Step 4: Typen prüfen**

Run: `npx tsc --noEmit`
Expected: keine Ausgabe

- [ ] **Step 5: Commit**

```bash
git add frontend-next/components/cockpit/CockpitBoard.tsx
git commit -m "feat(cockpit): Budget-Stand und Warnung am Genommen-Knopf"
```

---

## Task 5: Signalstart je Pair berechnen

**Hintergrund:** `run_weekly.py:50` schreibt `week_start` bewusst als **kommenden
Montag** — das Ranking ist eine Prognose für die nächste Woche. Die
Ranking-Seite reicht diese Zielwoche aber als `since` an das Performance-Panel
weiter, also als angeblichen Startpunkt in der Vergangenheit. Ergebnis: „seit
27.07." an einem 21.07., und keine Kursdaten.

Richtig ist der Anfang des aktuellen **ununterbrochenen Laufs** derselben
Richtung je Pair — die Konstellation steht oft schon Wochen.

**Files:**
- Create: `lib/ml/signalStart.ts`
- Test: `scripts/signal-start-check.mts`

- [ ] **Step 1: Kontrollwerte schreiben**

Erstelle `scripts/signal-start-check.mts`:

```ts
// Kontrollwerte für den Signalstart: npx tsx scripts/signal-start-check.mts
//
// Deckt ab:
//   - Laufanfang je Pair (ununterbrochene Wochen gleicher Richtung)
//   - Richtungswechsel und Lücken brechen den Lauf
//   - die Zielwoche liegt in der Zukunft (run_weekly schreibt den KOMMENDEN
//     Montag) -> ein brandneues Signal hat keinen Startpunkt in der Vergangenheit
import { signalStarts, sinceForPair, wochenSeit } from "../lib/ml/signalStart";
import type { PairIdea } from "../lib/ml/ranking";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

const idee = (pair: string, direction: "long" | "short"): PairIdea =>
  ({ pair, direction, reason: `${pair} ${direction}` });

// Drei Wochen dieselbe Richtung, die jüngste ist die Zielwoche (Zukunft).
const wochen = [
  { weekStart: "2026-07-06", ideas: [idee("AUD/USD", "long"), idee("EUR/GBP", "short")] },
  { weekStart: "2026-07-13", ideas: [idee("AUD/USD", "long")] },
  { weekStart: "2026-07-20", ideas: [idee("AUD/USD", "long"), idee("EUR/GBP", "long")] },
  { weekStart: "2026-07-27", ideas: [idee("AUD/USD", "long"), idee("EUR/GBP", "long")] },
];

const starts = signalStarts(wochen);
check("durchgehender Lauf startet in der ersten Woche", starts["AUD/USD"], "2026-07-06");
check("Richtungswechsel bricht den Lauf", starts["EUR/GBP"], "2026-07-20");

// Lücke: Pair fehlt in einer Woche -> Lauf beginnt danach neu
const mitLuecke = [
  { weekStart: "2026-07-06", ideas: [idee("GBP/USD", "long")] },
  { weekStart: "2026-07-13", ideas: [] },
  { weekStart: "2026-07-20", ideas: [idee("GBP/USD", "long")] },
  { weekStart: "2026-07-27", ideas: [idee("GBP/USD", "long")] },
];
check("Lücke bricht den Lauf", signalStarts(mitLuecke)["GBP/USD"], "2026-07-20");

// Pair nur in der Zielwoche -> Lauf beginnt dort
const neu = [
  { weekStart: "2026-07-20", ideas: [] },
  { weekStart: "2026-07-27", ideas: [idee("USD/CHF", "short")] },
];
check("brandneues Signal startet in der Zielwoche", signalStarts(neu)["USD/CHF"], "2026-07-27");

// Unsortierte Eingabe darf nichts ändern
const unsortiert = [wochen[3], wochen[0], wochen[2], wochen[1]];
check("Reihenfolge der Eingabe egal", signalStarts(unsortiert)["AUD/USD"], "2026-07-06");

// Pair kommt gar nicht vor
check("unbekanntes Pair hat keinen Start", starts["NZD/JPY"], undefined);

// --- sinceForPair: nie ein Startpunkt in der Zukunft ------------------------
const heute = new Date("2026-07-21T12:00:00Z");
check("Start in der Vergangenheit wird durchgereicht", sinceForPair("2026-07-06", heute), "2026-07-06");
check("Start in der Zukunft -> kein Verlauf", sinceForPair("2026-07-27", heute), null);
check("kein Start -> null", sinceForPair(undefined, heute), null);
// Genau heute zählt als gültig (Montag-Start am selben Tag)
check("Start heute ist gültig", sinceForPair("2026-07-21", heute), "2026-07-21");

// --- wochenSeit --------------------------------------------------------------
check("15 Tage sind 2 Wochen", wochenSeit("2026-07-06", heute), 2);
check("7 Tage sind 1 Woche", wochenSeit("2026-07-14", heute), 1);
check("selber Tag sind 0 Wochen", wochenSeit("2026-07-21", heute), 0);

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
```

- [ ] **Step 2: Skript laufen lassen, Fehlschlag bestätigen**

Run: `npx tsx scripts/signal-start-check.mts`
Expected: Abbruch mit `Cannot find module '../lib/ml/signalStart'`

- [ ] **Step 3: Modul implementieren**

Erstelle `lib/ml/signalStart.ts`:

```ts
/**
 * Seit wann steht eine Ranking-Konstellation je Pair?
 *
 * `ml_weekly_rankings.week_start` ist die ZIELWOCHE der Prognose — der
 * kommende Montag (Backend/ml_engine/run_weekly.py:50). Als Startpunkt eines
 * Kursverlaufs ist der Wert deshalb immer falsch: er liegt in der Zukunft, und
 * die Konstellation steht meist schon Wochen.
 *
 * Richtig ist der Anfang des aktuellen ununterbrochenen Laufs derselben
 * Richtung. Reine Berechnung, ohne I/O.
 */

import type { PairIdea } from "./ranking";

export interface WeekIdeas {
  /** 'YYYY-MM-DD' */
  weekStart: string;
  ideas: PairIdea[];
}

/**
 * Startwoche des aktuellen Laufs je Pair.
 *
 * Gezählt wird von der jüngsten Woche rückwärts, solange das Pair in jeder
 * Woche vorkommt UND dieselbe Richtung trägt. Ein Richtungswechsel oder eine
 * Lücke beendet den Lauf — beides bedeutet, dass die Konstellation neu ist.
 */
export function signalStarts(weeks: WeekIdeas[]): Record<string, string> {
  const sortiert = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (sortiert.length === 0) return {};

  const richtungIn = sortiert.map((w) => {
    const m = new Map<string, "long" | "short">();
    for (const i of w.ideas) m.set(i.pair, i.direction);
    return m;
  });

  const letzte = richtungIn[richtungIn.length - 1];
  const out: Record<string, string> = {};

  for (const [pair, richtung] of letzte) {
    let start = sortiert[sortiert.length - 1].weekStart;
    for (let i = richtungIn.length - 2; i >= 0; i--) {
      if (richtungIn[i].get(pair) !== richtung) break;
      start = sortiert[i].weekStart;
    }
    out[pair] = start;
  }
  return out;
}

/**
 * Startpunkt für den Kursverlauf — oder `null`, wenn es keinen gibt.
 *
 * Ein Lauf, der erst in der Zielwoche beginnt, liegt in der Zukunft: das
 * Signal ist brandneu und hat noch keinen Verlauf. Dann darf die Oberfläche
 * kein Datum behaupten.
 */
export function sinceForPair(
  start: string | undefined,
  heute: Date = new Date(),
): string | null {
  if (!start) return null;
  const heuteIso = heute.toISOString().slice(0, 10);
  return start <= heuteIso ? start : null;
}

/** Volle Wochen zwischen Start und heute (abgerundet). */
export function wochenSeit(start: string, heute: Date = new Date()): number {
  const tage = (heute.getTime() - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.floor(tage / 7));
}
```

- [ ] **Step 4: Kontrollwerte laufen lassen**

Run: `npx tsx scripts/signal-start-check.mts`
Expected: `Alle Kontrollwerte grün.`

- [ ] **Step 5: Commit**

```bash
git add frontend-next/lib/ml/signalStart.ts frontend-next/scripts/signal-start-check.mts
git commit -m "feat(ml): Signalstart je Pair aus der Ranking-Historie"
```

---

## Task 6: Historie laden und durchreichen

**Files:**
- Modify: `lib/ml/ranking.ts:40-50` (Typ) und `108-181` (Loader)

- [ ] **Step 1: Feld im Typ ergänzen**

In `lib/ml/ranking.ts`, `RankingData` erweitern:

```ts
export interface RankingData {
  weekStart: string | null;
  /** Zeitpunkt des letzten Schreibens der aktuellen Wochen-Rankings (ISO) */
  updatedAt: string | null;
  horizon: number | null;
  champion: RankingRow[];
  baseline: RankingRow[];
  pairIdeas: PairIdeas;
  /**
   * Seit wann die Konstellation je Pair unverändert steht ('YYYY-MM-DD').
   * NICHT `weekStart` verwenden — das ist die Zielwoche der Prognose und liegt
   * in der Zukunft.
   */
  signalStartByPair: Record<string, string>;
  liveHitrate: Record<string, { hits: number; total: number }>;
  stats: EngineStats;
}
```

- [ ] **Step 2: Import ergänzen**

Unter die bestehenden Importe:

```ts
import { signalStarts, type WeekIdeas } from "./signalStart";
```

- [ ] **Step 3: Historie laden**

In `loadRankingDataUncached`, direkt **nach** dem Block, der `champion` und
`baseline` füllt (also nach der `if (weekStart) { ... }`-Klammer), einfügen:

```ts
  // Historie für den Signalstart: 26 Wochen Champion-Rankings reichen weit
  // genug zurück; laenger laufende Konstellationen sind ohnehin selten.
  const signalStartByPair: Record<string, string> = {};
  if (weekStart) {
    const von = new Date(`${weekStart}T00:00:00Z`);
    von.setUTCDate(von.getUTCDate() - 26 * 7);
    const { data: hist } = await sb
      .from("ml_weekly_rankings")
      .select("week_start,ccy,score,strength_quintile")
      .eq("model", "champion")
      .gte("week_start", von.toISOString().slice(0, 10))
      .order("week_start", { ascending: true });

    const proWoche = new Map<string, RankingRow[]>();
    for (const r of hist ?? []) {
      const w = r.week_start as string;
      if (!proWoche.has(w)) proWoche.set(w, []);
      proWoche.get(w)!.push({
        ccy: r.ccy as string,
        score: Number(r.score),
        strength_quintile: Number(r.strength_quintile),
        // Für die Pair-Ableitung irrelevant, der Typ verlangt das Feld.
        top_features: [],
      });
    }

    const weeks: WeekIdeas[] = [...proWoche.entries()].map(([w, rows]) => {
      const ideen = derivePairIdeas(rows);
      return {
        weekStart: w,
        ideas: [...ideen.best, ...ideen.groups.flatMap((g) => g.ideas)],
      };
    });
    Object.assign(signalStartByPair, signalStarts(weeks));
  }
```

- [ ] **Step 4: Im Rückgabewert ergänzen**

Im `return`-Objekt am Ende von `loadRankingDataUncached`, nach `pairIdeas`:

```ts
    signalStartByPair,
```

- [ ] **Step 5: Cache-Schlüssel hochziehen**

Der Rückgabewert hat ein neues Feld — ein alter Cache-Eintrag hätte es nicht.
Ändere den Schlüssel:

```ts
export const loadRankingData = unstable_cache(loadRankingDataUncached, ["ml-ranking-v2"], {
  revalidate: 300,
});
```

- [ ] **Step 6: Typen prüfen**

Run: `npx tsc --noEmit`
Expected: keine Ausgabe

- [ ] **Step 7: Commit**

```bash
git add frontend-next/lib/ml/ranking.ts
git commit -m "feat(ml): Ranking liefert den Signalstart je Pair"
```

---

## Task 7: Performance-Panel auf den echten Startpunkt umstellen

**Files:**
- Modify: `components/ml/RankingPerformance.tsx:9-31` und die Kopfzeile (Zeile ~114)
- Modify: `app/(app)/ml/ranking/page.tsx:228-235`

- [ ] **Step 1: Prop auf „je Pair" umstellen**

In `components/ml/RankingPerformance.tsx` Doc-Kommentar und Signatur ersetzen:

```tsx
/**
 * „Performance seit Signal" — vereinfachter Kursverlauf der Top-Pairs, ab dem
 * Zeitpunkt, seit dem die Konstellation für DIESES Pair unverändert steht.
 *
 * Bewusst nicht `weekStart` des Rankings: das ist die Zielwoche der Prognose
 * (kommender Montag) und liegt in der Zukunft — es gäbe dafür weder Kursdaten
 * noch eine sinnvolle Aussage.
 *
 * Pair-Pills wählen das Paar, Segmente schalten Daily/Weekly und Kerze/Linie
 * um. Quelle OANDA (`/api/candles`).
 */
export default function RankingPerformance({
  pairs,
  startByPair,
}: {
  pairs: PairIdea[];
  /** Pair-Anzeigename → 'YYYY-MM-DD'; fehlt = Signal ist neu. */
  startByPair: Record<string, string>;
}) {
```

- [ ] **Step 2: Startpunkt aus dem aktiven Pair ableiten**

Importe ergänzen:

```tsx
import { sinceForPair, wochenSeit } from "@/lib/ml/signalStart";
```

Ersetze `const start = since ?? "";` (Zeile 31) durch:

```tsx
  const start = active ? (sinceForPair(startByPair[active.pair]) ?? "") : "";
```

- [ ] **Step 3: Kopfzeile ehrlich beschriften**

Ersetze die Zeile mit `seit {startLabel}` (Zeile ~114) durch:

```tsx
        {start ? (
          <span className="text-xs text-faint">
            seit {start.slice(8, 10)}.{start.slice(5, 7)}.
            {(() => {
              const w = wochenSeit(start);
              return w > 0 ? ` · ${w} ${w === 1 ? "Woche" : "Wochen"}` : " · diese Woche";
            })()}
          </span>
        ) : (
          <span className="text-xs text-faint">neu — noch kein Verlauf</span>
        )}
```

Falls `startLabel` dadurch unbenutzt wird, entferne dessen Definition —
`npx eslint` meldet das sonst.

- [ ] **Step 4: Leerer Startpunkt darf nicht ewig „laden"**

`loading` startet auf `true`. Bricht der Effect bei leerem `start` ab, bleibt
der Ladezustand für ein brandneues Signal für immer stehen. Ersetze deshalb im
Effect die Zeile `if (!symbol || !start) return;` durch:

```tsx
    if (!symbol || !start) {
      setLoading(false);
      return;
    }
```

- [ ] **Step 5: Seite anpassen**

In `app/(app)/ml/ranking/page.tsx` das Panel (Zeile 228-235) ersetzen:

```tsx
      <Panel
        title="Performance seit Signal"
        subtitle="Kursverlauf je Kandidaten-Pair ab der Woche, seit der die Konstellation unverändert steht — nicht ab der Zielwoche der Prognose. Umschaltbar Daily/Weekly und Kerze/Linie. Quelle: OANDA."
      >
        <div className="p-5">
          <RankingPerformance pairs={perfPairs} startByPair={d.signalStartByPair} />
        </div>
      </Panel>
```

- [ ] **Step 6: Typen und Lint prüfen**

Run: `npx tsc --noEmit`
Expected: keine Ausgabe

Run: `npx eslint components/ml/RankingPerformance.tsx "app/(app)/ml/ranking/page.tsx"`
Expected: keine Meldung

- [ ] **Step 7: Commit**

```bash
git add frontend-next/components/ml/RankingPerformance.tsx "frontend-next/app/(app)/ml/ranking/page.tsx"
git commit -m "fix(ranking): Performance-Panel startet am echten Signalbeginn"
```

---

## Task 8: Gesamtabnahme

- [ ] **Step 1: Alle Kontrollwerte**

Run:
```bash
npx tsx scripts/trade-budget-check.mts
npx tsx scripts/signal-start-check.mts
npx tsx scripts/nav-modes-check.mts
npx tsx scripts/cockpit-board-check.mts
npx tsx scripts/setup-lifecycle-check.mts
npx tsx scripts/adopt-check.mts
```
Expected: jedes Skript endet mit `Alle Kontrollwerte grün.`

- [ ] **Step 2: Typen, Build, Lint**

Run: `npx tsc --noEmit`
Expected: keine Ausgabe

Run: `npx next build`
Expected: `✓ Compiled successfully`

Run: `npx eslint .`
Expected: **18 problems (15 errors, 3 warnings)** in 12 Dateien — das ist der
dokumentierte Vorbestand. Jede zusätzliche Meldung ist neu und muss behoben
werden, nicht akzeptiert.

- [ ] **Step 3: Backend-Suite (unberührt, aber Pflicht)**

Run (aus `c:\Projekte\Claude Cowork\GVA-Screener\Backend`): `python -m pytest tests -q`
Expected: `143 passed`

- [ ] **Step 4: STATUS.md ergänzen**

Trage über dem Abschnitt „Design: zurück auf warmes Anthrazit" einen neuen
Abschnitt ein: Trade-Budget (8 fest, Blöcke, Übertrag, Überzug nie blockiert,
`tradesPerMonth` entfallen, Expectancy-Prognose springt von +6,0 auf +12,0 %)
und den Signalstart-Fix (Ursache: `week_start` ist die Zielwoche, nicht der
Beginn; neu je Pair aus dem Lauf).

- [ ] **Step 5: Commit**

```bash
git add STATUS.md
git commit -m "docs(status): Trade-Budget und Signalstart-Fix dokumentiert"
```

---

## Bewusst nicht Teil davon

- Keine Budget-Historie über Monate hinweg.
- Keine Erinnerung/Alert bei aufgebrauchtem Budget.
- Keine Schema-Änderung — Budget wie Signalstart sind vollständig aus
  vorhandenen Tabellen ableitbar.
- `run_weekly.py` bleibt unberührt. `week_start` als kommender Montag ist
  korrekt für seinen Zweck; falsch war nur die Verwendung im Frontend.
