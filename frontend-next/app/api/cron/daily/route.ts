import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runJob, type JobResult } from "@/lib/jobs/util";
import { updatePrices } from "@/lib/jobs/updatePrices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const started = Date.now();

  const results: JobResult[] = [
    await runJob(db, "cron:prices", () => updatePrices(db)),
  ];

  return NextResponse.json({
    ok: results.every((r) => r.status !== "error"),
    elapsedSec: Math.round((Date.now() - started) / 1000),
    results,
  });
}
