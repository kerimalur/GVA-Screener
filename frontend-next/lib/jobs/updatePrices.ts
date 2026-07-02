import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCandles } from "@/lib/sources/oanda";
import { INSTRUMENTS } from "@/lib/constants/instruments";
import { chunkUpsert } from "./util";

/**
 * Inkrementell: je Instrument ab letztem gespeicherten Datum (bzw. 5000 Kerzen
 * beim ersten Lauf). `only` erlaubt Teilmengen (Backfill-Chunks).
 */
export async function updatePrices(
  db: SupabaseClient,
  opts: { only?: string[] } = {},
): Promise<Record<string, unknown>> {
  const instruments = INSTRUMENTS.filter(
    (i) => !opts.only || opts.only.includes(i.instrument),
  );

  let totalRows = 0;
  const errors: string[] = [];

  for (const inst of instruments) {
    try {
      const { data: last } = await db
        .from("price_daily")
        .select("date")
        .eq("instrument", inst.instrument)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const candles = await fetchCandles(
        inst.instrument,
        last?.date ? { from: last.date } : { count: 5000 },
      );

      const rows = candles.map((c) => ({ instrument: inst.instrument, ...c }));
      totalRows += await chunkUpsert(db, "price_daily", rows, "instrument,date");
    } catch (e) {
      errors.push(`${inst.instrument}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (errors.length === instruments.length) {
    throw new Error(`alle Instrumente fehlgeschlagen: ${errors[0]}`);
  }
  return { instruments: instruments.length, rows: totalRows, errors };
}
