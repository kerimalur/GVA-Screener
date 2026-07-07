import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCotSeries, getPrices } from "@/lib/data/cot";
import { CONTRACT_BY_CODE } from "@/lib/constants/cftcContracts";

export const revalidate = 3600;

/**
 * COT-Historie + Perzentile + (optional) Preis-Overlay.
 * GET /api/data/cot?code=099741&window=260
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const window = parseInt(req.nextUrl.searchParams.get("window") ?? "260", 10);
  const contract = CONTRACT_BY_CODE.get(code);
  if (!contract) {
    return NextResponse.json({ error: `unbekannter Contract-Code '${code}'` }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const series = await getCotSeries(db, code, window);

    let prices: Array<{ date: string; close: number }> = [];
    if (contract.priceInstrument && series.length > 0) {
      prices = await getPrices(db, contract.priceInstrument, series[0].date);
    }

    return NextResponse.json({
      contract: { code: contract.code, label: contract.label, priceInstrument: contract.priceInstrument },
      series,
      prices,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
