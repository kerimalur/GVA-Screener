import type { SupabaseClient } from "@supabase/supabase-js";
import { getFredSeries, getStaleFlags } from "./fred";
import { seriesFor } from "@/lib/constants/fredSeries";
import { G8_CURRENCIES } from "@/lib/constants/instruments";
import { yoyFromIndex, type SeriesPoint } from "@/lib/calc/seriesMath";
import { scoreCurrency, type MacroScore, type MacroInput } from "@/lib/calc/macroScore";

export interface MacroTerminalData {
  scores: MacroScore[];
  /** series_id → is_stale (⚠️-Badges) */
  staleFlags: Array<[string, boolean]>;
  generatedAt: string;
}

/** 8 Jahre reichen für YoY (12/4 Lags) + 3J-BCI-Perzentil + 6M-Rate-Trend. */
function since8y(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 8);
  return d.toISOString().slice(0, 10);
}

async function seriesForCcy(
  db: SupabaseClient,
  ccy: string,
  category: Parameters<typeof seriesFor>[1],
  since: string,
): Promise<SeriesPoint[]> {
  const def = seriesFor(ccy, category);
  if (!def) return [];
  return getFredSeries(db, def.id, since);
}

async function buildInput(db: SupabaseClient, ccy: string, since: string): Promise<MacroInput> {
  const [cli, bci, cpiIndex, policy, yield10, unemployment, sentiment, retail, balanceSheet] =
    await Promise.all([
      seriesForCcy(db, ccy, "cli", since),
      seriesForCcy(db, ccy, "business_confidence", since),
      seriesForCcy(db, ccy, "cpi", since),
      seriesForCcy(db, ccy, "policy_rate", since),
      seriesForCcy(db, ccy, "yield_10y", since),
      seriesForCcy(db, ccy, "unemployment", since),
      seriesForCcy(db, ccy, "sentiment", since),
      seriesForCcy(db, ccy, "retail_sales", since),
      seriesForCcy(db, ccy, "balance_sheet", since),
    ]);

  // CPI-Index → YoY % (Quartalsserien: 4 Lags, sonst 12)
  const cpiDef = seriesFor(ccy, "cpi");
  const quarterly = cpiDef ? cpiDef.id.includes("Q") : false;
  const cpiYoY = cpiIndex.length > 0 ? yoyFromIndex(cpiIndex, quarterly ? 4 : 12) : [];

  return { ccy, cli, bci, cpiYoY, policy, yield10, unemployment, sentiment, retail, balanceSheet };
}

export async function getMacroTerminalData(db: SupabaseClient): Promise<MacroTerminalData> {
  const since = since8y();
  const [staleFlags, vixSeries, curveSeries, inputs] = await Promise.all([
    getStaleFlags(db),
    getFredSeries(db, "VIXCLS", since),
    getFredSeries(db, "T10Y2Y", since),
    Promise.all(G8_CURRENCIES.map((ccy) => buildInput(db, ccy, since))),
  ]);

  const globals = {
    vix: vixSeries[vixSeries.length - 1]?.value ?? null,
    t10y2y: curveSeries[curveSeries.length - 1]?.value ?? null,
  };

  const scores = inputs.map((inp) => scoreCurrency(inp, globals));

  return {
    scores,
    staleFlags: [...staleFlags.entries()],
    generatedAt: new Date().toISOString(),
  };
}
