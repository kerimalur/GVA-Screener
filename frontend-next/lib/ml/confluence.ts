import {
  accToStat,
  emptyAcc,
  record,
  type Acc,
  type HorizonStat,
  type SetupFinderRow,
} from "./backtest";

/**
 * Schwellen-Konfluenz für den Setup-Finder (Outlook-Modus): Signal feuert,
 * wenn mindestens `threshold` der GEWÄHLTEN Faktoren in dieselbe Richtung
 * zeigen und die Gegenrichtung die Schwelle nicht erreicht (2v2 bei
 * Schwelle 2 → kein Signal). Reines Client-Rechnen — die Rohzeilen kommen
 * einmal von /api/ml/setup-finder, Schwelle/Faktoren sind live umstellbar.
 * Kein Lookahead: Faktor-Richtungen sind as-of Snapshot, Renditen forward.
 */

export const THRESHOLDS = [2, 3, 4, 5] as const;

/** Konfluenz-Richtung einer Zeile über die gewählten Faktor-Indizes. */
export function confluenceDir(
  dirs: Array<-1 | 0 | 1 | null>,
  selectedIdx: number[],
  threshold: number,
): -1 | 0 | 1 {
  let pos = 0;
  let neg = 0;
  for (const i of selectedIdx) {
    const d = dirs[i];
    if (d === 1) pos++;
    else if (d === -1) neg++;
  }
  if (pos >= threshold && neg < threshold) return 1;
  if (neg >= threshold && pos < threshold) return -1;
  return 0;
}

export interface ThresholdStats {
  threshold: number;
  signals: number;
  horizons: HorizonStat[];
}

export interface PairStats {
  instrument: string;
  signals: number;
  horizons: HorizonStat[];
}

export interface ConfluenceBacktest {
  /** ALLE Schwellen (Overfitting-Schutz: keine nachträgliche Bestenauswahl) */
  byThreshold: ThresholdStats[];
  /** je Pair, für die live gewählte Schwelle */
  byPair: PairStats[];
  weeksCovered: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

/**
 * Backtest über die gefilterten Zeilen: Trefferquote je Schwelle (aggregiert)
 * und je Pair (für `pairThreshold`). `horizons` = HORIZONS aus der API.
 */
export function runConfluenceBacktest(
  rows: SetupFinderRow[],
  selectedIdx: number[],
  horizons: number[],
  pairThreshold: number,
): ConfluenceBacktest {
  const mkAccs = () => new Map<number, Acc>(horizons.map((h) => [h, emptyAcc()]));
  const byThreshold = new Map<number, { signals: number; accs: Map<number, Acc> }>(
    THRESHOLDS.map((t) => [t, { signals: 0, accs: mkAccs() }]),
  );
  const byPair = new Map<string, { signals: number; accs: Map<number, Acc> }>();
  const weeks = new Set<string>();
  let effectiveFrom: string | null = null;
  let effectiveTo: string | null = null;

  for (const row of rows) {
    weeks.add(row.w);
    if (effectiveFrom === null || row.w < effectiveFrom) effectiveFrom = row.w;
    if (effectiveTo === null || row.w > effectiveTo) effectiveTo = row.w;

    for (const t of THRESHOLDS) {
      const dir = confluenceDir(row.d, selectedIdx, t);
      if (dir === 0) continue;
      const bucket = byThreshold.get(t)!;
      bucket.signals++;
      for (let hi = 0; hi < horizons.length; hi++) {
        const raw = row.r[hi];
        if (raw !== null) record(bucket.accs.get(horizons[hi])!, dir, raw);
      }
      if (t === pairThreshold) {
        let p = byPair.get(row.i);
        if (!p) {
          p = { signals: 0, accs: mkAccs() };
          byPair.set(row.i, p);
        }
        p.signals++;
        for (let hi = 0; hi < horizons.length; hi++) {
          const raw = row.r[hi];
          if (raw !== null) record(p.accs.get(horizons[hi])!, dir, raw);
        }
      }
    }
  }

  const stats = (accs: Map<number, Acc>): HorizonStat[] =>
    horizons.map((h) => accToStat(h, accs.get(h)!));

  return {
    byThreshold: THRESHOLDS.map((t) => ({
      threshold: t,
      signals: byThreshold.get(t)!.signals,
      horizons: stats(byThreshold.get(t)!.accs),
    })),
    byPair: [...byPair.entries()]
      .map(([instrument, p]) => ({ instrument, signals: p.signals, horizons: stats(p.accs) }))
      .sort((a, b) => (b.horizons[3]?.hitRate ?? -1) - (a.horizons[3]?.hitRate ?? -1)),
    weeksCovered: weeks.size,
    effectiveFrom,
    effectiveTo,
  };
}
