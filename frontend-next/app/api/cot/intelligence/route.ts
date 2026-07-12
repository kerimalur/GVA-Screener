import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCotIntelData } from "@/lib/data/cotIntel";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/cot/intelligence — Signale, Heatmap, Flips/Extremes. COT ist wöchentlich → 1h Cache. */
const getData = unstable_cache(
  async () => {
    try {
      return await getCotIntelData(createServiceClient());
    } catch {
      return null;
    }
  },
  ["cot-intelligence-v1"],
  { revalidate: 3600 },
);

export async function GET() {
  const data = await getData();
  if (!data) {
    return NextResponse.json({ error: "COT-Intelligence konnte nicht berechnet werden" }, { status: 500 });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=1800" } });
}
