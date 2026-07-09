import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const JOBS = [
  { key: "cron:prices",    label: "Preise (OANDA)",              freq: "taeglich",      table: "price_daily",        dateCol: "date" },
  { key: "cron:fred",      label: "Makro-Daten (FRED)",          freq: "taeglich",      table: "fred_series",        dateCol: "date" },
  { key: "cron:calendar",  label: "Wirtschaftskalender",         freq: "taeglich",      table: "calendar_events",    dateCol: "event_time" },
  { key: "cron:sentiment", label: "Retail Sentiment (Myfxbook)", freq: "taeglich",      table: "sentiment_snapshots",dateCol: "captured_at" },
  { key: "cron:cot",       label: "COT-Report (CFTC)",           freq: "woechentlich",  table: "cot_reports",        dateCol: "report_date" },
];

export async function GET() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const results = await Promise.all(
    JOBS.map(async ({ key, label, freq, table, dateCol }) => {
      // Last cron run
      const { data: run, error: runErr } = await db
        .from("cron_runs")
        .select("status, ran_at, detail")
        .eq("job", key)
        .order("ran_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (runErr) {
        console.error(`[data/status] cron_runs error for ${key}:`, runErr);
      }

      // Earliest available data date
      let since: string | null = null;
      const { data: oldest, error: sinceErr } = await db
        .from(table)
        .select(dateCol)
        .order(dateCol, { ascending: true })
        .limit(1)
        .maybeSingle();

      if (sinceErr) {
        console.error(`[data/status] oldest-date error for ${key} (${table}):`, sinceErr);
      } else if (oldest) {
        since = (oldest as Record<string, unknown>)[dateCol] as string ?? null;
      }

      return {
        key,
        label,
        freq,
        status:  run?.status  ?? null,
        lastRun: run?.ran_at  ?? null,
        since,
        detail:  run?.detail  ?? null,
        _runErr: runErr?.message ?? null,
      };
    }),
  );

  // Naechster Cron-Lauf: taeglich 05:30 UTC
  const now = new Date();
  const nextRun = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (now.getUTCHours() >= 5 && now.getUTCMinutes() >= 30 ? 1 : 0),
    5, 30, 0,
  ));

  return NextResponse.json({ jobs: results, nextRun: nextRun.toISOString() });
}
