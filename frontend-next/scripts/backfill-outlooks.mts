/**
 * Outlook-Snapshot-Backfill (lokal ausführen):
 *   npx tsx scripts/backfill-outlooks.mts [wochen]     — Default 104 (≈ 2 Jahre)
 *
 * Rekonstruiert wöchentliche Screener-Verdicts aus COT-/FRED-Historie und
 * schreibt sie nach weekly_outlook_snapshots (source='backfill'). Idempotent.
 * Braucht NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
config({ path: join(root, ".env.local") });
config({ path: join(root, ".env") });

const { createClient } = await import("@supabase/supabase-js");
const { backfillOutlookSnapshots } = await import("../lib/ml/outlookSnapshots");
const { runJob } = await import("../lib/jobs/util");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const weeks = Number(process.argv[2] ?? 416);
if (!Number.isFinite(weeks) || weeks < 1 || weeks > 520) {
  console.error(`Ungültige Wochenzahl '${process.argv[2]}' (erlaubt: 1–520)`);
  process.exit(1);
}

const started = Date.now();
console.log(`→ Backfill Outlook-Snapshots, ${weeks} Wochen …`);
const result = await runJob(db, "backfill:outlook-snapshots", () =>
  backfillOutlookSnapshots(db, weeks),
);
console.log(`  ${JSON.stringify(result)} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
if (result.status === "error") process.exit(1);
