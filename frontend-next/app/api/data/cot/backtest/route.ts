import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCotSeries, getPrices } from "@/lib/data/cot";
import { CONTRACT_BY_CODE } from "@/lib/constants/cftcContracts";
import { cotBacktest } from "@/lib/calc/cotBacktest";

export const revalidate = 3600;

/**
 * COT-Extrem-Backtest.
 * GET /api/data/cot/backtest?code=099741&pct=10&direction=top&window=260
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code") ?? "";
  const pct = parseFloat(params.get("pct") ?? "10");
  const direction = params.get("direction") === "bottom" ? "bottom" : "top";
  const window = parseInt(params.get("window") ?? "260", 10);

  const contract = CONTRACT_BY_CODE.get(code);
  if (!contract) {
    return NextResponse.json({ error: `unbekannter Contract-Code '${code}'` }, { status: 400 });
  }
  if (!contract.priceInstrument) {
    return NextResponse.json(
      { error: `${contract.label}: kein Preis-Instrument für Backtest (USDX)` },
      { status: 400 },
    );
  }

  try {
    const db = createServiceClient();
    const series = await getCotSeries(db, code, window);
    const prices = await getPrices(db, contract.priceInstrument, series[0]?.date);

    const result = cotBacktest(
      series.map((s) => ({ date: s.date, net: s.net })),
      prices,
      { thresholdPct: pct, direction, windowWeeks: window, invertPrice: contract.invertPrice },
    );

    return NextResponse.json({
      contract: {
        code: contract.code,
        label: contract.label,
        priceInstrument: contract.priceInstrument,
        invertPrice: contract.invertPrice,
      },
      params: { pct, direction, window },
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
