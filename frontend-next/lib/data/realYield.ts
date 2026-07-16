import type { SupabaseClient } from "@supabase/supabase-js";
import { pagedSelect } from "./util";
import { getFredBatch } from "./dashboard";
import { buildCcyRealYield, rankRealYield, type CcyRealYield } from "@/lib/calc/realYield";
import { currencyStrength } from "@/lib/calc/strength";
import { riskGauge, type RiskGaugeResult } from "@/lib/calc/riskGauge";
import { bisCpiId, bisPolicyId } from "@/lib/jobs/updateBis";
import { G8_CURRENCIES } from "@/lib/constants/instruments";

export interface RealYieldData {
  /** stark → schwach sortiert */
  currencies: CcyRealYield[];
  risk: RiskGaugeResult;
  vixDate: string | null;
}

/**
 * Datenquellen: BIS-Serien in fred_series (BIS_CBPOL_* Leitzins monatlich,
 * BIS_CPI_YOY_* Inflation YoY — siehe lib/jobs/updateBis.ts), price_daily +
 * VIXCLS für das Risk-Regime (bestehender riskGauge, wie im Dashboard).
 */
export async function loadRealYieldData(db: SupabaseClient): Promise<RealYieldData> {
  const bisCutoff = new Date();
  bisCutoff.setFullYear(bisCutoff.getFullYear() - 4);
  const priceCutoff = new Date();
  priceCutoff.setMonth(priceCutoff.getMonth() - 10);
  const vixCutoff = new Date();
  vixCutoff.setFullYear(vixCutoff.getFullYear() - 5);

  const bisIds = G8_CURRENCIES.flatMap((c) => [bisPolicyId(c), bisCpiId(c)]);

  const [bisSeries, vixSeries, priceRows] = await Promise.all([
    getFredBatch(db, bisIds, bisCutoff.toISOString().slice(0, 10)),
    getFredBatch(db, ["VIXCLS"], vixCutoff.toISOString().slice(0, 10)),
    pagedSelect<{ instrument: string; date: string; close: number }>(
      db,
      "price_daily",
      "instrument, date, close",
      (q) =>
        q.gte("date", priceCutoff.toISOString().slice(0, 10)).order("instrument").order("date"),
    ),
  ]);

  const currencies = rankRealYield(
    G8_CURRENCIES.map((ccy) =>
      buildCcyRealYield(ccy, bisSeries.get(bisPolicyId(ccy)) ?? [], bisSeries.get(bisCpiId(ccy)) ?? []),
    ),
  );

  const closesByInstrument = new Map<string, number[]>();
  for (const r of priceRows) {
    const arr = closesByInstrument.get(r.instrument) ?? [];
    arr.push(r.close);
    closesByInstrument.set(r.instrument, arr);
  }
  const strength = currencyStrength(closesByInstrument);
  const vix = vixSeries.get("VIXCLS") ?? [];

  const risk = riskGauge({
    vix: vix.map((p) => p.value),
    goldCloses: closesByInstrument.get("XAU_USD") ?? [],
    jpyStrength1M: strength.scores["1M"]["JPY"] ?? 0,
    chfStrength1M: strength.scores["1M"]["CHF"] ?? 0,
    spxCloses: closesByInstrument.get("SPX500_USD") ?? [],
  });

  return { currencies, risk, vixDate: vix[vix.length - 1]?.date ?? null };
}
