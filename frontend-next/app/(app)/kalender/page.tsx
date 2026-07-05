import { unstable_cache } from "next/cache";
import Panel from "@/components/layout/Panel";
import EventList from "@/components/kalender/EventList";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import { BANKS } from "@/lib/constants/banks";
import type { CalendarEventRow, CbMeetingRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Kalender ändert sich täglich per Cron — 5 min Server-Cache.
const getCalendarData = unstable_cache(
  () =>
    tryQuery(async () => {
      const db = createServiceClient();
      const from = new Date();
      from.setDate(from.getDate() - 1);

      const [{ data: events }, { data: meetings }] = await Promise.all([
        db
          .from("calendar_events")
          .select("*")
          .gte("event_time", from.toISOString())
          .order("event_time", { ascending: true }),
        db
          .from("cb_meetings")
          .select("*")
          .gte("meeting_date", new Date().toISOString().slice(0, 10))
          .order("meeting_date", { ascending: true }),
      ]);
      return {
        events: (events ?? []) as CalendarEventRow[],
        meetings: (meetings ?? []) as CbMeetingRow[],
      };
    }),
  ["kalender-data"],
  { revalidate: 300 },
);

export default async function Page() {
  const data = await getCalendarData();

  const bankName = new Map(BANKS.map((b) => [b.bank, b]));

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <Panel
        title="Zentralbank-Kalender"
        subtitle="Anstehende Zinsentscheide + erwartete Änderung (editierbar in Supabase: cb_meetings)"
      >
        {!data || data.meetings.length === 0 ? (
          <p className="text-muted text-sm">Keine anstehenden Meetings hinterlegt — seed.sql ausführen.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {data.meetings.slice(0, 12).map((m) => {
              const b = bankName.get(m.bank);
              const exp = m.expected_change_bps;
              return (
                <div
                  key={`${m.bank}-${m.meeting_date}`}
                  className="bg-surface2 border border-border rounded p-3"
                  title={m.notes ?? undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[13px]">{m.bank}</span>
                    <span className="text-[10px] text-muted font-mono">{b?.ccy}</span>
                  </div>
                  <div className="text-[12px] font-mono mt-1">
                    {new Date(m.meeting_date).toLocaleDateString("de-DE", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </div>
                  <div
                    className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                      exp === null || exp === 0
                        ? "bg-surface text-muted"
                        : exp > 0
                          ? "bg-up/15 text-up"
                          : "bg-down/15 text-down"
                    }`}
                  >
                    {exp === null ? "n/a" : exp === 0 ? "±0 bps erwartet" : `${exp > 0 ? "+" : ""}${exp} bps erwartet`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Wirtschaftskalender"
        subtitle="High-Impact-Events dieser + nächster Woche, filterbar"
      >
        {!data || data.events.length === 0 ? (
          <p className="text-muted text-sm">
            Keine Events — <code className="font-mono text-accent">npx tsx scripts/backfill.mts calendar</code>{" "}
            oder auf den täglichen Cron warten.
          </p>
        ) : (
          <EventList events={data.events} />
        )}
      </Panel>
    </div>
  );
}
