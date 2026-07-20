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
    if (r.hit === null || r.hit === undefined) continue; // neutral / unreif
    const key = `${r.factor}|${r.horizon}`;
    const s =
      map.get(key) ??
      { factor: r.factor, horizon: r.horizon, liveHits: 0, liveN: 0, seedHits: 0, seedN: 0 };
    if (r.source === "live") {
      s.liveN += 1;
      if (r.hit) s.liveHits += 1;
    } else {
      s.seedN += 1;
      if (r.hit) s.seedHits += 1;
    }
    map.set(key, s);
  }
  return [...map.values()];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const loadFactorStats = unstable_cache(
  async (): Promise<FactorStat[]> => {
    const sb = createServiceClient();
    const { data } = await sb
      .from("factor_track")
      .select("factor,horizon,source,hit")
      .not("hit", "is", null);
    return agg(data ?? []);
  },
  ["factor-lab-v1"],
  { revalidate: 3600 },
);
