# Trade-Budget — 8 Kästchen pro Monat

Stand: 2026-07-21

## Problem

Kerim will die Anzahl Trades pro Monat begrenzen — nicht als Vorsatz, sondern
sichtbar. Heute gibt es dafür nichts: das Journal zählt Trades erst im
Rückblick, und die Entscheidung „nehme ich diesen Hit?" fällt im Cockpit ohne
jeden Hinweis darauf, wie viel vom Monat schon verbraucht ist.

Ein Zähler „5 Trades diesen Monat" wäre zu wenig. Er sagt nicht, wie viel noch
übrig ist, und er macht den Vorrat nicht anschaulich. Acht Kästchen tun genau
das: man sieht auf einen Blick, was verbraucht, was offen und was noch gesperrt
ist.

## Entscheidungen

**Budget = fest 8 pro Monat.** Konstante im Code, keine Einstellung.
`TRADE_BUDGET_PER_MONTH = 8` in `lib/journal/budget.ts`.

**Freischaltung in vier Blöcken zu je 2**, nach Tag im Monat:

| Block | Tage | freigeschaltet |
|---|---|---|
| 1 | 1.–7. | 2 |
| 2 | 8.–14. | 4 |
| 3 | 15.–21. | 6 |
| 4 | 22.–Monatsende | 8 |

Bewusst feste 7-Tage-Blöcke ab dem 1. und keine Kalenderwochen: ein Monat
berührt 5–6 Kalenderwochen, feste Blöcke ergeben immer exakt vier. Block 4 ist
dadurch 7–10 Tage lang.

**Ungenutzte Kästchen verfallen nicht.** Freigeschaltet ist kumulativ: in
Block 2 stehen vier Kästchen offen, unabhängig davon, ob in Block 1 eines,
keines oder beide verbraucht wurden. Wer wartet, darf später mehr — der
Monatsdeckel bleibt 8.

Der Übertrag braucht keine eigene Regel: verbraucht wird von links,
freigeschaltet wird nach Block. Ungenutzte Kästchen bleiben dadurch von selbst
offen.

**Ein Kästchen = ein Live-Trade, kontenübergreifend.** Gefiltert wird auf
`session_type = 'live'` im laufenden Monat; Funded und Eigenkapital zählen
zusammen. Das Budget begrenzt Kerims Verhalten, nicht ein Konto — dasselbe
Setup auf beiden Konten sind zwei Entscheidungen und verbrauchen zwei
Kästchen. Backtest-Trades zählen nie.

**Überzug wird nie blockiert.** Ein neunter Trade ist möglicherweise beim Broker
längst offen; würde das Journal ihn verweigern, bliebe er ungeloggt und Winrate
wie Adherence wären wertlos. Stattdessen: Warnung im Cockpit vor der
Entscheidung, roter Extra-Kasten im Dashboard danach.

**`tradesPerMonth` entfällt als Einstellung.** Das Feld in `SettingsView`
(Zeile 459) wird entfernt, `ExpectancyParams.tradesPerMonth` fällt weg;
`expectancyPerMonth` rechnet mit `TRADE_BUDGET_PER_MONTH`. Damit kann die
Expectancy-Karte nicht mehr mit einer Trade-Zahl rechnen, die das Budget gar
nicht erlaubt. Risiko % und RR bleiben einstellbar.

Folge: die Prognose ändert sich sichtbar (bei WR 50 %, 1 %, RR 1:4 von +6,0 %
auf +12,0 % pro Monat), weil sie vorher mit 4 statt 8 Trades rechnete.

Ein bereits gespeicherter `tradesPerMonth`-Wert in `user_preferences` bleibt als
toter Schlüssel liegen. Das ist unschädlich — `loadExpectancyParams` legt die
gespeicherten Werte über die Defaults und unbekannte Schlüssel werden nirgends
mehr gelesen. Kein Migrationsschritt nötig.

## Aufbau

### `lib/journal/budget.ts` — reine Berechnung, keine I/O

Dasselbe Muster wie `lib/cockpit/board.ts`: ohne Browser und ohne Supabase
prüfbar.

