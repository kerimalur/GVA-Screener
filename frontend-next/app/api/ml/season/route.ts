import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { buildSeason2Matrix } from "@/lib/ml/seasonality2";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/ml/season — Saisonalität 2.0 Matrix.
 * Rechenintensiv (~17J Preisdaten + Rolling-Saison) → 1h Server-Cache.
 */
const getSeasonMatrix = unstable_cache(
  async () => {
    try {
      return await buildSeason2Matrix(createServiceClient());
    } catch {
      return null;
    }
  },
  ["ml-season2-matrix-v1"],
  { revalidate: 3600 },
);

export async function GET() {
  const matrix = await getSeasonMatrix();
  if (!matrix) {
    return NextResponse.json(
      { error: "Season-Matrix konnte nicht berechnet werden" },
      { status: 500 },
    );
  }
  return NextResponse.json(matrix, {
    headers: { "Cache-Control": "private, max-age=1800" },
  });
}
