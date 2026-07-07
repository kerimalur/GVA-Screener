# Design: Vergleich-Stats-Tabelle & Dashboard-Währungs-Kompass

**Datum:** 2026-07-06
**Status:** Vom User freigegeben

## Ziel

Zwei Erweiterungen im GVA-Screener-Frontend (`frontend-next`):

1. **Vergleich-Seite** (`/vergleich`): Der freie Serien-Vergleich zeigt bisher nur den Chart + Korrelation. Neu: eine Stats-Tabelle unter dem Chart mit letztem Wert und Veränderung (1W/1M/3M/1J) für beide gewählte Serien — Zahlen statt nur Visuelles.
2. **Dashboard** (`/`): Neue Übersicht "Währungs-Kompass" — pro G8-Währung ein LONG/SHORT/NEUTRAL-Bias aus einem eigenen 4-Faktoren-Modell, Details per Klick in einem Modal-Popup. Ersetzt die bisherige COT-Schnellübersicht.

## Feature 1 — Vergleich: Stats-Tabelle

### Neue Dateien

**`lib/calc/changeStats.ts`** — pure Funktion, keine I/O:

```ts
export interface ChangeStat {
  delta: number;        // absolute Veränderung
  pct: number | null;   // prozentual — null wenn Basiswert <= 0
}
export interface ChangeStats {
  last: number | null;                       // letzter Wert
  lastDate: string | null;
  changes: Record<"1W" | "1M" | "3M" | "1J", ChangeStat | null>;
}
export function computeChangeStats(points: SeriesPoint[]): ChangeStats;
```

- Lookback **datumsbasiert**: Cutoff = letztes Datum minus 7/30/91/365 Tage, Vergleichswert = letzter Punkt mit `date <= cutoff`. Funktioniert damit für tägliche Preise und wöchentliche COT-Serien gleichermaßen. Kein Vergleichspunkt vorhanden → `null` für dieses Fenster.
- `pct` nur wenn Basiswert > 0 — COT-Netto kann negativ sein, Prozent wäre dort irreführend. Dann nur absolute Δ anzeigen.

**`components/vergleich/CompareStatsTable.tsx`** — präsentationale Komponente:

- Props: `rows: Array<{ label: string; points: SeriesPoint[] }>` (Serie A + B).
- Tabelle: Zeile pro Serie, Spalten **Letzter Wert · Δ1W · Δ1M · Δ3M · Δ1J**.
- Farben: positiv `text-up` + ▲, negativ `text-down` + ▼, null/kein Wert "–". Bestehende Tailwind-Tokens (`bg-surface2`, `border-border`, Mono-Font) wie in `CotSnapshotTable`.
- Zahlenformat: |Wert| ≥ 10 000 → kompakt (`98,4k`), sonst bis 4 signifikante Nachkommastellen. Δ zeigt absolut, darunter/daneben % wenn vorhanden.

### Anbindung

`components/intermarket/OverlayChart.tsx` bekommt optionales Prop `showStats?: boolean` (default `false`):

- `true` → rendert `CompareStatsTable` unter dem Chart aus den **bereits geladenen** Serien (`seriesA`/`seriesB`). Kein zweiter Fetch, keine neue API-Route.
- Intermarket-Seite bleibt unverändert; `components/vergleich/SeriesPicker.tsx` setzt `showStats`.

### Fehlerfälle

- Leere Serie / Fetch-Fehler: bestehendes Error-/Loading-Handling von OverlayChart greift; Tabelle rendert "–" für fehlende Werte.

## Feature 2 — Dashboard: Währungs-Kompass

### Neues Calc-Modul

**`lib/calc/currencyBias.ts`**:

```ts
export interface CurrencyFactor {
  name: string;
  dir: -1 | 0 | 1;
  text: string;       // deutsche Erklärung wie im Pair-Screener
}
export interface CurrencyBias {
  ccy: string;
  direction: "LONG" | "SHORT" | null;   // null = NEUTRAL
  alignedCount: number;
  factorCount: number;
  factors: CurrencyFactor[];
  percentile: number | null;            // COT-Niveau, nur Kontext/Warnung
  strength: Record<"1W" | "1M" | "3M", number>;
}
export function evaluateCurrency(ccy: string, inputs: CurrencyBiasInputs): CurrencyBias;
```

### Die 4 Faktoren

