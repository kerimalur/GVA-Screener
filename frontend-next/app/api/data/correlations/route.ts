import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { pagedSelect } from "@/lib/data/util";
import { alignCloses, correlationMatrix } from "@/lib/calc/correlations";

export const revalidate = 3600;

const WINDOWS = [20, 60, 200];

/**
 * Korrelationsmatrix aller Instrumente auf Log-Returns.
 * GET /api/data/correlations?window=60
 */
export async function GET(req: NextRequest) {
  const window = parseInt(req.nextUrl.searchParams.get("window") ?? "60", 10);
  if (!WINDOWS.includes(window)) {
    return NextResponse.json({ error: `window=${WINDOWS.join("|")}` }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    // genug Historie: window Handelstage + Puffer
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Math.round(window * 1.9) - 30);

    const rows = await pagedSelect<{ instrument: string; date: string; close: number }>(
      db,
      "price_daily",
      "instrument, date, close",
      (q) => q.gte("date", cutoff.toISOString().slice(0, 10)).order("instrument").order("date"),
    );

    const byInstrument = new Map<string, Array<{ date: string; close: number }>>();
    for (const r of rows) {
      const arr = byInstrument.get(r.instrument) ?? [];
      arr.push({ date: r.date, close: r.close });
      byInstrument.set(r.instrument, arr);
    }

    const aligned = alignCloses(byInstrument);
    const { keys, matrix } = correlationMatrix(aligned, window);

    return NextResponse.json({ window, keys, matrix });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
