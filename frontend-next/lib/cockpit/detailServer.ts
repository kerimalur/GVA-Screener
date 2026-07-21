import "server-only";
import { loadRankingData } from "@/lib/ml/ranking";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import type { CalendarEventRow } from "@/lib/supabase/types";
import type { CcyRanking, CockpitEvent } from "./detail";

/**
 * Fundamentaler Kontext für Cockpit und Outlook-Detail — EINE Ladefunktion für
 * beide Seiten. Vorher lag das nur in der Cockpit-Seite und war der Grund,
 * weshalb die Outlook-Seite Verdikt und Quintile nicht zeigen konnte.
 */
export interface FundamentalContext {
  /** Stärke-Quintil je Währung — Basis der Konfluenz-Bewertung. */
  quintiles: Record<string, number>;
  /** Score + Top-Faktoren je Währung (Detailansicht). */
  rankingByCcy: Record<string, CcyRanking>;
  /** High-Impact-Events der nächsten 8 Tage je Währung. */
  eventsByCcy: Record<string, CockpitEvent[]>;
}

async function loadEventsByCcy(): Promise<Record<string, CockpitEvent[]>> {
  const rows =
    (await tryQuery(async () => {
      const db = createServiceClient();
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 8 * 86_400_000);
      const { data } = await db
        .from("calendar_events")
        .select("*")
        .eq("impact", "High")
        .gte("event_time", from.toISOString())
        .lte("event_time", to.toISOString())
        .order("event_time", { ascending: true });
      return (data ?? []) as CalendarEventRow[];
    })) ?? [];

  const byCcy: Record<string, CockpitEvent[]> = {};
  for (const e of rows) {
    if (!e.currency) continue;
    (byCcy[e.currency] ??= []).push({ title: e.title, when: e.event_time });
  }
  return byCcy;
}

export async function loadFundamentalContext(): Promise<FundamentalContext> {
  const [ranking, eventsByCcy] = await Promise.all([loadRankingData(), loadEventsByCcy()]);

  const quintiles: Record<string, number> = {};
  const rankingByCcy: Record<string, CcyRanking> = {};
  for (const r of ranking.champion) {
    quintiles[r.ccy] = r.strength_quintile;
    rankingByCcy[r.ccy] = {
      quintile: r.strength_quintile,
      score: r.score,
      top: r.top_features,
    };
  }
  return { quintiles, rankingByCcy, eventsByCcy };
}