| Faktor | Quelle | Long ab | Short ab |
|---|---|---|---|
| COT-Flow 4W | `cotFlowByCcy` — `delta4wPctOi` (% OI); Streak-Text wie im Pair-Screener | ≥ +2 | ≤ −2 |
| Leitzins-Trend 6M | `policyByCcy` — Δ Leitzins über 6 Monate | ≥ +0,25 pp | ≤ −0,25 pp |
| CB-Stance | `stances` — **nur `manualScore`** (−10…+10) | ≥ +2 | ≤ −2 |
| Stärke 1M | `strength.scores["1M"]` (Ø signierter Pair-Return %) | ≥ +0,4 % | ≤ −0,4 % |

**Wichtig — keine Doppelzählung:** `combineStance` mischt die Raten-Trajektorie (Δ Leitzins 6M) bereits zu 40 % in den kombinierten Score. Der CB-Stance-Faktor nutzt deshalb **ausschließlich `manualScore`**; der Leitzins-Trend ist ein eigener, rein berechneter Faktor.

### Aggregation

Wie `evaluatePair` im Pair-Screener: `longCount >= 2 && longCount > shortCount` → LONG, spiegelbildlich SHORT, sonst NEUTRAL (`direction: null`). Fehlt eine Datenquelle, wird der Faktor ausgelassen — Bias entsteht aus dem Rest; weniger als 2 verfügbare Faktoren → zwingend NEUTRAL.

COT-Perzentil ist **kein** Richtungsfaktor: es erscheint nur als ⚠-Extremwarnung im Popup (Schwellen `hi = settings.terminal.cotExtremePct`, `lo = 100 − hi`, wie bisher).

### UI

**`components/dashboard/CurrencyBiasPanel.tsx`** (Client-Komponente, `useState` für Modal):

- Grid wie bisherige COT-Schnellübersicht (`grid-cols-4 md:grid-cols-8`), pro Währung eine klickbare Kachel: Währungscode, Badge **LONG** (`bg-up/15 text-up`) / **SHORT** (`bg-down/15 text-down`) / **NEUTRAL** (muted), darunter `alignedCount/factorCount Faktoren`, ⚠-Marker bei Perzentil-Extrem.
- Klick → bestehende `components/ui/Modal.tsx`. Inhalt:
  - Titel: Währung + Richtungs-Badge.
  - Faktorliste im ScreenerPanel-Stil: pro Zeile LONG/SHORT/– (Mono, farbig) + Erklärungstext.
  - Extremwarnung wenn Perzentil ≥ hi oder ≤ lo.
  - Stärke-Zeile: 1W / 1M / 3M nebeneinander, farbig signiert.
- Keine Daten (alle Maps leer) → Hinweistext wie bisher ("COT-Daten fehlen — Backfill ausführen").

### Datenfluss

- `lib/data/dashboard.ts` → `loadDashboardData` berechnet `currencyBias: CurrencyBias[]` aus den **bereits geladenen** Maps (`cotFlowByCcy`, `policyByCcy`, `stances`, `strength`, `cotPercentileByCcy`). **Null neue Supabase-Queries**; der 5-Minuten-`unstable_cache` in `app/(app)/page.tsx` greift unverändert.
- `DashboardData` bekommt Feld `currencyBias`; `cotPercentiles` bleibt vorerst im Interface (COT-Seite unberührt), nur das Dashboard-Panel wird ersetzt.
- `app/(app)/page.tsx`: Panel "COT-Schnellübersicht" ersetzt durch Panel "Währungs-Kompass" (Untertitel: "Long/Short-Bias je Währung aus 4 Faktoren — Details per Klick") mit `<CurrencyBiasPanel biases={data.currencyBias} extremeHi={hi} extremeLo={lo} />`.

## Nicht im Scope

- Keine Änderungen an COT-Seite, Scanner, Journal.
- Keine neuen API-Routen, keine Schema-Änderungen.
- Kein Refactoring des Pair-Screeners.

## Verifikation

Projekt hat keine Test-Infrastruktur (nur `eslint`). Verifikation:

1. `npm run lint` und `npm run build` fehlerfrei.
2. Dev-Server: `/vergleich` — Tabelle zeigt plausible Δ-Werte für COT-Netto EUR vs. EUR/USD (Default-Auswahl); Serienwechsel aktualisiert Tabelle; Intermarket-Seite optisch unverändert.
3. Dashboard: 8 Kacheln mit Badge, Klick öffnet Modal mit Faktorliste, Schließen funktioniert; Extremwarnung erscheint bei Perzentil-Extremen.
