import CalendarView from "@/components/journal/CalendarView";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import type { CalendarEventRow } from "@/lib/supabase/types";

export const metadata = { title: "Trade-Kalender — FX Terminal" };
export const dynamic = "force-dynamic";

// High-Impact-Termine der nächsten 4 Wochen für den Wochenausblick im
// Kalender-Panel. Serverseitig (Service-Client, kein Auth nötig), 5-min-Cache
// wie die News-Seite. Fällt die Abfrage aus, rendert der Kalender ohne Termine
// weiter — nie ein harter Fehler.
const getUpcoming = unstable_cache(
  () =>
    tryQuery(async () => {
      const db = createServiceClient();
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 28 * 86_400_000);
      const { data } = await db
        .from("calendar_events")
        .select("*")
        .eq("impact", "High")
        .gte("event_time", from.toISOString())
        .lte("event_time", to.toISOString())
        .order("event_time", { ascending: true });
      return (data ?? []) as CalendarEventRow[];
    }),
  ["kalender-upcoming-v1"],
  { revalidate: 300 },
);

export default async function TradeCalendarPage() {
  const events = await getUpcoming();
  return <CalendarView upcomingEvents={events ?? []} />;
}
