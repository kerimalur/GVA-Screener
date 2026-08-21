import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCot, fetchCotTff } from "@/lib/sources/cftc";
import { CFTC_CONTRACTS, TFF_CONTRACTS } from "@/lib/constants/cftcContracts";
import { chunkUpsert } from "./util";

async function lastReportDate(
  db: SupabaseClient,
  table: string,
  code: string,
): Promise<string | undefined> {
  const { data } = await db
    .from(table)
    .select("report_date")
    .eq("contract_code", code)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.report_date ?? undefined;
}

/**
 * Legacy + TFF inkrementell je Contract ab letztem report_date (voll beim
 * ersten Lauf). TFF nur für Financial Futures (FX, DXY, BTC, SPX).
 *
 * `voll: true` ignoriert das letzte Datum und holt die ganze Historie ab 2006
 * neu. Nötig, wenn dem Zeilenbestand eine SPALTE fehlt statt Zeilen: der
 * inkrementelle Lauf fasst alte Zeilen nie wieder an, also bleiben Spalten,
 * die später dazukamen, dort für immer NULL. Genau das war am 20.08.2026 mit
 * `comm_long` und `nonrept_long` der Fall — Monty stand leer da, obwohl der
 * Zeilenzähler grün war.
 *
 * Der Lauf ist ein Upsert, also gefahrlos wiederholbar; er dauert nur
 * deutlich länger und sollte nicht am Cron hängen.
 */
export async function updateCot(
  db: SupabaseClient, opts: { voll?: boolean } = {},
): Promise<Record<string, unknown>> {
  let totalRows = 0;
  let tffRows = 0;
  const errors: string[] = [];

  for (const contract of CFTC_CONTRACTS) {
    try {
      const since = opts.voll
        ? undefined
        : await lastReportDate(db, "cot_reports", contract.code);
      const rows = await fetchCot(contract.code, { since });
      totalRows += await chunkUpsert(
        db,
        "cot_reports",
        rows as unknown as Record<string, unknown>[],
        "contract_code,report_date",
      );
    } catch (e) {
      errors.push(`${contract.label}: ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const contract of TFF_CONTRACTS) {
    try {
      const since = opts.voll
        ? undefined
        : await lastReportDate(db, "cot_tff_reports", contract.code);
      const rows = await fetchCotTff(contract.code, { since });
      tffRows += await chunkUpsert(
        db,
        "cot_tff_reports",
        rows as unknown as Record<string, unknown>[],
        "contract_code,report_date",
      );
    } catch (e) {
      errors.push(`TFF ${contract.label}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (errors.length === CFTC_CONTRACTS.length + TFF_CONTRACTS.length) {
    throw new Error(`alle Contracts fehlgeschlagen: ${errors[0]}`);
  }
  return {
    contracts: CFTC_CONTRACTS.length,
    tffContracts: TFF_CONTRACTS.length,
    rows: totalRows,
    tffRows,
    errors,
  };
}
