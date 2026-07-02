import { createHash } from "node:crypto";
import type { CalendarEventRow } from "@/lib/supabase/types";

interface FfEvent {
  title: string;
  country: string;
  date: string; // ISO mit Offset
  impact: string; // 'High'|'Medium'|'Low'|'Holiday'
  forecast: string;
  previous: string;
  actual?: string;
}

const URLS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
];

/** ForexFactory-Events dieser + nächster Woche. Fehlertolerant je URL. */
export async function fetchCalendar(): Promise<Omit<CalendarEventRow, "updated_at">[]> {
  const events: Omit<CalendarEventRow, "updated_at">[] = [];

  for (const url of URLS) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) fx-terminal" },
      });
      if (!res.ok) continue;
      const rows = (await res.json()) as FfEvent[];

      for (const r of rows) {
        if (!r.title || !r.date) continue;
        const id = createHash("sha1")
          .update(`${r.title}|${r.country}|${r.date}`)
          .digest("hex");
        events.push({
          id,
          title: r.title,
          country: r.country ?? null,
          currency: r.country ?? null, // FF nutzt Währungscode als country
          event_time: new Date(r.date).toISOString(),
          impact: r.impact ?? null,
          forecast: r.forecast || null,
          previous: r.previous || null,
          actual: r.actual || null,
        });
      }
    } catch {
      // einzelne Woche fehlertolerant überspringen
    }
  }
  return events;
}
