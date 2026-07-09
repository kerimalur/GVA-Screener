import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const JOBS = [
  { key: "cron:prices",    label: "Preise (OANDA)",              freq: "taeglich",      table: "price_daily",         dateCol: "date" },
  { key: "cron:fred",      label: "Makro-Daten (FRED)",          freq: "taeglich",      table: "fred_series",         dateCol: "date" },
  { key: "cron:calendar",  label: "Wirtschaftskalender",         freq: "taeglich",      table: "calendar_events",     dateCol: "event_time" },
  { key: "cron:sentiment", label: "Retail Sentiment (Myfxbook)", freq: "taeglich",      table: "sentiment_snapshots", dateCol: "captured_at" },
  { key: "cron:cot",       label: "COT-Report (CFTC)",           freq: "woechentlich",  table: "cot_reports",         dateCol: "report_date" },
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
        console.error(`[data/status] since error for ${key}:`, sinceErr);
      } else if (oldest) {
        const raw = ((oldest as unknown) as Record<string, unknown>)[dateCol];
        if (typeof raw === "string") since = raw.slice(0, 10);
      }

      return {
        key,
        label,
        freq,
        status: run?.status ?? null,
        lastRun: run?.ran_at ?? null,
        since,
        detail: run?.detail ?? null,
      };
    }),
  );

  return NextResponse.json(results);
}
