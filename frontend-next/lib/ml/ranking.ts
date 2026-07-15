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
  reason: string; // z.B. "AUD Q5 × USD Q1"
}

export interface PairGroup {
  ccy: string; // treibende Extremwährung
  label: string; // z.B. "AUD stark (Q5)"
  ideas: PairIdea[]; // erst CCY/xxx, dann xxx/CCY
}

export interface PairIdeas {
  best: PairIdea[]; // Q5 × Q1 — beide Seiten extrem
  groups: PairGroup[]; // je Extremwährung: Rückenwind gegen neutrale
}

export interface RankingData {
  weekStart: string | null;
  /** Zeitpunkt des letzten Schreibens der aktuellen Wochen-Rankings (ISO) */
  updatedAt: string | null;
  horizon: number | null;
  champion: RankingRow[];
  baseline: RankingRow[];
  pairIdeas: PairIdeas;
  liveHitrate: Record<string, { hits: number; total: number }>;
  stats: EngineStats;
}

/** Pairs der Woche aus Q5 (long) × Q1 (short) der Champion-Zeilen.
 *  best = beide Seiten extrem. groups = je Extremwährung ein Block
 *  (Q5-Währungen nach Score absteigend zuerst, dann Q1 aufsteigend);
 *  innerhalb des Blocks erst CCY als Basis, dann CCY als Quote. */
export function derivePairIdeas(rows: RankingRow[]): PairIdeas {
  const q5 = new Set(rows.filter((r) => r.confidence_quintile === 5).map((r) => r.ccy));
  const q1 = new Set(rows.filter((r) => r.confidence_quintile === 1).map((r) => r.ccy));
  const isExtreme = (c: string) => q5.has(c) || q1.has(c);

  const best: PairIdea[] = [];
  for (const inst of FX_INSTRUMENTS) {
    const b = inst.baseCcy!, q = inst.quoteCcy!;
    if (q5.has(b) && q1.has(q)) {
      best.push({ pair: inst.displayName, direction: "long", reason: `${b} Q5 × ${q} Q1` });
    } else if (q1.has(b) && q5.has(q)) {
      best.push({ pair: inst.displayName, direction: "short", reason: `${b} Q1 × ${q} Q5` });
    }
  }

  // Gruppen-Reihenfolge: Q5 stark → schwach, danach Q1 schwach → stark
  const ordered = [
    ...rows.filter((r) => q5.has(r.ccy)).sort((a, b) => b.score - a.score),
    ...rows.filter((r) => q1.has(r.ccy)).sort((a, b) => a.score - b.score),
  ];

  const groups: PairGroup[] = ordered.map((r) => {
    const ccy = r.ccy;
    const long = q5.has(ccy); // Q5 → Währung stark → long-Seite
    const asBase: PairIdea[] = [];
    const asQuote: PairIdea[] = [];
    for (const inst of FX_INSTRUMENTS) {
      const b = inst.baseCcy!, q = inst.quoteCcy!;
      if (b === ccy && !isExtreme(q)) {
        // CCY/xxx: CCY stark → Paar long, CCY schwach → Paar short
        asBase.push({ pair: inst.displayName, direction: long ? "long" : "short", reason: `${ccy} ${long ? "Q5" : "Q1"}` });
      } else if (q === ccy && !isExtreme(b)) {
        // xxx/CCY: CCY stark → Paar short, CCY schwach → Paar long
        asQuote.push({ pair: inst.displayName, direction: long ? "short" : "long", reason: `${ccy} ${long ? "Q5" : "Q1"}` });
      }
    }
    return {
      ccy,
      label: `${ccy} ${long ? "stark (Q5)" : "schwach (Q1)"}`,
      ideas: [...asBase, ...asQuote],
    };
  });

  return { best, groups };
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
  let updatedAt: string | null = null;
  if (weekStart) {
    const { data: rows } = await sb
      .from("ml_weekly_rankings")
      .select("ccy,model,horizon,score,confidence_quintile,top_features,created_at")
      .eq("week_start", weekStart);
    for (const r of rows ?? []) {
      if (r.created_at && (updatedAt === null || r.created_at > updatedAt)) {
        updatedAt = r.created_at as string;
      }
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
    updatedAt,
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
