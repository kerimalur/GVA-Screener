import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "@/lib/data/util";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { mondayOf, pastMondays } from "./outlookSnapshots";

/**
 * Daten-Gesundheitscheck für die ML-Seite: Sind alle Quellen da, aktuell
 * und ist die Snapshot-Tabelle (Backtest-Basis) vollständig?
 */

export type HealthStatus = "ok" | "warn" | "fehlt";

export interface SourceHealth {
  key: string;
  label: string;
  rows: number;
  from: string | null;
  to: string | null;
  /** Alter des neuesten Datenpunkts in Tagen (aufgerundet) */
  ageDays: number | null;
  status: HealthStatus;
  note: string;
}

export interface WeekAggregate {
  week: string;
  count: number;
  signals: number;
  source: string;
}

export interface SnapshotHealth {
  totalRows: number;
  expectedWeeks: number;
  weeksCovered: number;
  missingWeeks: string[];
  /** Wochen mit weniger als 28 Pairs */
  incompleteWeeks: Array<{ week: string; count: number }>;
  backfillRows: number;
  liveRows: number;
  /** Anteil Wochen-Verdicts mit Richtung (Signal) */
  signalRatePct: number | null;
  avgFactorsBackfill: number | null;
  avgFactorsLive: number | null;
  currentWeekDone: boolean;
  currentWeek: string;
  weekly: WeekAggregate[];
}

export interface MlHealth {
  sources: SourceHealth[];
  snapshots: SnapshotHealth;
}

interface SourceDef {
  key: string;
  label: string;
  table: string;
  dateCol: string;
  /** max. Alter des neuesten Datenpunkts in Tagen, bevor "warn" */
  maxAgeDays: number;
  note: string;
}

const SOURCES: SourceDef[] = [
  { key: "prices", label: "Preise (Oanda, täglich)", table: "price_daily", dateCol: "date", maxAgeDays: 4, note: "Basis für Erfolgsmessung + Saisonalität + Stärke" },
  { key: "cot", label: "COT Legacy (Non-Commercials)", table: "cot_reports", dateCol: "report_date", maxAgeDays: 12, note: "Perzentil-Faktor; Report Di, veröffentlicht Fr" },
  { key: "tff", label: "COT TFF (Leveraged Funds)", table: "cot_tff_reports", dateCol: "report_date", maxAgeDays: 12, note: "Flow-Faktor (primäres COT-Signal)" },
  { key: "fred", label: "FRED (Zinsen, Renditen, Makro)", table: "fred_series", dateCol: "date", maxAgeDays: 10, note: "Zinsdifferenz- + Yield-Spread-Faktor" },
  { key: "sentiment", label: "Retail-Sentiment (Myfxbook)", table: "sentiment_snapshots", dateCol: "captured_at", maxAgeDays: 2, note: "Konträr-Faktor; Historie erst ab Jul 2026 → fehlt im Backfill" },
  { key: "calendar", label: "Wirtschaftskalender (ForexFactory)", table: "calendar_events", dateCol: "event_time", maxAgeDays: 3, note: "News-Flags; fließt nicht in Verdicts ein" },
];

async function checkSource(db: SupabaseClient, def: SourceDef): Promise<SourceHealth> {
  const [countRes, minRes, maxRes] = await Promise.all([
    db.from(def.table).select("*", { count: "exact", head: true }),
    db.from(def.table).select(def.dateCol).order(def.dateCol, { ascending: true }).limit(1).maybeSingle(),
    db.from(def.table).select(def.dateCol).order(def.dateCol, { ascending: false }).limit(1).maybeSingle(),
  ]);

  const rows = countRes.count ?? 0;
  const from = (minRes.data as Record<string, string> | null)?.[def.dateCol] ?? null;
  const to = (maxRes.data as Record<string, string> | null)?.[def.dateCol] ?? null;
  const ageDays = to !== null ? Math.ceil((Date.now() - new Date(to).getTime()) / 86_400_000) : null;

  let status: HealthStatus = "ok";
  if (rows === 0) status = "fehlt";
  // Kalender enthält Zukunfts-Events — dort zählt "reicht in die Zukunft" statt Alter
  else if (def.key === "calendar") status = ageDays !== null && ageDays <= 0 ? "ok" : "warn";
  else if (ageDays !== null && ageDays > def.maxAgeDays) status = "warn";

  return {
    key: def.key,
    label: def.label,
    rows,
    from: from ? from.slice(0, 10) : null,
    to: to ? to.slice(0, 10) : null,
    ageDays,
    status,
    note: def.note,
  };
}

async function checkSnapshots(db: SupabaseClient, expectedWeeks = 104): Promise<SnapshotHealth> {
  const rows = await pagedSelect<{
    week_start: string;
    direction: string | null;
    factor_count: number;
    source: string;
  }>(db, "weekly_outlook_snapshots", "week_start, direction, factor_count, source", (q) =>
    q.order("week_start"),
  );

  const currentWeek = mondayOf(new Date());
  const expected = pastMondays(expectedWeeks);

  const byWeek = new Map<string, { count: number; signals: number; sources: Set<string> }>();
  let backfillRows = 0;
  let liveRows = 0;
  let signals = 0;
  let factorSumBackfill = 0;
  let factorSumLive = 0;

  for (const r of rows) {
    const entry = byWeek.get(r.week_start) ?? { count: 0, signals: 0, sources: new Set<string>() };
    entry.count++;
    if (r.direction !== null) entry.signals++;
    entry.sources.add(r.source);
    byWeek.set(r.week_start, entry);

    if (r.source === "backfill") {
      backfillRows++;
      factorSumBackfill += r.factor_count;
    } else {
      liveRows++;
      factorSumLive += r.factor_count;
    }
    if (r.direction !== null) signals++;
  }

  const missingWeeks = expected.filter((w) => !byWeek.has(w));
  const incompleteWeeks = [...byWeek.entries()]
    .filter(([, v]) => v.count < FX_INSTRUMENTS.length)
    .map(([week, v]) => ({ week, count: v.count }));

  const weekly: WeekAggregate[] = [...byWeek.entries()].map(([week, v]) => ({
    week,
    count: v.count,
    signals: v.signals,
    source: [...v.sources].join("+"),
  }));

  return {
    totalRows: rows.length,
    expectedWeeks,
    weeksCovered: expected.filter((w) => byWeek.has(w)).length,
    missingWeeks,
    incompleteWeeks,
    backfillRows,
    liveRows,
    signalRatePct: rows.length ? (signals / rows.length) * 100 : null,
    avgFactorsBackfill: backfillRows ? factorSumBackfill / backfillRows : null,
    avgFactorsLive: liveRows ? factorSumLive / liveRows : null,
    currentWeekDone: byWeek.has(currentWeek),
    currentWeek,
    weekly,
  };
}

export async function loadMlHealth(db: SupabaseClient): Promise<MlHealth> {
  const [sources, snapshots] = await Promise.all([
    Promise.all(SOURCES.map((s) => checkSource(db, s))),
    checkSnapshots(db),
  ]);
  return { sources, snapshots };
}
