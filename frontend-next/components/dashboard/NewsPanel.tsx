"use client";

import { useState } from "react";
import type { CalendarEventRow } from "@/lib/supabase/types";

/**
 * Wirtschafts-News fürs Dashboard: ausschließlich Mid- und High-Impact-Events
 * (der Server-Loader filtert bereits). Default: heutiger Tag; Umschalter
 * zeigt die ganze Woche (heute + 7 Tage).
 */

const IMPACT_STYLE: Record<string, string> = {
  High: "bg-down/15 text-down",
  Medium: "bg-warn/15 text-warn",
};

export default function NewsPanel({ events }: { events: CalendarEventRow[] }) {
  const [range, setRange] = useState<"today" | "week">("today");

  const todayKey = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, lokale Zeit
  const filtered =
    range === "today"
      ? events.filter((e) => new Date(e.event_time).toLocaleDateString("sv-SE") === todayKey)
      : events;

  const byDay = new Map<string, CalendarEventRow[]>();
  for (const e of filtered) {
    const day = new Date(e.event_time).toLocaleDateString("sv-SE");
    const arr = byDay.get(day) ?? [];
    arr.push(e);
    byDay.set(day, arr);
  }
  const days = [...byDay.keys()].sort();

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
      active
        ? "bg-accent/15 text-accent border-accent"
        : "text-muted border-border hover:border-border2"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        <button className={chip(range === "today")} onClick={() => setRange("today")}>
          Heute
        </button>
        <button className={chip(range === "week")} onClick={() => setRange("week")}>
          Ganze Woche
        </button>
      </div>

      {days.length === 0 && (
        <p className="text-muted text-sm py-6 text-center">
          {range === "today"
            ? "Heute keine Mid-/High-Impact-Events."
            : "Keine Mid-/High-Impact-Events in den nächsten 7 Tagen."}
        </p>
      )}

      {days.map((day) => (
        <div key={day}>
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted border-b border-border pb-1.5 mb-2">
            {new Date(`${day}T12:00:00`).toLocaleDateString("de-DE", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </div>
          <div className="space-y-1">
            {byDay.get(day)!.map((e) => {
              const surprise = e.actual && e.forecast && e.actual !== e.forecast;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-surface2 text-[12px]"
                >
                  <span className="w-12 font-mono text-muted shrink-0">
                    {new Date(e.event_time).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span
                    className={`w-16 text-center px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      IMPACT_STYLE[e.impact ?? ""] ?? "bg-surface2 text-muted"
                    }`}
                  >
                    {e.impact === "Medium" ? "Mid" : (e.impact ?? "–")}
                  </span>
                  <span className="w-10 font-mono font-bold shrink-0">{e.currency}</span>
                  <span className="flex-1 truncate">{e.title}</span>
                  <span className="font-mono text-[11px] shrink-0">
                    <span className={surprise ? "text-accent font-bold" : "text-text"}>
                      {e.actual || "–"}
                    </span>
                    <span className="text-faint"> / {e.forecast || "–"} / {e.previous || "–"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-faint font-mono">
        Nur Mid- + High-Impact · Format: Actual / Forecast / Previous · Quelle: ForexFactory
      </p>
    </div>
  );
}
