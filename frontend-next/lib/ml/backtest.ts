import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "@/lib/data/util";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";

/**
 * Backtest der Weekly-Outlook-Signale gegen den tatsächlichen Kursverlauf
 * (price_daily) über 1–4 Wochen.
 *
 * Zwei Ebenen:
 *  1. Verdict-Ebene: das fertige Signal (≥2 gleichgerichtete Faktoren) —
 *     aufgeschlüsselt nach Horizont, Konfluenz, Basiswährung, Pair.
 *  2. Faktor-Ebene: jeder Einzelfaktor UND jede mögliche Faktor-Kombination
 *     als eigenständiger Richtungs-Vorhersager — welche Kombi schneidet am
 *     besten ab? Kombi feuert, wenn ALLE Faktoren der Gruppe gleichgerichtet
 *     zeigen (einstimmig).
 *
 * Trefferdefinition: LONG trifft, wenn Close_{+N Wochen} > Close_Signalwoche;
 * SHORT umgekehrt. Ø-Rendite ist in Signalrichtung vorzeichenbehaftet, ohne Kosten.
 */

export const HORIZONS = [1, 2, 3, 4] as const;

/** Faktoren mit durchgehender Historie (Retail fehlt vor Jul 2026 → nicht in Kombis). */
export const COMBO_FACTORS = ["Zinsdifferenz", "COT-Flow", "Saisonalität", "Yield-Spread"] as const;
export const FACTOR_SHORT: Record<string, string> = {
  Zinsdifferenz: "Zins",
  "COT-Flow": "COT",
  Saisonalität: "Saison",
  "Yield-Spread": "Yield",
  "Retail-Sentiment": "Retail",
};

export interface HorizonStat {
  horizon: number;
  n: number;
  hitRate: number | null;
  avgReturnPct: number | null;
}

export interface BacktestBucket {
  key: string;
  signals: number;
  horizons: HorizonStat[];
}

export interface FactorRow {
  name: string;
  horizons: HorizonStat[];
}

export interface ComboRow {
  factors: string[];
  label: string;
  size: number;
  horizons: HorizonStat[];
}

export interface BacktestResult {
  signalsTotal: number;
  weeksCovered: number;
  priceFrom: string | null;
  priceTo: string | null;
  overall: HorizonStat[];
  byAligned: BacktestBucket[];
  byCurrency: BacktestBucket[];
  byInstrument: BacktestBucket[];
  factorsSingle: FactorRow[];
  combos: ComboRow[];
  note: string;
}

interface Acc {
  n: number;
  hits: number;
  sumRet: number;
}
const emptyAcc = (): Acc => ({ n: 0, hits: 0, sumRet: 0 });
const horizonAccs = () => new Map<number, Acc>(HORIZONS.map((h) => [h, emptyAcc()]));

function accToStat(horizon: number, a: Acc): HorizonStat {
  return {
    horizon,
    n: a.n,
    hitRate: a.n > 0 ? (a.hits / a.n) * 100 : null,
    avgReturnPct: a.n > 0 ? a.sumRet / a.n : null,
  };
}

/** Signal der Richtung `dir` (+1/-1) mit roher Pair-Rendite verbuchen. */
function record(acc: Acc, dir: number, rawRetPct: number) {
  const signed = dir * rawRetPct;
  acc.n++;
  if (signed > 0) acc.hits++;
  acc.sumRet += signed;
}

/** Erster Close mit date >= target (innerhalb toleranz Tage), sonst null. */
function closeAtOrAfter(
  series: Array<{ date: string; close: number }>,
  targetMs: number,
  toleranceDays: number,
): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(series[mid].date).getTime() >= targetMs) {
      idx = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (idx === -1) return null;
  const gapDays = (new Date(series[idx].date).getTime() - targetMs) / 86_400_000;
  return gapDays <= toleranceDays ? series[idx].close : null;
}

interface FactorObj {
  name: string;
  dir: -1 | 0 | 1;
}

