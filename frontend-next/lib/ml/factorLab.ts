import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export interface FactorStat {
  factor: string;
  horizon: number;
  liveHits: number;
  liveN: number;
  seedHits: number;
  seedN: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamische Supabase-Rows */
function agg(rows: any[]): FactorStat[] {
  const map = new Map<string, FactorStat>();
  for (const r of rows) {
    const key = `${r.factor}|${r.horizon}`;
    const s =
      map.get(key) ??
      { factor: r.factor, horizon: r.horizon, liveHits: 0, liveN: 0, seedHits: 0, seedN: 0 };
    const hits = Number(r.hits) || 0;
    const n = Number(r.n) || 0;
    if (r.source === "live") {
      s.liveHits += hits;
      s.liveN += n;
    } else {
      s.seedHits += hits;
      s.seedN += n;
    }
    map.set(key, s);
  }
  return [...map.values()];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const loadFactorStats = unstable_cache(
  async (): Promise<FactorStat[]> => {
    const sb = createServiceClient();
    // Aggregat-View (winzig) statt Rohzeilen — umgeht die PostgREST-1000-Zeilen-
    // Kappung; sonst würden die wenigen source='live'-Zeilen nie im Response landen.
    const { data } = await sb
      .from("factor_track_stats")
      .select("factor,horizon,source,hits,n");
    return agg(data ?? []);
  },
  ["factor-lab-v1"],
  { revalidate: 3600 },
);
