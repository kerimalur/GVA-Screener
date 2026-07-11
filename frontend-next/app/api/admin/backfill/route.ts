import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runJob } from "@/lib/jobs/util";
import { updatePrices } from "@/lib/jobs/updatePrices";
import { updateFred } from "@/lib/jobs/updateFred";
import { updateCalendar } from "@/lib/jobs/updateCalendar";
import { snapshotSentiment } from "@/lib/jobs/snapshotSentiment";
import { updateCot } from "@/lib/jobs/updateCot";
import { backfillOutlookSnapshots } from "@/lib/ml/outlookSnapshots";
import { INSTRUMENTS } from "@/lib/constants/instruments";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHUNK_SIZE = 5; // Instrumente pro Aufruf (prices)

/**
 * Manueller Backfill-Fallback für Umgebungen ohne lokalen Node:
 *   GET /api/admin/backfill?task=prices&chunk=0   (chunk 0..6 für 33 Instrumente)
 *   GET /api/admin/backfill?task=cot|fred|calendar|sentiment
 * Header: Authorization: Bearer <CRON_SECRET>. Idempotent.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const task = req.nextUrl.searchParams.get("task") ?? "";
  const chunk = parseInt(req.nextUrl.searchParams.get("chunk") ?? "0", 10);
  const db = createServiceClient();

  switch (task) {
    case "prices": {
      const slice = INSTRUMENTS.slice(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE).map(
        (i) => i.instrument,
      );
      if (slice.length === 0) {
        return NextResponse.json({ error: `chunk ${chunk} leer (0..${Math.ceil(INSTRUMENTS.length / CHUNK_SIZE) - 1})` }, { status: 400 });
      }
      const result = await runJob(db, `backfill:prices:${chunk}`, () =>
        updatePrices(db, { only: slice }),
      );
      return NextResponse.json(result);
    }
    case "cot":
      return NextResponse.json(await runJob(db, "backfill:cot", () => updateCot(db)));
    case "fred":
      return NextResponse.json(await runJob(db, "backfill:fred", () => updateFred(db)));
    case "calendar":
      return NextResponse.json(
        await runJob(db, "backfill:calendar", () => updateCalendar(db)),
      );
    case "sentiment":
      return NextResponse.json(
        await runJob(db, "backfill:sentiment", () => snapshotSentiment(db)),
      );
    case "outlooks": {
      const weeks = parseInt(req.nextUrl.searchParams.get("weeks") ?? "416", 10);
      return NextResponse.json(
        await runJob(db, "backfill:outlook-snapshots", () =>
          backfillOutlookSnapshots(db, Math.min(Math.max(weeks, 1), 520)),
        ),
      );
    }
    default:
      return NextResponse.json(
        { error: "task=prices|cot|fred|calendar|sentiment|outlooks nötig" },
        { status: 400 },
      );
  }
}
