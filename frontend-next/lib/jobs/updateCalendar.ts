import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCalendar } from "@/lib/sources/forexfactory";
import { chunkUpsert } from "./util";

/** ForexFactory-Events (diese + nächste Woche) upserten. */
export async function updateCalendar(
  db: SupabaseClient,
): Promise<Record<string, unknown>> {
  const events = await fetchCalendar();
  if (events.length === 0) {
    return { skipped: true, reason: "keine Events geliefert" };
  }
  const rows = events.map((e) => ({ ...e, updated_at: new Date().toISOString() }));
  const written = await chunkUpsert(db, "calendar_events", rows, "id");
  return { events: written };
}
