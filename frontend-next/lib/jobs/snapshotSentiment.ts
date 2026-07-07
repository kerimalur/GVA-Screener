import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOutlook } from "@/lib/sources/myfxbook";
import { FX_INSTRUMENTS, fromOanda } from "@/lib/constants/instruments";
import { chunkUpsert } from "./util";

const TRACKED_PAIRS = new Set(FX_INSTRUMENTS.map((i) => fromOanda(i.instrument)));

/** Ein Sentiment-Snapshot (Myfxbook Community Outlook). Skipped bei Fehler. */
export async function snapshotSentiment(
  db: SupabaseClient,
): Promise<Record<string, unknown>> {
  const outlook = await fetchOutlook();
  if (!outlook) {
    return { skipped: true, reason: "Myfxbook nicht erreichbar oder Login fehlgeschlagen" };
  }

  const capturedAt = new Date().toISOString();
  const rows = outlook
    .filter((s) => TRACKED_PAIRS.has(s.name))
    .map((s) => ({
      pair: s.name,
      captured_at: capturedAt,
      long_pct: s.longPercentage,
      short_pct: s.shortPercentage,
      long_positions: s.longPositions,
      short_positions: s.shortPositions,
      long_volume: s.longVolume,
      short_volume: s.shortVolume,
    }));

  if (rows.length === 0) {
    return { skipped: true, reason: "keine getrackten Paare im Outlook" };
  }

  const written = await chunkUpsert(db, "sentiment_snapshots", rows, "pair,captured_at");
  return { pairs: written, capturedAt };
}
