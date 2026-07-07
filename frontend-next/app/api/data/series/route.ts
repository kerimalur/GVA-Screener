import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveSeries, type SeriesType } from "@/lib/data/series";

export const revalidate = 3600;

const TYPES: SeriesType[] = ["price", "fred", "cot_net", "sentiment", "spread_10y", "rate_diff"];

/**
 * Generische Zeitreihe.
 * GET /api/data/series?type=price&key=EUR_USD&from=2020-01-01
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const type = params.get("type") as SeriesType | null;
  const key = params.get("key") ?? "";
  const from = params.get("from") ?? undefined;

  if (!type || !TYPES.includes(type) || !key) {
    return NextResponse.json(
      { error: `type=${TYPES.join("|")} und key nötig` },
      { status: 400 },
    );
  }

  try {
    const db = createServiceClient();
    const series = await resolveSeries(db, type, key, from);
    return NextResponse.json(series);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
