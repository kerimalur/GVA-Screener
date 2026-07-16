import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Nightly-Engine-Log — Datenquellen:
 *  - `ml_engine_nights_live` (View): aggregiert ml_experiments pro UTC-Nacht,
 *    deckt auch die laufende Nacht ab. Vorher wurden Rohzeilen geladen —
 *    PostgREST cappt bei 1000 Zeilen ≈ weniger als EINE Nacht (~1200 Exp.),
 *    darum war nie Historie sichtbar.
 *  - `ml_engine_nights` (Tabelle): dauerhafte 1-Zeile-pro-Nacht-Historie,
 *    vom Nightly-Runner geschrieben — bleibt erhalten, selbst wenn
 *    ml_experiments irgendwann aufgeräumt wird.
 *  - `ml_experiments` (nur status=failed): Fehler-Details je Nacht.
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
  bestModel: string | null; // Kurz-Info des besten Kandidaten, z.B. "lgbm · 4W · rates+seasonal"
  runtimeMin: number;
  failures: EngineFailure[];
}

export interface EngineLogData {
  nights: EngineNight[]; // absteigend (neueste zuerst) — für die Tabelle
  chart: { date: string; bestHall: number | null }[]; // aufsteigend — für den Verlauf
  totalExperiments: number;
}

interface NightRow {
  night: string;
  done: number;
  failed: number;
  pending?: number;
  best_hall: number | null;
  best_config: Record<string, unknown> | null;
  runtime_min: number | null;
}

interface FailedRow {
  created_at: string;
  config: Record<string, unknown> | null;
  error: string | null;
}

function modelInfo(config: Record<string, unknown> | null): string | null {
  if (!config) return null;
  const algo = (config.algo as string) ?? "?";
  const horizon = config.horizon != null ? `${config.horizon}W` : null;
  const features = Array.isArray(config.features) ? (config.features as string[]).join("+") : null;
  return [algo, horizon, features].filter(Boolean).join(" · ");
}

export async function loadEngineLog(): Promise<EngineLogData> {
  const sb = createServiceClient();

  const [{ data: live }, { data: archive }, { data: failedRows }] = await Promise.all([
    sb
      .from("ml_engine_nights_live")
      .select("night,done,failed,pending,best_hall,best_config,runtime_min"),
    sb.from("ml_engine_nights").select("night,done,failed,best_hall,best_config,runtime_min"),
    sb
      .from("ml_experiments")
      .select("created_at,config,error")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  // Archiv zuerst, Live-View überschreibt gleiche Nächte (frischer: enthält
  // auch queued/running der laufenden Nacht).
  const byNight = new Map<string, NightRow>();
  for (const r of (archive ?? []) as NightRow[]) byNight.set(r.night, r);
  for (const r of (live ?? []) as NightRow[]) byNight.set(r.night, r);

  // Fehler-Details je Nacht (max 10 pro Nacht)
  const failuresByNight = new Map<string, EngineFailure[]>();
  for (const f of (failedRows ?? []) as FailedRow[]) {
    const day = f.created_at.slice(0, 10);
    const list = failuresByNight.get(day) ?? [];
    if (list.length < 10) {
      list.push({ algo: (f.config?.algo as string) ?? "?", error: f.error ?? "unbekannt" });
    }
    failuresByNight.set(day, list);
  }

  const daysAsc = [...byNight.keys()].sort();
  const nightsAsc: EngineNight[] = [];
  let prevBest: number | null = null;
  let totalExperiments = 0;

  for (const day of daysAsc) {
    const r = byNight.get(day)!;
    const pending = r.pending ?? 0;
    totalExperiments += r.done + r.failed + pending;

    const deltaHall =
      r.best_hall !== null && prevBest !== null
        ? Number((r.best_hall - prevBest).toFixed(4))
        : null;
    if (r.best_hall !== null) prevBest = r.best_hall;

    nightsAsc.push({
      date: day,
      done: r.done,
      failed: r.failed,
      pending,
      bestHall: r.best_hall,
      deltaHall,
      bestModel: modelInfo(r.best_config),
      runtimeMin: Math.round(r.runtime_min ?? 0),
      failures: failuresByNight.get(day) ?? [],
    });
  }

  return {
    nights: [...nightsAsc].reverse(),
    chart: nightsAsc.map((n) => ({ date: n.date, bestHall: n.bestHall })),
    totalExperiments,
  };
}
