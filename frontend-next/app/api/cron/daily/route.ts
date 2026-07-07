import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runJob, type JobResult } from "@/lib/jobs/util";
import { updatePrices } from "@/lib/jobs/updatePrices";
import { updateFred } from "@/lib/jobs/updateFred";
import { updateCalendar } from "@/lib/jobs/updateCalendar";
import { snapshotSentiment } from "@/lib/jobs/snapshotSentiment";
import { updateCot } from "@/lib/jobs/updateCot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TIME_BUDGET_MS = 250_000;

/** COT nur Sa/So/Mo (Release Fr ~20:30 UTC) oder wenn Daten > 8 Tage alt. */
async function cotDue(db: ReturnType<typeof createServiceClient>): Promise<boolean> {
  const day = new Date().getUTCDay(); // 0=So, 6=Sa
  if (day === 6 || day === 0 || day === 1) return true;
  const { data } = await db
    .from("cot_reports")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.report_date) return true;
  const ageDays = (Date.now() - new Date(data.report_date).getTime()) / 86_400_000;
  return ageDays > 8;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const started = Date.now();
  const results: JobResult[] = [];

  const tasks: Array<[string, () => Promise<Record<string, unknown>>]> = [
    ["cron:prices", () => updatePrices(db)],
    ["cron:fred", () => updateFred(db)],
    ["cron:calendar", () => updateCalendar(db)],
    ["cron:sentiment", () => snapshotSentiment(db)],
  ];
  if (await cotDue(db)) tasks.push(["cron:cot", () => updateCot(db)]);

  for (const [name, fn] of tasks) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      const deferred: JobResult = {
        job: name,
        status: "skipped",
        detail: { deferred: true, reason: "Zeitbudget erschöpft — nächster Lauf holt auf" },
      };
      results.push(deferred);
      await db.from("cron_runs").insert({
        job: name,
        status: "deferred",
        detail: deferred.detail,
      });
      continue;
    }
    results.push(await runJob(db, name, fn));
  }

  return NextResponse.json({
    ok: results.every((r) => r.status !== "error"),
    elapsedSec: Math.round((Date.now() - started) / 1000),
    results,
  });
}
