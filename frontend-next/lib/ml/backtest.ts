import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "@/lib/data/util";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";

/**
 * Backtest der Weekly-Outlook-Signale: jedes eingefrorene Wochen-Verdict
 * (weekly_outlook_snapshots) gegen den tatsächlichen Kursverlauf (price_daily)
 * über 1–4 Wochen. Misst Trefferquote + Ø gerichtete Rendite, aufgeschlüsselt
 * nach Horizont, Faktor-Konfluenz (aligned_count), Basiswährung und Pair.
 *
 * Trefferdefinition: LONG trifft, wenn Close_{+N Wochen} > Close_Signalwoche;
 * SHORT umgekehrt. Gerichtete Rendite ist in Signalrichtung vorzeichenbehaftet.
 */

export const HORIZONS = [1, 2, 3, 4] as const;

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

export interface BacktestResult {
  signalsTotal: number;
  weeksCovered: number;
  priceFrom: string | null;
  priceTo: string | null;
  overall: HorizonStat[];
  byAligned: BacktestBucket[];
  byCurrency: BacktestBucket[];
  byInstrument: BacktestBucket[];
  note: string;
}

interface Acc {
  n: number;
  hits: number;
  sumRet: number;
}

const emptyAcc = (): Acc => ({ n: 0, hits: 0, sumRet: 0 });

function accToStat(horizon: number, a: Acc): HorizonStat {
  return {
    horizon,
    n: a.n,
    hitRate: a.n > 0 ? (a.hits / a.n) * 100 : null,
    avgReturnPct: a.n > 0 ? a.sumRet / a.n : null,
  };
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

export async function loadBacktest(db: SupabaseClient): Promise<BacktestResult> {
  const snaps = await pagedSelect<{
    week_start: string;
    instrument: string;
    direction: string | null;
    aligned_count: number;
  }>(db, "weekly_outlook_snapshots", "week_start, instrument, direction, aligned_count", (q) =>
    q.not("direction", "is", null).order("week_start"),
  );

  const fxSet = new Set(FX_INSTRUMENTS.map((i) => i.instrument));
  const signals = snaps.filter((s) => fxSet.has(s.instrument));

  const earliest = signals.length ? signals[0].week_start : null;

  // Kurse aller FX-Pairs ab der frühesten Signalwoche (chronologisch je Pair)
  const priceRows = earliest
    ? await pagedSelect<{ instrument: string; date: string; close: number }>(
        db,
        "price_daily",
        "instrument, date, close",
        (q) =>
          q
            .in("instrument", [...fxSet])
            .gte("date", earliest)
            .order("instrument")
            .order("date"),
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

  // Akkumulatoren: overall + je aligned_count + je Basiswährung + je Pair
  const overall = new Map<number, Acc>(HORIZONS.map((h) => [h, emptyAcc()]));
  const byAligned = new Map<number, Map<number, Acc>>();
  const byCurrency = new Map<string, Map<number, Acc>>();
  const byInstrument = new Map<string, Map<number, Acc>>();
  const weeks = new Set<string>();

  const ensure = (m: Map<string, Map<number, Acc>>, key: string) => {
    let e = m.get(key);
    if (!e) {
      e = new Map(HORIZONS.map((h) => [h, emptyAcc()]));
      m.set(key, e);
    }
    return e;
  };

  for (const s of signals) {
    if (s.direction !== "LONG" && s.direction !== "SHORT") continue;
    const series = pricesByInstrument.get(s.instrument);
    if (!series || series.length === 0) continue;

    weeks.add(s.week_start);
    const week0 = new Date(s.week_start + "T00:00:00Z").getTime();
    const c0 = closeAtOrAfter(series, week0, 5);
    if (c0 === null || c0 === 0) continue;

    const base = s.instrument.split("_")[0];
    const alignedBucket =
      byAligned.get(s.aligned_count) ??
      (() => {
        const m = new Map<number, Acc>(HORIZONS.map((h) => [h, emptyAcc()]));
        byAligned.set(s.aligned_count, m);
        return m;
      })();
    const ccyBucket = ensure(byCurrency, base);
    const instBucket = ensure(byInstrument, s.instrument);

    for (const h of HORIZONS) {
      const targetMs = week0 + h * 7 * 86_400_000;
      const cN = closeAtOrAfter(series, targetMs, 7);
      if (cN === null) continue;
      const raw = (cN - c0) / c0;
      const signed = (s.direction === "LONG" ? raw : -raw) * 100;
      const hit = signed > 0 ? 1 : 0;

      for (const acc of [overall.get(h)!, alignedBucket.get(h)!, ccyBucket.get(h)!, instBucket.get(h)!]) {
        acc.n++;
        acc.hits += hit;
        acc.sumRet += signed;
      }
    }
  }

  const bucketList = (m: Map<string, Map<number, Acc>>): BacktestBucket[] =>
    [...m.entries()].map(([key, horizons]) => ({
      key,
      signals: horizons.get(1)!.n,
      horizons: HORIZONS.map((h) => accToStat(h, horizons.get(h)!)),
    }));

  const alignedBuckets: BacktestBucket[] = [...byAligned.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([aligned, horizons]) => ({
      key: `${aligned} Faktoren`,
      signals: horizons.get(1)!.n,
      horizons: HORIZONS.map((h) => accToStat(h, horizons.get(h)!)),
    }));

  // Pairs nach 4W-Trefferquote sortieren (aussagekräftigster Horizont)
  const instrumentBuckets = bucketList(byInstrument).sort((a, b) => {
    const ha = a.horizons[3].hitRate ?? -1;
    const hb = b.horizons[3].hitRate ?? -1;
    return hb - ha;
  });

  return {
    signalsTotal: signals.length,
    weeksCovered: weeks.size,
    priceFrom,
    priceTo,
    overall: HORIZONS.map((h) => accToStat(h, overall.get(h)!)),
    byAligned: alignedBuckets,
    byCurrency: bucketList(byCurrency).sort((a, b) => (b.horizons[3].hitRate ?? -1) - (a.horizons[3].hitRate ?? -1)),
    byInstrument: instrumentBuckets,
    note:
      "Trefferquote = Anteil der Signale, deren Close nach N Wochen in Signalrichtung lag. " +
      "Ø Rendite gerichtet (LONG: +Kursanstieg, SHORT: +Kursrückgang). Ohne Spread/Kosten. " +
      "Backfill-Signale (< Jul 2026) nutzen 4 Faktoren (kein Retail-Sentiment).",
  };
}
