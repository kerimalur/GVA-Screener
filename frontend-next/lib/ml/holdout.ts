import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { verdictOf, type HoldoutRow } from "./holdoutFormat";

export type { HoldoutRow } from "./holdoutFormat";

/**
 * Holdout-Validierung — Ergebnisse aus `ml_holdout_results` (append-only,
 * geschrieben von `python -m ml_engine.run_holdout`).
 *
 * Die Tabelle ist bewusst klein: pro Lauf ein paar Zeilen. Jede Zeile ist eine
 * Config, die einmal gegen die 104 zurückgehaltenen Wochen gehalten wurde.
 */

export interface HoldoutData {
  rows: HoldoutRow[]; // neueste zuerst
  runs: number; // wie oft der Holdout insgesamt befragt wurde
  latestRun: number | null;
}

interface RawRow {
  run_at: string;
  run_index: number;
  config: Record<string, unknown> | null;
  family: string;
  is_baseline: boolean;
  holdout_hitrate: number | null;
  holdout_std: number | null;
  ci_low: number | null;
  ci_high: number | null;
  n_predictions: number | null;
  search_hitrate: number | null;
  selection_gap: number | null;
  delta_vs_baseline: number | null;
  delta_ci_low: number | null;
  delta_ci_high: number | null;
  holdout_start: string | null;
  holdout_end: string | null;
}

export async function loadHoldout(): Promise<HoldoutData> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("ml_holdout_results")
    .select(
      "run_at,run_index,config,family,is_baseline,holdout_hitrate,holdout_std,ci_low,ci_high," +
        "n_predictions,search_hitrate,selection_gap,delta_vs_baseline,delta_ci_low,delta_ci_high," +
        "holdout_start,holdout_end",
    )
    .order("run_index", { ascending: false })
    .order("is_baseline", { ascending: true })
    .limit(200);

  // Doppelter Cast: die Spaltenliste ist zusammengesetzt, deshalb kann
  // supabase-js sie nicht statisch parsen und fällt auf GenericStringError
  // zurück. Die Form garantiert das Schema in migrations.sql.
  const raw = (data ?? []) as unknown as RawRow[];
  const rows: HoldoutRow[] = raw.map((r) => ({
    runAt: r.run_at,
    runIndex: r.run_index,
    family: r.family,
    isBaseline: r.is_baseline,
    hitrate: r.holdout_hitrate,
    std: r.holdout_std,
    ciLow: r.ci_low,
    ciHigh: r.ci_high,
    n: r.n_predictions,
    searchHitrate: r.search_hitrate,
    selectionGap: r.selection_gap,
    delta: r.delta_vs_baseline,
    deltaCiLow: r.delta_ci_low,
    deltaCiHigh: r.delta_ci_high,
    holdoutStart: r.holdout_start,
    holdoutEnd: r.holdout_end,
    verdict: verdictOf({
      isBaseline: r.is_baseline,
      delta: r.delta_vs_baseline,
      deltaCiLow: r.delta_ci_low,
      deltaCiHigh: r.delta_ci_high,
    }),
  }));

  const runs = new Set(rows.map((r) => r.runIndex)).size;
  return { rows, runs, latestRun: rows.length ? rows[0].runIndex : null };
}
