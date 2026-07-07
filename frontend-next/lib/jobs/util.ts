import type { SupabaseClient } from "@supabase/supabase-js";

export interface JobResult {
  job: string;
  status: "ok" | "error" | "skipped";
  detail: Record<string, unknown>;
}

/** Upsert in Chunks (Payload-Limit) mit onConflict auf PK. */
export async function chunkUpsert(
  db: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunkSize = 1000,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await db.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
    written += chunk.length;
  }
  return written;
}

/** Job-Ergebnis in cron_runs protokollieren (fehlertolerant). */
export async function logRun(db: SupabaseClient, result: JobResult): Promise<void> {
  await db
    .from("cron_runs")
    .insert({ job: result.job, status: result.status, detail: result.detail })
    .then(() => {});
}

/** Job ausführen, Fehler einfangen, Ergebnis loggen. */
export async function runJob(
  db: SupabaseClient,
  job: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<JobResult> {
  let result: JobResult;
  try {
    const detail = await fn();
    const skipped = detail.skipped === true;
    result = { job, status: skipped ? "skipped" : "ok", detail };
  } catch (e) {
    result = {
      job,
      status: "error",
      detail: { message: e instanceof Error ? e.message : String(e) },
    };
  }
  await logRun(db, result);
  return result;
}
