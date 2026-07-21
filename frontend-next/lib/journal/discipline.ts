/**
 * Disziplin-System: A+-Setup-Checkliste, Adherence-Score, Expectancy.
 * Spec: docs/superpowers/specs/2026-07-15-disziplin-system-design.md
 *
 * Listen + Parameter leben in user_preferences (lib/journal/prefs.ts) —
 * gleiche Persistenz wie die Confluences, überlebt Reload/Gerätewechsel.
 * Pro Trade gespeichert wird der Zustand zum Log-Zeitpunkt (Labels eingefroren),
 * damit spätere Listen-Änderungen alte Trades nicht umdeuten.
 */

import { loadPref, savePref } from "./prefs";
import { TRADE_BUDGET_PER_MONTH } from "./budget";
import type { Trade } from "./types";

// ── A+-Checkliste ────────────────────────────────────────────────────────────

export interface AplusCriterion {
  label: string;
  met: boolean;
}

export const DEFAULT_APLUS_CRITERIA = [
  "GVA-Hit",
  "BOS bestätigt",
  "Richtige Session (London 08–10 / NY 14–16 Uhr)",
  "Fundamental Stärke-Quintil Q5/Q1 aligned",
] as const;

const APLUS_KEY = "aplus_criteria";

export async function loadAplusCriteria(): Promise<string[]> {
  const v = await loadPref<string[]>(APLUS_KEY, [...DEFAULT_APLUS_CRITERIA]);
  return Array.isArray(v) && v.length ? v : [...DEFAULT_APLUS_CRITERIA];
}

export async function saveAplusCriteria(list: string[]): Promise<void> {
  await savePref(APLUS_KEY, list);
}

/** A+ nur wenn ALLE Kriterien erfüllt. */
export function aplusVerdict(criteria: AplusCriterion[]): boolean {
  return criteria.length > 0 && criteria.every((c) => c.met);
}

// ── Adherence ────────────────────────────────────────────────────────────────

export interface AdherenceAnswer {
  label: string;
  yes: boolean;
}

export const DEFAULT_ADHERENCE_QUESTIONS = [
  "Entry nach Plan?",
  "Stop nach Plan?",
  "Kein Revenge/Overtrading?",
  "Exit nach Plan?",
] as const;

const ADHERENCE_KEY = "adherence_questions";

export async function loadAdherenceQuestions(): Promise<string[]> {
  const v = await loadPref<string[]>(ADHERENCE_KEY, [...DEFAULT_ADHERENCE_QUESTIONS]);
  return Array.isArray(v) && v.length ? v : [...DEFAULT_ADHERENCE_QUESTIONS];
}

export async function saveAdherenceQuestions(list: string[]): Promise<void> {
  await savePref(ADHERENCE_KEY, list);
}

/** Score in % (erfüllte / gesamt), 1 Nachkommastelle. */
export function adherenceScore(answers: AdherenceAnswer[]): number {
  if (answers.length === 0) return 0;
  return Math.round((answers.filter((a) => a.yes).length / answers.length) * 1000) / 10;
}

// ── Expectancy ───────────────────────────────────────────────────────────────

/**
 * Die Trade-Anzahl fehlt hier bewusst: sie ist das feste Monatsbudget
 * (`TRADE_BUDGET_PER_MONTH`) und keine Einstellung mehr. Zwei Zahlen für
 * dieselbe Sache konnten auseinanderlaufen — die Prognose rechnete dann mit
 * mehr Trades, als das Budget überhaupt erlaubt.
 */
export interface ExpectancyParams {
  /** Risiko pro Trade in % des Kontos */
  riskPct: number;
  /** geplantes Reward:Risk (z.B. 4 = 1:4) */
  rr: number;
  /** Fallback-Winrate in %, wenn zu wenig geloggte Trades */
  fallbackWinrate: number;
}

export const DEFAULT_EXPECTANCY_PARAMS: ExpectancyParams = {
  riskPct: 1,
  rr: 4,
  fallbackWinrate: 40,
};

/** Unter dieser Trade-Anzahl gilt die Live-Winrate als nicht belastbar. */
export const EXPECTANCY_MIN_TRADES = 20;

const EXPECTANCY_KEY = "expectancy_params";

export async function loadExpectancyParams(): Promise<ExpectancyParams> {
  const v = await loadPref<ExpectancyParams>(EXPECTANCY_KEY, DEFAULT_EXPECTANCY_PARAMS);
  return { ...DEFAULT_EXPECTANCY_PARAMS, ...(v ?? {}) };
}

export async function saveExpectancyParams(p: ExpectancyParams): Promise<void> {
  await savePref(EXPECTANCY_KEY, p);
}

/**
 * Erwartetes Monats-Ergebnis in % des Kontos:
 * ((WR · RR · Risiko%) − ((1−WR) · Risiko%)) · Trades/Monat
 *
 * Die Trade-Anzahl ist das feste Budget (`TRADE_BUDGET_PER_MONTH`) und keine
 * eigene Einstellung mehr — sonst könnte die Prognose mit mehr Trades rechnen,
 * als du dir erlaubst.
 * Kontrollwerte (1 %, RR 4, 8 Trades/Mt): WR 25 % → +2.0 · WR 50 % → +12.0
 */
export function expectancyPerMonth(winratePct: number, p: ExpectancyParams): number {
  const wr = winratePct / 100;
  const perTrade = wr * p.rr * p.riskPct - (1 - wr) * p.riskPct;
  return perTrade * TRADE_BUDGET_PER_MONTH;
}

/** Winrate in % aus Trades (Wins / alle), null wenn keine Trades. */
export function liveWinrate(trades: Trade[]): number | null {
  if (trades.length === 0) return null;
  const wins = trades.filter((t) => t.result === "win").length;
  return (wins / trades.length) * 100;
}

// ── Payoff: A+ vs. Nicht-A+ ─────────────────────────────────────────────────

export interface PayoffBucket {
  n: number;
  winratePct: number | null;
  avgAdherence: number | null;
}

/** Nur Trades mit gesetztem Verdikt (alte Trades ohne Checkliste zählen nicht). */
export function payoffSplit(trades: Trade[]): { aplus: PayoffBucket; rest: PayoffBucket } {
  const bucket = (subset: Trade[]): PayoffBucket => {
    const withAdh = subset.filter((t) => t.adherenceScore != null);
    return {
      n: subset.length,
      winratePct: liveWinrate(subset),
      avgAdherence: withAdh.length
        ? withAdh.reduce((s, t) => s + (t.adherenceScore ?? 0), 0) / withAdh.length
        : null,
    };
  };
  const rated = trades.filter((t) => t.aplusVerdict != null);
  return {
    aplus: bucket(rated.filter((t) => t.aplusVerdict === true)),
    rest: bucket(rated.filter((t) => t.aplusVerdict === false)),
  };
}
