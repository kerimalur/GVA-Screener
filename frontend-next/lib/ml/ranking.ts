import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export interface RankingRow {
  ccy: string;
  score: number;
  confidence_quintile: number;
  top_features: { feature: string; value: number }[];
}

export interface EngineStats {
  experimentsTotal: number;
  experimentsDone: number;
  holdoutAccesses: number;
  hallOfFame: { id: number; hall_score: number | null; config: Record<string, unknown> }[];
  champion: { promoted_at: string; config: Record<string, unknown>; note: string | null } | null;
}

export interface RankingData {
  weekStart: string | null;
  horizon: number | null;
  champion: RankingRow[];
  baseline: RankingRow[];
  liveHitrate: Record<string, { hits: number; total: number }>;
  stats: EngineStats;
}

export async function loadRankingData(): Promise<RankingData> {
  const sb = createServiceClient();

  const { data: latest } = await sb
    .from("ml_weekly_rankings")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(1);
  const weekStart: string | null = latest?.[0]?.week_start ?? null;

  const champion: RankingRow[] = [];
  const baseline: RankingRow[] = [];
  let horizon: number | null = null;
  if (weekStart) {
    const { data: rows } = await sb
      .from("ml_weekly_rankings")
      .select("ccy,model,horizon,score,confidence_quintile,top_features")
      .eq("week_start", weekStart);
    for (const r of rows ?? []) {
      const row: RankingRow = {
        ccy: r.ccy,
        score: r.score ?? 0,
        confidence_quintile: r.confidence_quintile ?? 3,
        top_features: (r.top_features as RankingRow["top_features"]) ?? [],
      };
      if (r.model === "champion") champion.push(row);
      else baseline.push(row);
      horizon = r.horizon;
    }
    champion.sort((a, b) => b.score - a.score);
    baseline.sort((a, b) => b.score - a.score);
  }

  const { data: matured } = await sb
    .from("ml_weekly_rankings")
    .select("model,hit")
    .not("hit", "is", null);
  const liveHitrate: Record<string, { hits: number; total: number }> = {};
  for (const r of matured ?? []) {
    const agg = (liveHitrate[r.model] ??= { hits: 0, total: 0 });
    agg.total += 1;
    if (r.hit) agg.hits += 1;
  }

  const [{ count: total }, { count: done }, { count: holdout }] = await Promise.all([
    sb.from("ml_experiments").select("id", { count: "exact", head: true }),
    sb.from("ml_experiments").select("id", { count: "exact", head: true }).eq("status", "done"),
    sb.from("ml_holdout_access").select("id", { count: "exact", head: true }),
  ]);
  const { data: hall } = await sb
    .from("ml_experiments")
    .select("id,hall_score,config")
    .eq("status", "done")
    .order("hall_score", { ascending: false, nullsFirst: false })
    .limit(5);
  const { data: champ } = await sb
    .from("ml_champion")
    .select("promoted_at,config,note")
    .order("id", { ascending: false })
    .limit(1);

  return {
    weekStart,
    horizon,
    champion,
    baseline,
    liveHitrate,
    stats: {
      experimentsTotal: total ?? 0,
      experimentsDone: done ?? 0,
      holdoutAccesses: holdout ?? 0,
      hallOfFame: (hall ?? []) as EngineStats["hallOfFame"],
      champion: (champ?.[0] as EngineStats["champion"]) ?? null,
    },
  };
}
