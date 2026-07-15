import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Nightly-Engine-Log: fasst die Experimente aus `ml_experiments` je
 * Kalendertag (UTC) zusammen, damit sichtbar wird, ob die nächtliche
 * Suche Fortschritt macht — oder still nichts tut / crasht.
 */

export interface EngineFailure {
  algo: string;
  error: string;
}

export interface EngineNight {
  date: string; // 'YYYY-MM-DD' (UTC)
  done: number;
  failed: number;
  pending: number; // queued + running
  bestHall: number | null;
  deltaHall: number | null; // vs. Vornacht (nur wenn beide bestHall haben)
  runtimeMin: number; // Summe runtime_s / 60
  failures: EngineFailure[];
}

export interface EngineLogData {
  nights: EngineNight[]; // absteigend (neueste zuerst) — für die Tabelle
  chart: { date: string; bestHall: number | null }[]; // aufsteigend — für den Verlauf
  totalExperiments: number;
}

interface ExpRow {
  created_at: string;
  status: string;
  hall_score: number | null;
  runtime_s: number | null;
  error: string | null;
  config: Record<string, unknown> | null;
}

const algoOf = (config: Record<string, unknown> | null): string =>
  (config?.algo as string) ?? "?";

export async function loadEngineLog(): Promise<EngineLogData> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("ml_experiments")
    .select("created_at,status,hall_score,runtime_s,error,config")
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = (data ?? []) as ExpRow[];

  // Gruppieren nach UTC-Tag
  const byDay = new Map<string, ExpRow[]>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(r);
  }

  // aufsteigend sortierte Tage → bestHall + Delta zur Vornacht
  const daysAsc = [...byDay.keys()].sort();
  const nightsAsc: EngineNight[] = [];
  let prevBest: number | null = null;

  for (const day of daysAsc) {
    const list = byDay.get(day)!;
    let done = 0,
      failed = 0,
      pending = 0,
      runtimeS = 0;
    let bestHall: number | null = null;
    const failures: EngineFailure[] = [];

    for (const r of list) {
      runtimeS += r.runtime_s ?? 0;
      if (r.status === "done") {
        done += 1;
        if (r.hall_score != null && (bestHall === null || r.hall_score > bestHall)) {
          bestHall = r.hall_score;
        }
      } else if (r.status === "failed") {
        failed += 1;
        if (failures.length < 10) {
          failures.push({ algo: algoOf(r.config), error: r.error ?? "unbekannt" });
        }
      } else {
        pending += 1;
      }
    }

    const deltaHall =
      bestHall !== null && prevBest !== null ? Number((bestHall - prevBest).toFixed(4)) : null;
    if (bestHall !== null) prevBest = bestHall;

    nightsAsc.push({
      date: day,
      done,
      failed,
      pending,
      bestHall,
      deltaHall,
      runtimeMin: Math.round(runtimeS / 60),
      failures,
    });
  }

  return {
    nights: [...nightsAsc].reverse(),
    chart: nightsAsc.map((n) => ({ date: n.date, bestHall: n.bestHall })),
    totalExperiments: rows.length,
  };
}
