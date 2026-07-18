import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { loadOutlookRows } from "@/lib/ml/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/ml/setup-finder — Rohdaten für den Setup-Finder (Outlook-Modus):
 * je Snapshot Faktor-Richtungen + Forward-Renditen. Der Client rechnet
 * Faktor-Auswahl/Schwellen live, deshalb hier nur einmal laden (~8 Jahre ×
 * 28 Pairs) und 30 min cachen.
 */
const getSetupFinderData = unstable_cache(
  async () => {
    try {
      return await loadOutlookRows(createServiceClient());
    } catch {
      return null;
    }
  },
  ["ml-setup-finder-v1"],
  { revalidate: 1800 },
);

export async function GET() {
  const data = await getSetupFinderData();
  if (!data) {
    return NextResponse.json(
      { error: "Setup-Finder-Daten konnten nicht geladen werden" },
      { status: 500 },
    );
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=900" },
  });
}