export async function loadBacktest(db: SupabaseClient): Promise<BacktestResult> {
  // ALLE Snapshots (auch NEUTRAL) — die Faktor-/Kombi-Analyse ist verdict-unabhängig.
  const snaps = await pagedSelect<{
    week_start: string;
    instrument: string;
    direction: string | null;
    aligned_count: number;
    factors: FactorObj[];
  }>(db, "weekly_outlook_snapshots", "week_start, instrument, direction, aligned_count, factors", (q) =>
    q.order("week_start"),
  );

  const fxSet = new Set(FX_INSTRUMENTS.map((i) => i.instrument));
  const rows = snaps.filter((s) => fxSet.has(s.instrument));
  const earliest = rows.length ? rows[0].week_start : null;

  const priceRows = earliest
    ? await pagedSelect<{ instrument: string; date: string; close: number }>(
        db,
        "price_daily",
        "instrument, date, close",
        (q) => q.in("instrument", [...fxSet]).gte("date", earliest).order("instrument").order("date"),
      )
    : [];

  const pricesByInstrument = new Map<string, Array<{ date: string; close: number }>>();
  let priceFrom: string | null = null;
  let priceTo: string | null = null;
  for (const r of priceRows) {
    const arr = pricesByInstrument.get(r.instrument) ?? [];
    arr.push({ date: r.date, close: r.close });
    pricesByInstrument.set(r.instrument, arr);
    if (!priceFrom || r.date < priceFrom) priceFrom = r.date;
    if (!priceTo || r.date > priceTo) priceTo = r.date;
  }

  // — Verdict-Aggregatoren —
  const overall = horizonAccs();
  const byAligned = new Map<number, Map<number, Acc>>();
  const byCurrency = new Map<string, Map<number, Acc>>();
  const byInstrument = new Map<string, Map<number, Acc>>();
  const weeks = new Set<string>();
  let verdictSignals = 0;

  // — Faktor-/Kombi-Aggregatoren —
  const singleAccs = new Map<string, Map<number, Acc>>(); // je Faktorname
  // Alle nicht-leeren Teilmengen der COMBO_FACTORS (Bitmasken 1..2^n-1)
  const n = COMBO_FACTORS.length;
  const subsets: Array<{ idx: number[]; label: string; factors: string[] }> = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    const factors = idx.map((i) => COMBO_FACTORS[i]);
    subsets.push({ idx, label: factors.map((f) => FACTOR_SHORT[f]).join("+"), factors });
  }
  const comboAccs = subsets.map(() => horizonAccs());

  const ensure = (m: Map<string, Map<number, Acc>>, key: string) => {
    let e = m.get(key);
    if (!e) {
      e = horizonAccs();
      m.set(key, e);
    }
    return e;
  };

  for (const s of rows) {
    const series = pricesByInstrument.get(s.instrument);
    if (!series || series.length === 0) continue;
    const week0 = new Date(s.week_start + "T00:00:00Z").getTime();
    const c0 = closeAtOrAfter(series, week0, 5);
    if (c0 === null || c0 === 0) continue;

    // Rohe Pair-Rendite je Horizont (einmal pro Snapshot)
    const rawByH = new Map<number, number>();
    for (const h of HORIZONS) {
      const cN = closeAtOrAfter(series, week0 + h * 7 * 86_400_000, 7);
      if (cN !== null) rawByH.set(h, ((cN - c0) / c0) * 100);
    }
    if (rawByH.size === 0) continue;
    weeks.add(s.week_start);

    // — Verdict-Ebene (nur wenn Signal gefeuert hat) —
    if (s.direction === "LONG" || s.direction === "SHORT") {
      verdictSignals++;
      const d = s.direction === "LONG" ? 1 : -1;
      const base = s.instrument.split("_")[0];
      const alignedBucket =
        byAligned.get(s.aligned_count) ??
        (() => {
          const m = horizonAccs();
          byAligned.set(s.aligned_count, m);
          return m;
        })();
      const ccyBucket = ensure(byCurrency, base);
      const instBucket = ensure(byInstrument, s.instrument);
      for (const [h, raw] of rawByH) {
        for (const acc of [overall.get(h)!, alignedBucket.get(h)!, ccyBucket.get(h)!, instBucket.get(h)!]) {
          record(acc, d, raw);
        }
      }
    }

    // — Faktor-Ebene (verdict-unabhängig) —
    const dirByFactor = new Map<string, number>();
    for (const f of s.factors ?? []) {
      dirByFactor.set(f.name, f.dir);
      if (f.dir !== 0) {
        const acc = ensure(singleAccs, f.name);
        for (const [h, raw] of rawByH) record(acc.get(h)!, f.dir, raw);
      }
    }

    // — Kombi-Ebene: Teilmenge feuert, wenn alle Faktoren gleichgerichtet (≠0) —
    const comboDirs = COMBO_FACTORS.map((f) => dirByFactor.get(f) ?? 0);
    subsets.forEach((sub, si) => {
      const first = comboDirs[sub.idx[0]];
      if (first === 0) return;
      for (const i of sub.idx) if (comboDirs[i] !== first) return; // nicht einstimmig
      const accs = comboAccs[si];
      for (const [h, raw] of rawByH) record(accs.get(h)!, first, raw);
    });
  }

  const bucketList = (m: Map<string, Map<number, Acc>>): BacktestBucket[] =>
    [...m.entries()].map(([key, hAccs]) => ({
      key,
      signals: hAccs.get(1)!.n,
      horizons: HORIZONS.map((h) => accToStat(h, hAccs.get(h)!)),
    }));

  const alignedBuckets: BacktestBucket[] = [...byAligned.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([aligned, hAccs]) => ({
      key: `${aligned} Faktoren`,
      signals: hAccs.get(1)!.n,
      horizons: HORIZONS.map((h) => accToStat(h, hAccs.get(h)!)),
    }));

  const factorsSingle: FactorRow[] = [...singleAccs.entries()]
    .map(([name, hAccs]) => ({ name, horizons: HORIZONS.map((h) => accToStat(h, hAccs.get(h)!)) }))
    .sort((a, b) => (b.horizons[3].hitRate ?? -1) - (a.horizons[3].hitRate ?? -1));

  const combos: ComboRow[] = subsets
    .map((sub, si) => ({
      factors: sub.factors,
      label: sub.label,
      size: sub.factors.length,
      horizons: HORIZONS.map((h) => accToStat(h, comboAccs[si].get(h)!)),
    }))
    .filter((c) => c.size >= 2) // Größe 1 steht schon in der Einzelfaktor-Tabelle
    .sort((a, b) => (b.horizons[3].hitRate ?? -1) - (a.horizons[3].hitRate ?? -1));

  return {
    signalsTotal: verdictSignals,
    weeksCovered: weeks.size,
    priceFrom,
    priceTo,
    overall: HORIZONS.map((h) => accToStat(h, overall.get(h)!)),
    byAligned: alignedBuckets,
    byCurrency: bucketList(byCurrency).sort(
      (a, b) => (b.horizons[3].hitRate ?? -1) - (a.horizons[3].hitRate ?? -1),
    ),
    byInstrument: bucketList(byInstrument).sort(
      (a, b) => (b.horizons[3].hitRate ?? -1) - (a.horizons[3].hitRate ?? -1),
    ),
    factorsSingle,
    combos,
    note:
      "Trefferquote = Anteil der Signale, deren Close nach N Wochen in Signalrichtung lag. " +
      "Einzelfaktor/Kombi verdict-unabhängig: die Faktor-Richtung selbst ist das Signal, " +
      "Kombi feuert nur bei einstimmiger Ausrichtung. COT = Non-Commercials/Leveraged Funds " +
      "(aktuelle Tool-Logik). Retail-Sentiment fehlt vor Jul 2026 → nicht in Kombis. Ohne Spread/Kosten.",
  };
}
