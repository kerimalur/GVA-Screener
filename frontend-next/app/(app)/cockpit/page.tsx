import "server-only";
import Panel from "@/components/layout/Panel";
import CockpitBoard from "@/components/cockpit/CockpitBoard";
import type { CcyRanking, CockpitEvent } from "@/components/cockpit/FundamentalModal";
import { loadRankingData } from "@/lib/ml/ranking";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import type { CalendarEventRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cockpit — FX Terminal" };

/** High-Impact-Events der nächsten 8 Tage, gruppiert je Währung (fürs Popup). */
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

export default async function CockpitPage() {
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

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <Panel
        title="Cockpit — Trades der Woche"
        subtitle="GVA-Setups: Wartend → Aktiv → In Arbeit. Klick ein Pair für die fundamentale Lage. Nur «Genommen» landet im Journal."
      >
        <div className="p-4">
          <CockpitBoard
            quintiles={quintiles}
            rankingByCcy={rankingByCcy}
            eventsByCcy={eventsByCcy}
          />
        </div>
      </Panel>
    </div>
  );
}
