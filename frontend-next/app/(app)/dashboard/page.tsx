import Panel from "@/components/layout/Panel";
import NewsPanel from "@/components/dashboard/NewsPanel";
import WeekPlan from "@/components/dashboard/WeekPlan";
import NearGva from "@/components/dashboard/NearGva";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import { loadWeekPlan } from "@/lib/dashboard/weekPlan";
import type { CalendarEventRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Kalender ändert sich täglich per Cron — 5 min Server-Cache.
// Nur Mid- + High-Impact, heute 00:00 bis +7 Tage (Client toggelt heute/Woche).
const getNews = unstable_cache(
  () =>
    tryQuery(async () => {
      const db = createServiceClient();
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 8 * 86_400_000);

      const { data } = await db
        .from("calendar_events")
        .select("*")
        .in("impact", ["High", "Medium"])
        .gte("event_time", from.toISOString())
        .lte("event_time", to.toISOString())
        .order("event_time", { ascending: true });
      return (data ?? []) as CalendarEventRow[];
    }),
  ["dashboard-news-v1"],
  { revalidate: 300 },
);

export default async function Page() {
  const [events, weekPlan] = await Promise.all([getNews(), loadWeekPlan()]);

  if (events === null) {
    return (
      <Panel title="Dashboard — Setup nötig">
        <p className="text-muted text-sm">
          Supabase leer oder nicht konfiguriert. Setup:{" "}
          <code className="font-mono text-accent">supabase/schema.sql</code> +{" "}
          <code className="font-mono text-accent">seed.sql</code> im SQL-Editor ausführen,{" "}
          <code className="font-mono text-accent">.env.local</code> füllen, dann{" "}
          <code className="font-mono text-accent">npx tsx scripts/backfill.mts all</code>.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <Panel
        title={`Diese Woche — Q5/Q1 × GVA${weekPlan.weekStart ? ` · ${weekPlan.weekStart}` : ""}`}
        subtitle="Handelbare Extrem-Paare mit Macro-Kontrolle und Live-GVA-Nähe"
      >
        <WeekPlan pairs={weekPlan.pairs} groups={weekPlan.groups} />
      </Panel>
      <Panel
        title="Nahe GVA-Linien — ≤ 50 Pips"
        subtitle="Live-Übersicht aller Pairs kurz vor einer Linie (wie Market-Scanner), unabhängig vom Wochenplan"
      >
        <NearGva />
      </Panel>
      <Panel
        title="Wirtschafts-News"
        subtitle="Mid- + High-Impact-Events — heute oder ganze Woche · Analyse im Macro Terminal, Setups im Weekly Outlook"
      >
        <NewsPanel events={events} />
      </Panel>
    </div>
  );
}
