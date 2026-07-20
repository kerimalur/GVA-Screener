import Panel from "@/components/layout/Panel";
import NewsPanel from "@/components/dashboard/NewsPanel";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import type { CalendarEventRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Reine News-Seite. Wochenplan (Q5/Q1) + GVA-Nähe liegen jetzt im Cockpit —
// die Panels wurden hier bewusst entfernt, um Doppelspurigkeit zu vermeiden.
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
  const events = await getNews();

  if (events === null) {
    return (
      <Panel title="News — Setup nötig">
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
        title="Wirtschafts-News"
        subtitle="Mid- + High-Impact-Events — heute oder ganze Woche"
      >
        <NewsPanel events={events} />
      </Panel>
    </div>
  );
}
