/**
 * Einmaliger Daten-Backfill (lokal ausführen):
 *   npx tsx scripts/backfill.mts [prices|cot|fred|calendar|sentiment|all]
 *
 * Liest .env.local, schreibt direkt nach Supabase. Idempotent (PK-Upserts).
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
config({ path: join(root, ".env.local") });
config({ path: join(root, ".env") });

// Imports NACH dotenv (Module lesen env beim Aufruf, aber sicher ist sicher)
const { createClient } = await import("@supabase/supabase-js");
const { updatePrices } = await import("../lib/jobs/updatePrices");
const { updateCot } = await import("../lib/jobs/updateCot");
const { updateFred } = await import("../lib/jobs/updateFred");
const { updateCalendar } = await import("../lib/jobs/updateCalendar");
const { snapshotSentiment } = await import("../lib/jobs/snapshotSentiment");
const { runJob } = await import("../lib/jobs/util");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const task = process.argv[2] ?? "all";
const tasks: Record<string, () => Promise<unknown>> = {
  prices: () => runJob(db, "backfill:prices", () => updatePrices(db)),
  cot: () => runJob(db, "backfill:cot", () => updateCot(db)),
  fred: () => runJob(db, "backfill:fred", () => updateFred(db)),
  calendar: () => runJob(db, "backfill:calendar", () => updateCalendar(db)),
  sentiment: () => runJob(db, "backfill:sentiment", () => snapshotSentiment(db)),
};

const selected =
  task === "all" ? Object.entries(tasks) : Object.entries(tasks).filter(([k]) => k === task);

if (selected.length === 0) {
  console.error(`Unbekannter Task '${task}'. Erlaubt: ${Object.keys(tasks).join(", ")}, all`);
  process.exit(1);
}

for (const [name, fn] of selected) {
  const started = Date.now();
  console.log(`→ ${name} …`);
  const result = await fn();
  console.log(`  ${JSON.stringify(result)} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}
console.log("Backfill fertig.");
