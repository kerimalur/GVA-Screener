import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { buildFactorMatrix } from "@/lib/ml/factorMatrix";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/ml/matrix — Faktor-Matrix fürs ML-Labor.
 * Rechenintensiv (~17J Rohdaten) → 1h Server-Cache; Client cached zusätzlich.
 */
const getMatrix = unstable_cache(
  async () => {
    try {
      return await buildFactorMatrix(createServiceClient());
    } catch {
      return null;
    }
  },
  ["ml-factor-matrix-v2"],
  { revalidate: 3600 },
);

export async function GET() {
  const matrix = await getMatrix();
  if (!matrix) {
    return NextResponse.json({ error: "Matrix konnte nicht berechnet werden" }, { status: 500 });
  }
  return NextResponse.json(matrix, {
    headers: { "Cache-Control": "private, max-age=1800" },
  });
}
