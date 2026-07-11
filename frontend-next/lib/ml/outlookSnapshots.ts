import type { SupabaseClient } from "@supabase/supabase-js";
import { getCotSeriesBatch, getTffSeriesBatch, type CotSeriesPoint } from "@/lib/data/cot";
import { getFredBatch } from "@/lib/data/dashboard";
import { getSeasonalityStats } from "@/lib/data/seasonality";
import { computeCotFlow, type CotFlowPoint, type CotFlowSummary } from "@/lib/calc/cotDelta";
import { evaluatePair, type ScreenerInputs } from "@/lib/calc/screenerReasoning";
import type { SeriesPoint } from "@/lib/calc/seriesMath";
import { G8_CURRENCIES, FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { CONTRACT_BY_CCY } from "@/lib/constants/cftcContracts";
import { seriesFor } from "@/lib/constants/fredSeries";
import { chunkUpsert } from "@/lib/jobs/util";

/**
 * Wöchentliche Outlook-Snapshots (Tabelle weekly_outlook_snapshots).
 *
 * Zwei Wege in die Tabelle:
 * - snapshotCurrentWeek: Cron schreibt beim ersten Lauf der Woche den
 *   Live-Verdict (inkl. Sentiment-Faktor) — friert den Sonntags-/Montags-Stand ein.
 * - backfillOutlookSnapshots: rekonstruiert vergangene Wochen aus COT- und
 *   FRED-Historie. Sentiment existiert historisch nicht (Snapshots erst ab
 *   Juli 2026) → Backfill-Verdicts haben max. 4 Faktoren; im Backtest über
 *   factor_count/source unterscheidbar.
 *
 * Bekannte, bewusste Unschärfe im Backfill:
 * - Saisonalität kommt aus der seasonality_stats-View über die GESAMTE
 *   Preishistorie (leichtes Lookahead; der Monats-Durchschnitt über 15+ Jahre
 *   ändert sich durch 2 zusätzliche Jahre kaum).
 * - Monatliche FRED-Serien haben Publikations-Lag; "letzter Wert ≤ Stichtag"
 *   kann live 2–6 Wochen später verfügbar gewesen sein.
 * COT ist Lookahead-frei: Report (Dienstag) erscheint Freitag, der nächste
 * Montag sieht ihn auch live.
 */

export interface OutlookSnapshotRow extends Record<string, unknown> {
  week_start: string;
  instrument: string;
  direction: "LONG" | "SHORT" | null;
  aligned_count: number;
  factor_count: number;
  factors: Array<{ name: string; dir: -1 | 0 | 1; text: string }>;
  source: "live" | "backfill";
}

/** Montag (UTC) der Woche, in der `d` liegt, als YYYY-MM-DD. */
export function mondayOf(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay(); // 0 = So
  utc.setUTCDate(utc.getUTCDate() - ((day + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

/** Die letzten `n` abgeschlossenen Wochen-Montage (ohne die aktuelle Woche), aufsteigend. */
export function pastMondays(n: number, now = new Date()): string[] {
  const current = new Date(mondayOf(now) + "T00:00:00Z");
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(current.getTime() - i * 7 * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function lastAtOrBefore<T extends { date: string }>(points: T[], asOf: string): T | null {
  let last: T | null = null;
  for (const p of points) {
    if (p.date <= asOf) last = p;
    else break;
  }
  return last;
}

/** CotFlowSummary zum Stichtag (Pendant zu latestFlow, aber as-of). */
function flowAt(points: CotFlowPoint[], asOf: string): CotFlowSummary | null {
  const p = lastAtOrBefore(points, asOf);
  if (!p) return null;
  return {
    date: p.date,
    delta1wPctOi: p.delta1wPctOi,
    delta4wPctOi: p.delta4wPctOi,
    deltaPercentile: p.deltaPercentile,
    streakWeeks: p.streakWeeks,
    direction: p.delta1w === null || p.delta1w === 0 ? 0 : p.delta1w > 0 ? 1 : -1,
  };
}

interface SnapshotComputeData {
  cotByCcy: Map<string, CotSeriesPoint[]>;
  flowPointsByCcy: Map<string, CotFlowPoint[]>;
  policyByCcy: Map<string, SeriesPoint[]>;
  yield10ByCcy: Map<string, SeriesPoint[]>;
  seasonalityByInstrument: Awaited<ReturnType<typeof getSeasonalityStats>>;
}

/** Lädt alle Serien einmal — Wochen-Iteration passiert danach rein im Speicher. */
async function loadComputeData(db: SupabaseClient, sinceIso: string): Promise<SnapshotComputeData> {
  const cotCodes = G8_CURRENCIES.map((c) => CONTRACT_BY_CCY.get(c)?.code).filter(
    (x): x is string => Boolean(x),
  );
  const policyIds = G8_CURRENCIES.map((c) => seriesFor(c, "policy_rate")?.id).filter(
    (x): x is string => Boolean(x),
  );
  const yieldIds = G8_CURRENCIES.map((c) => seriesFor(c, "yield_10y")?.id).filter(
    (x): x is string => Boolean(x),
  );

  // COT/TFF komplett laden: Rolling-Perzentil (260W) braucht die volle Historie,
  // und rollingPercentile endet je Index am Index — as-of-sicher.
  const [cotByCode, tffByCode, fredSeries, seasonalityByInstrument] = await Promise.all([
    getCotSeriesBatch(db, cotCodes),
    getTffSeriesBatch(db, cotCodes),
    getFredBatch(db, [...policyIds, ...yieldIds], sinceIso),
    getSeasonalityStats(db),
  ]);

  const cotByCcy = new Map<string, CotSeriesPoint[]>();
  const flowPointsByCcy = new Map<string, CotFlowPoint[]>();
  for (const ccy of G8_CURRENCIES) {
    const contract = CONTRACT_BY_CCY.get(ccy);
    if (!contract) continue;
    const legacy = cotByCode.get(contract.code) ?? [];
    cotByCcy.set(ccy, legacy);

    // Flow wie im Dashboard: TFF Leveraged Funds, Fallback Legacy NonComm
    const tff = tffByCode.get(contract.code);
    const flowInput = tff?.length
      ? tff.map((p) => ({ date: p.date, net: p.levNet, openInterest: p.openInterest }))
      : legacy.map((p) => ({ date: p.date, net: p.net, openInterest: p.openInterest }));
    flowPointsByCcy.set(ccy, computeCotFlow(flowInput));
  }

  const policyByCcy = new Map<string, SeriesPoint[]>();
  const yield10ByCcy = new Map<string, SeriesPoint[]>();
  for (const ccy of G8_CURRENCIES) {
    const pid = seriesFor(ccy, "policy_rate")?.id;
    const yid = seriesFor(ccy, "yield_10y")?.id;
    if (pid) policyByCcy.set(ccy, fredSeries.get(pid) ?? []);
    if (yid) yield10ByCcy.set(ccy, fredSeries.get(yid) ?? []);
  }

  return { cotByCcy, flowPointsByCcy, policyByCcy, yield10ByCcy, seasonalityByInstrument };
}

/** Verdicts aller FX-Pairs zum Stichtag `weekStart` (Serien auf ≤ Stichtag beschnitten). */
function computeWeek(
  data: SnapshotComputeData,
  weekStart: string,
  sentimentByPair: Map<string, number>,
  source: "live" | "backfill",
): OutlookSnapshotRow[] {
  const cotPercentileByCcy = new Map<string, number>();
  const cotFlowByCcy = new Map<string, CotFlowSummary>();
  const policyByCcy = new Map<string, SeriesPoint[]>();
  const yield10ByCcy = new Map<string, SeriesPoint[]>();

  for (const ccy of G8_CURRENCIES) {
    const cotPoint = lastAtOrBefore(data.cotByCcy.get(ccy) ?? [], weekStart);
    if (cotPoint?.percentile !== null && cotPoint?.percentile !== undefined) {
      cotPercentileByCcy.set(ccy, cotPoint.percentile);
    }
    const flow = flowAt(data.flowPointsByCcy.get(ccy) ?? [], weekStart);
    if (flow) cotFlowByCcy.set(ccy, flow);

    policyByCcy.set(ccy, (data.policyByCcy.get(ccy) ?? []).filter((p) => p.date <= weekStart));
    yield10ByCcy.set(ccy, (data.yield10ByCcy.get(ccy) ?? []).filter((p) => p.date <= weekStart));
  }

  const inputs: ScreenerInputs = {
    cotPercentileByCcy,
    cotFlowByCcy,
    policyByCcy,
    yield10ByCcy,
    seasonalityByInstrument: data.seasonalityByInstrument,
    sentimentByPair,
    currentMonth: Number(weekStart.slice(5, 7)),
  };

  return FX_INSTRUMENTS.map((inst) => {
    const v = evaluatePair(inst, inputs);
    return {
      week_start: weekStart,
      instrument: inst.instrument,
      direction: v.direction,
      aligned_count: v.alignedCount,
      factor_count: v.factors.length,
      factors: v.factors,
      source,
    };
  });
}

/**
 * Historischer Backfill über `weeks` abgeschlossene Wochen (Default 104 ≈ 2 Jahre).
 * Ohne Sentiment (historisch nicht vorhanden). Upsert — überschreibt nur
 * Backfill-Wochen, die aktuelle (Live-)Woche ist nie Teil des Zeitraums.
 */
export async function backfillOutlookSnapshots(
  db: SupabaseClient,
  weeks = 104,
): Promise<Record<string, unknown>> {
  const weekStarts = pastMondays(weeks);
  const since = new Date(new Date(weekStarts[0] + "T00:00:00Z").getTime() - 400 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const data = await loadComputeData(db, since);
  const rows = weekStarts.flatMap((w) => computeWeek(data, w, new Map(), "backfill"));
  const written = await chunkUpsert(db, "weekly_outlook_snapshots", rows, "week_start,instrument");

  const signals = rows.filter((r) => r.direction !== null).length;
  return { weeks: weekStarts.length, rows: written, signals, from: weekStarts[0], to: weekStarts[weekStarts.length - 1] };
}

/**
 * Cron-Job: friert den Verdict der AKTUELLEN Woche ein (inkl. Sentiment).
 * Insert-only — der erste Lauf der Woche gewinnt, spätere Läufe ändern nichts.
 * So misst der Backtest das Signal, wie es am Wochenstart wirklich aussah.
 */
export async function snapshotCurrentWeek(db: SupabaseClient): Promise<Record<string, unknown>> {
  const week = mondayOf(new Date());

  const { count } = await db
    .from("weekly_outlook_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("week_start", week);
  if ((count ?? 0) >= FX_INSTRUMENTS.length) {
    return { skipped: true, reason: "Woche bereits erfasst", week };
  }

  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const [data, sentRes] = await Promise.all([
    loadComputeData(db, since),
    db
      .from("sentiment_snapshots")
      .select("pair, captured_at, long_pct")
      .order("captured_at", { ascending: false })
      .limit(60),
  ]);

  const sentimentByPair = new Map<string, number>();
  for (const r of sentRes.data ?? []) {
    if (!sentimentByPair.has(r.pair) && r.long_pct !== null) sentimentByPair.set(r.pair, r.long_pct);
  }

  const rows = computeWeek(data, week, sentimentByPair, "live");
  const { error } = await db
    .from("weekly_outlook_snapshots")
    .upsert(rows, { onConflict: "week_start,instrument", ignoreDuplicates: true });
  if (error) throw new Error(`weekly_outlook_snapshots: ${error.message}`);

  return { week, rows: rows.length, signals: rows.filter((r) => r.direction !== null).length };
}
