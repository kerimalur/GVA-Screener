import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCotSeries, getPrices, getTffSeriesBatch } from "@/lib/data/cot";
import { getFredBatch } from "@/lib/data/dashboard";
import { CONTRACT_BY_CODE } from "@/lib/constants/cftcContracts";
import { seriesFor } from "@/lib/constants/fredSeries";
import { computeCotFlow } from "@/lib/calc/cotDelta";
import { conditionalOutcome, type ConditionalWeek } from "@/lib/calc/conditionalOutcome";

export const revalidate = 3600;

/**
 * Conditional-Outcome eines Währungs-Contracts:
 * COT-Flow (4W) × 10Y-Spread-Drehung (12W, ccy−USD) → historische Forward-Returns.
 * GET /api/data/cot/conditional?code=099741
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const contract = CONTRACT_BY_CODE.get(code);
  if (!contract) {
    return NextResponse.json({ error: `unbekannter Contract-Code '${code}'` }, { status: 400 });
  }
  if (!contract.ccy || contract.ccy === "USD" || !contract.priceInstrument) {
    return NextResponse.json(
      { error: "Conditional-Outcome nur für Währungs-Contracts mit Preis-Instrument (Zinsdifferenz vs. USD)" },
      { status: 400 },
    );
  }

  const ccyYieldId = seriesFor(contract.ccy, "yield_10y")?.id;
  const usdYieldId = seriesFor("USD", "yield_10y")?.id;
  if (!ccyYieldId || !usdYieldId) {
    return NextResponse.json({ error: `keine 10Y-Serie für ${contract.ccy}` }, { status: 400 });
  }

  try {
    const db = createServiceClient();

    const [tffMap, legacy, yields] = await Promise.all([
      getTffSeriesBatch(db, [code]),
      getCotSeries(db, code),
      getFredBatch(db, [ccyYieldId, usdYieldId]),
    ]);

    const tff = tffMap.get(code) ?? [];
    const source = tff.length > 0 ? "tff" : "legacy";
    const flowInput =
      tff.length > 0
        ? tff.map((p) => ({ date: p.date, net: p.levNet, openInterest: p.openInterest }))
        : legacy.map((p) => ({ date: p.date, net: p.net, openInterest: p.openInterest }));
    const flow = computeCotFlow(flowInput);

    // 10Y-Spread ccy−USD je COT-Woche + 12W-Drehung (~84 Tage)
    const ccySeries = yields.get(ccyYieldId) ?? [];
    const usdSeries = yields.get(usdYieldId) ?? [];
    function valueAtOrBefore(series: typeof ccySeries, date: string): number | null {
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i].date <= date) return series[i].value;
      }
      return null;
    }
    function spreadAt(date: string): number | null {
      const c = valueAtOrBefore(ccySeries, date);
      const u = valueAtOrBefore(usdSeries, date);
      return c !== null && u !== null ? c - u : null;
    }

    const weeks: ConditionalWeek[] = flow.map((p) => {
      const past = new Date(new Date(p.date).getTime() - 84 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const now = spreadAt(p.date);
      const before = spreadAt(past);
      return {
        date: p.date,
        flow4w: p.delta4wPctOi ?? p.delta4w,
        spreadChange: now !== null && before !== null ? now - before : null,
      };
    });

    const prices = await getPrices(db, contract.priceInstrument, weeks[0]?.date);
    const result = conditionalOutcome(weeks, prices, {
      invertPrice: contract.invertPrice,
      ccy: contract.ccy,
    });

    return NextResponse.json({
      contract: {
        code: contract.code,
        label: contract.label,
        ccy: contract.ccy,
        priceInstrument: contract.priceInstrument,
        invertPrice: contract.invertPrice,
      },
      source,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