```ts
export const TRADE_BUDGET_PER_MONTH = 8;
export const BUDGET_BLOCKS = 4;

export type BoxState = "used" | "open" | "locked" | "overrun";

export interface BudgetState {
  total: number;      // 8
  unlocked: number;   // 2 | 4 | 6 | 8
  used: number;       // Live-Trades im Monat (kann > total sein)
  offen: number;      // max(0, unlocked − used)
  overrun: number;    // max(0, used − total)
  boxes: BoxState[];  // Länge total + overrun
  block: number;      // 1..4
}

export function weekBlockOf(datum: Date): number;
export function unlockedBoxes(datum: Date, total?: number): number;
export function usedThisMonth(trades: Trade[], datum: Date): number;
export function budgetState(trades: Trade[], datum?: Date): BudgetState;
```

`weekBlockOf`: `min(4, floor((tag − 1) / 7) + 1)`.
`unlockedBoxes`: `min(total, ceil(total / 4) × block)`.
`usedThisMonth`: `session_type === "live"` und `trade.date` im selben
Kalendermonat wie `datum`. Kontotyp wird nicht gefiltert.

Box `i` (0-basiert): `i < used` → `used`; sonst `i < unlocked` → `open`; sonst
`locked`. Kästchen jenseits von `total` → `overrun`.

### `components/journal/TradeBudgetCard.tsx`

Acht Kästchen in vier Paaren, Blocklabel darunter, Überzug rechts angehängt.
Steht im Journal-Dashboard **über** dem Konto-Umschalter und ändert sich beim
Umschalten nicht — sonst sähe es aus wie ein Konto-Wert.

```
BUDGET JULI                    5 / 8 · 1 offen
[■][■] [■][■] [■][□] [▪][▪]
 1.–7.  8.–14. 15.–21. ab 22.
```

Zustände über die bestehenden Tokens: `used` = `bg-accent`, `open` = `border-
border2` ohne Füllung, `locked` = `bg-surface2` gedimmt, `overrun` =
`bg-down/15 text-down`.

Lädt `loadTrades()` selbst (kein Kontotyp-Argument) und ist damit unabhängig
vom Umschalter des Dashboards.

### Cockpit

Chip in der Kopfzeile neben dem Zonen-Stand: `3 von 8 übrig`. Bei
`offen === 0` zusätzlich ein Warnhinweis an der „Genommen"-Aktion der Karte —
Text, kein `disabled`.

Der Zähler kommt aus derselben `budgetState`-Funktion. Fällt `loadTrades()`
aus, entfällt der Chip still; das Board bleibt vollständig bedienbar (dieselbe
Regel wie bei den übrigen optionalen Anreicherungen).

## Kontrollwerte

`scripts/trade-budget-check.mts`, im Muster von `cockpit-board-check.mts`:

- Blockgrenzen: 1. → 1, 7. → 1, 8. → 2, 14. → 2, 15. → 3, 21. → 3, 22. → 4,
  28./30./31. → 4
- Freischaltung je Block: 2 / 4 / 6 / 8
- Übertrag: Block 1 mit 0 Trades → in Block 2 vier offene Kästchen
- Verbrauch von links: 3 Trades in Block 4 → Boxen 1–3 `used`, 4–8 `open`
- Überzug: 9 Trades → 8 × `used` + 1 × `overrun`, `offen === 0`
- Backtest-Trades zählen nicht
- Trades aus dem Vormonat zählen nicht
- Beide Kontotypen zählen zusammen
- `expectancyPerMonth` mit dem festen Budget: WR 25 % → +2,0 %, WR 50 % →
  +12,0 % (bei 1 %, RR 1:4)

## Bewusst nicht Teil davon

- Keine Historie („wie viele Monate hast du das Budget gehalten?") — käme aus
  denselben Trades und lässt sich später ergänzen, ohne dass hier etwas
  vorbereitet werden muss.
- Keine Wochen-Erinnerung, kein Telegram-Alert.
- Keine Schema-Änderung. Das Budget ist vollständig aus `trades` ableitbar.
