import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCot } from "@/lib/sources/cftc";
import { CFTC_CONTRACTS } from "@/lib/constants/cftcContracts";
import { chunkUpsert } from "./util";

/** Inkrementell je Contract ab letztem report_date (voll beim ersten Lauf). */
export async function updateCot(db: SupabaseClient): Promise<Record<string, unknown>> {
  let totalRows = 0;
  const errors: string[] = [];

  for (const contract of CFTC_CONTRACTS) {
    try {
      const { data: last } = await db
        .from("cot_reports")
        .select("report_date")
        .eq("contract_code", contract.code)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const rows = await fetchCot(contract.code, {
        since: last?.report_date ?? undefined,
      });
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

  if (errors.length === CFTC_CONTRACTS.length) {
    throw new Error(`alle Contracts fehlgeschlagen: ${errors[0]}`);
  }
  return { contracts: CFTC_CONTRACTS.length, rows: totalRows, errors };
}
