import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getMacroTerminalData } from "@/lib/data/macroTerminal";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/makro/terminal — G8-Fundamental-Scores fürs Macro Terminal.
 * FRED-Serien werden wöchentlich aktualisiert → 1h Server-Cache.
 */
const getData = unstable_cache(
  async () => {
    try {
      return await getMacroTerminalData(createServiceClient());
    } catch {
      return null;
    }
  },
  ["macro-terminal-v1"],
  { revalidate: 3600 },
);

export async function GET() {
  const data = await getData();
  if (!data) {
    return NextResponse.json({ error: "Macro-Terminal konnte nicht berechnet werden" }, { status: 500 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=1800" },
  });
}
