import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TABLES = [
  "instruments",
  "price_daily",
  "cot_reports",
  "fred_series",
  "fred_series_meta",
  "sentiment_snapshots",
  "calendar_events",
  "cb_meetings",
  "cb_stance",
  "cron_runs",
] as const;

export async function GET() {
  try {
    const db = createServiceClient();
    const counts: Record<string, number | string> = {};

    for (const table of TABLES) {
      const { count, error } = await db
        .from(table)
        .select("*", { count: "exact", head: true });
      counts[table] = error ? `error: ${error.message}` : (count ?? 0);
    }

    const { data: lastRuns } = await db
      .from("cron_runs")
      .select("job, ran_at, status")
      .order("ran_at", { ascending: false })
      .limit(10);

    return NextResponse.json({ ok: true, counts, lastRuns: lastRuns ?? [] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
