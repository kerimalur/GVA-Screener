import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";

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

export interface PairIdea {
  pair: string; // Anzeige, z.B. "AUD/USD"
  direction: "long" | "short";
  tier: "best" | "gut";
  reason: string; // z.B. "AUD Q5 × USD Q1"
}

export interface RankingData {
  weekStart: string | null;
  horizon: number | null;
  champion: RankingRow[];
  baseline: RankingRow[];
  pairIdeas: PairIdea[];
  liveHitrate: Record<string, { hits: number; total: number }>;
  stats: EngineStats;
}

/** Pairs der Woche aus Q5 (long) × Q1 (short) der Champion-Zeilen.
 *  "best" = beide Seiten extrem; "gut" = eine Seite extrem, andere neutral. */
export function derivePairIdeas(rows: RankingRow[]): PairIdea[] {
  const q5 = new Set(rows.filter((r) => r.confidence_quintile === 5).map((r) => r.ccy));
  const q1 = new Set(rows.filter((r) => r.confidence_quintile === 1).map((r) => r.ccy));
  const ideas: PairIdea[] = [];
  for (const inst of FX_INSTRUMENTS) {
    const b = inst.baseCcy!, q = inst.quoteCcy!;
    const bLong = q5.has(b), bShort = q1.has(b);
    const qLong = q5.has(q), qShort = q1.has(q);
    if ((bLong && qLong) || (bShort && qShort)) continue; // beide Seiten gleich extrem → kein Signal
    if (bLong && qShort) {
      ideas.push({ pair: inst.displayName, direction: "long", tier: "best", reason: `${b} Q5 × ${q} Q1` });
    } else if (bShort && qLong) {
      ideas.push({ pair: inst.displayName, direction: "short", tier: "best", reason: `${b} Q1 × ${q} Q5` });
    } else if (bLong) {
      ideas.push({ pair: inst.displayName, direction: "long", tier: "gut", reason: `${b} Q5` });
    } else if (qShort) {
      ideas.push({ pair: inst.displayName, direction: "long", tier: "gut", reason: `${q} Q1` });
    } else if (bShort) {
      ideas.push({ pair: inst.displayName, direction: "short", tier: "gut", reason: `${b} Q1` });
    } else if (qLong) {
      ideas.push({ pair: inst.displayName, direction: "short", tier: "gut", reason: `${q} Q5` });
    }
  }
  return ideas.sort((a, b) => (a.tier === b.tier ? a.pair.localeCompare(b.pair) : a.tier === "best" ? -1 : 1));
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
    pairIdeas: derivePairIdeas(champion),
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
