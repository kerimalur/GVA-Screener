import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCotSeries, getPrices, getTffSeriesBatch } from "@/lib/data/cot";
import { CONTRACT_BY_CODE } from "@/lib/constants/cftcContracts";
import { cotBacktest, type CotPoint } from "@/lib/calc/cotBacktest";

export const revalidate = 3600;

/**
 * COT-Backtest (Niveau- oder Δ-Extrem, Legacy- oder TFF-Quelle).
 * GET /api/data/cot/backtest?code=099741&pct=10&direction=top&mode=delta&source=tff&window=260
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code") ?? "";
  const pct = parseFloat(params.get("pct") ?? "10");
  const direction = params.get("direction") === "bottom" ? "bottom" : "top";
  const mode = params.get("mode") === "delta" ? "delta" : "level";
  const requestedSource = params.get("source") === "tff" ? "tff" : "legacy";
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

    // TFF nur wenn angefragt, Contract enthalten und Daten vorhanden — sonst Legacy
    let source: "tff" | "legacy" = "legacy";
    let series: CotPoint[] = [];
    if (requestedSource === "tff" && contract.inTff) {
      const tff = (await getTffSeriesBatch(db, [code], window)).get(code) ?? [];
      if (tff.length > 0) {
        source = "tff";
        series = tff.map((s) => ({ date: s.date, net: s.levNet }));
      }
    }
    if (series.length === 0) {
      const legacy = await getCotSeries(db, code, window);
      series = legacy.map((s) => ({ date: s.date, net: s.net }));
    }

    const prices = await getPrices(db, contract.priceInstrument, series[0]?.date);

    const result = cotBacktest(series, prices, {
      thresholdPct: pct,
      direction,
      mode,
      windowWeeks: window,
      invertPrice: contract.invertPrice,
    });

    return NextResponse.json({
      contract: {
        code: contract.code,
        label: contract.label,
        priceInstrument: contract.priceInstrument,
        invertPrice: contract.invertPrice,
      },
      params: { pct, direction, mode, source, window },
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
