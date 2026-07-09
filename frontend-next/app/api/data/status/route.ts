import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const JOBS = [
  { key: "cron:prices",   label: "Preise (OANDA)",              freq: "täglich" },
  { key: "cron:fred",     label: "Makro-Daten (FRED)",          freq: "täglich" },
  { key: "cron:calendar", label: "Wirtschaftskalender",         freq: "täglich" },
  { key: "cron:sentiment",label: "Retail Sentiment (Myfxbook)", freq: "täglich" },
  { key: "cron:cot",      label: "COT-Report (CFTC)",           freq: "wöchentlich" },
];

export async function GET() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const results = await Promise.all(
    JOBS.map(async ({ key, label, freq }) => {
      const { data } = await db
        .from("cron_runs")
        .select("status, created_at, detail")
        .eq("job", key)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        key,
        label,
        freq,
        status:     data?.status ?? null,
        lastRun:    data?.created_at ?? null,
        detail:     data?.detail ?? null,
      };
    }),
  );

  // Nächster Cron-Lauf: täglich 05:30 UTC
  const now = new Date();
  const nextRun = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (now.getUTCHours() >= 5 && now.getUTCMinutes() >= 30 ? 1 : 0),
    5, 30, 0,
  ));

  return NextResponse.json({ jobs: results, nextRun: nextRun.toISOString() });
}
