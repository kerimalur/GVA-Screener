import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runJob, type JobResult } from "@/lib/jobs/util";
import { updateFred } from "@/lib/jobs/updateFred";
import { updateBis } from "@/lib/jobs/updateBis";
import { updateYields } from "@/lib/jobs/updateYields";
import { updateCalendar } from "@/lib/jobs/updateCalendar";
import { snapshotSentiment } from "@/lib/jobs/snapshotSentiment";
import { updateCot } from "@/lib/jobs/updateCot";
import { snapshotCurrentWeek, ensureOutlookBackfill } from "@/lib/ml/outlookSnapshots";

export const dynamic = "force-dynamic";
// 300s: erster Lauf rechnet ggf. den 104-Wochen-Outlook-Backfill mit
export const maxDuration = 300;

async function cotDue(db: ReturnType<typeof createServiceClient>): Promise<boolean> {
  const day = new Date().getUTCDay();
  if (day === 6 || day === 0 || day === 1) return true;
  const { data } = await db
    .from("cot_reports")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.report_date) return true;
  return (Date.now() - new Date(data.report_date).getTime()) / 86_400_000 > 8;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const started = Date.now();

  const jobDefs: Array<[string, () => Promise<Record<string, unknown>>]> = [
    ["cron:fred",      () => updateFred(db)],
    ["cron:bis",       () => updateBis(db)],
    ["cron:yields",    () => updateYields(db)],
    ["cron:calendar",  () => updateCalendar(db)],
    ["cron:sentiment", () => snapshotSentiment(db)],
  ];
  if (await cotDue(db)) jobDefs.push(["cron:cot", () => updateCot(db)]);

  const results: JobResult[] = await Promise.all(
    jobDefs.map(([name, fn]) => runJob(db, name, fn)),
  );

  // NACH den Daten-Updates: fehlende Snapshot-Historie nachrechnen (skipped wenn
  // vollständig), dann Wochen-Verdict einfrieren (erster Lauf der Woche schreibt)
  results.push(await runJob(db, "cron:outlook-backfill", () => ensureOutlookBackfill(db)));
  results.push(await runJob(db, "cron:outlook-snapshot", () => snapshotCurrentWeek(db)));

  return NextResponse.json({
    ok: results.every((r) => r.status !== "error"),
    elapsedSec: Math.round((Date.now() - started) / 1000),
    results,
  });
}
