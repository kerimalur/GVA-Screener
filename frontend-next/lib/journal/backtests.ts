/**
 * Backtest-Sessions (Tabelle backtest_sessions) + Auswertungs-Helfer.
 * Port von backtestService.ts + backtestStats.ts. Supabase ist alleinige
 * Quelle (der localStorage-Hybrid des alten Journals entfällt — Login ist Pflicht).
 */

import { createBrowserSupabase } from "@/lib/supabase/client";
import { getSessionUser } from "./supabase-crud";
import { SETUP_DEFINITIONS } from "./types";

// ============================================================
// Typen
// ============================================================

export interface BacktestTrade {
  id: string;
  pair: string;
  direction: "long" | "short";
  result: "win" | "loss" | "breakeven";
  rMultiple: number;
  date: string;
  setups: string[];
  problems: string[];
  timestamp: number;
  screenshot?: string;
  notes?: string;
}

export interface BacktestSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  trades: BacktestTrade[];
  isPaused: boolean;
  elapsedMs: number;
  isCompleted?: boolean;
  pair?: string;
  strategyId?: string;
  strategy?: string;
  defaultRR?: number;
  riskPercent?: number;
  accountSize?: number;
  startDate?: string;
}

export interface BacktestStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalR: number;
  avgR: number;
  profitFactor: number;
  hasEur: boolean;
  eurRisk: number;
  totalEur: number;
  accountEnd: number;
  growthPct: number;
}

export const newId = () => crypto.randomUUID();

/** Bild-DataURL verkleinern (Screenshots sind sonst MB-groß). */
export function downscaleImage(src: string, maxPx = 900, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(src);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

// ============================================================
// Persistenz (Config lebt in stats.config — Schema unverändert)
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamische Supabase-Rows (Port) */
function rowToSession(r: any): BacktestSession {
  const config = (r.stats && r.stats.config) || {};
  return {
    id: r.id,
    name: r.name || "",
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
    trades: Array.isArray(r.trades) ? r.trades : [],
    isPaused: true, // geladen = pausiert; Timer läuft erst bei Aktion weiter
    elapsedMs: Number(r.elapsed_ms) || 0,
    isCompleted: r.status === "completed",
    pair: config.pair,
    strategyId: r.strategy_id ?? config.strategyId,
    strategy: config.strategy,
    defaultRR: config.defaultRR,
    riskPercent: config.riskPercent,
    accountSize: config.accountSize,
    startDate: config.startDate,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function sessionToRow(s: BacktestSession, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    name: s.name || "",
    status: s.isCompleted ? "completed" : "active",
    elapsed_ms: s.elapsedMs || 0,
    trades: s.trades || [],
    strategy_id: s.strategyId || null,
    stats: {
      config: {
        pair: s.pair,
        strategyId: s.strategyId,
        strategy: s.strategy,
        defaultRR: s.defaultRR,
        riskPercent: s.riskPercent,
        accountSize: s.accountSize,
        startDate: s.startDate,
      },
    },
    created_at: new Date(s.createdAt || Date.now()).toISOString(),
    updated_at: new Date(s.updatedAt || Date.now()).toISOString(),
  };
}

export async function loadBacktests(): Promise<BacktestSession[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("backtest_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToSession);
}

export async function saveBacktest(session: BacktestSession): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("backtest_sessions")
    .upsert(sessionToRow(session, user.id), { onConflict: "id" });
  if (error) throw error;
}

export async function removeBacktest(id: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const supabase = createBrowserSupabase();
  const { error } = await supabase
    .from("backtest_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

// ============================================================
// Auswertung (pure Funktionen)
// ============================================================

export const MIN_SAMPLE = 20;

export type EquityPeriod = "all" | "1y" | "6m" | "3m" | "1m" | "1w";

export const EQUITY_PERIODS: { key: EquityPeriod; label: string }[] = [
  { key: "all", label: "Alles" },
  { key: "1y", label: "1J" },
  { key: "6m", label: "6M" },
  { key: "3m", label: "3M" },
  { key: "1m", label: "1M" },
  { key: "1w", label: "1W" },
];

/** €-Risiko pro Trade: fix = Risiko% der START-Account-Größe (kein Compounding). */
export function computeEurRisk(accountSize?: number, riskPercent?: number): number {
  const a = accountSize || 0;
  const r = riskPercent || 0;
  return a > 0 && r > 0 ? (a * r) / 100 : 0;
}

export function computeStats(
  trades: BacktestTrade[],
  accountSize?: number,
  riskPercent?: number,
): BacktestStats {
  const acctSize = accountSize || 0;
  const eurRisk = computeEurRisk(accountSize, riskPercent);
  const base = { hasEur: eurRisk > 0, eurRisk, totalEur: 0, accountEnd: acctSize, growthPct: 0 };
  if (trades.length === 0) {
    return { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalR: 0, avgR: 0, profitFactor: 0, ...base };
  }
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
  const avgR = totalR / trades.length;
  const winRate = (wins / (wins + losses)) * 100 || 0;
  const grossProfit = trades.filter((t) => t.rMultiple > 0).reduce((s, t) => s + t.rMultiple, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.rMultiple < 0).reduce((s, t) => s + t.rMultiple, 0),
  );
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const totalEur = eurRisk * totalR;
  return {
    totalTrades: trades.length,
    wins, losses, winRate, totalR, avgR, profitFactor,
    hasEur: eurRisk > 0,
    eurRisk,
    totalEur,
    accountEnd: acctSize + totalEur,
    growthPct: acctSize > 0 ? (totalEur / acctSize) * 100 : 0,
  };
}

export interface EquityPoint {
  date: string;
  equity: number; // € wenn hasEur, sonst R
}

/**
 * Equity nach Datum (End-of-Day kumuliert). Zeitraum rückwärts vom LETZTEN
 * Trade-Datum gemessen (Backtests liegen historisch); Filter zoomt nur.
 */
export function buildEquityByDate(
  trades: BacktestTrade[],
  period: EquityPeriod,
  accountSize?: number,
  riskPercent?: number,
): EquityPoint[] {
  if (trades.length === 0) return [];
  const eurRisk = computeEurRisk(accountSize, riskPercent);
  const hasEur = eurRisk > 0;
  const acctSize = accountSize || 0;

  const sorted = [...trades].sort((a, b) =>
    a.date === b.date ? a.timestamp - b.timestamp : a.date.localeCompare(b.date),
  );

  let r = 0;
  const byDay = new Map<string, number>();
  for (const t of sorted) {
    r += t.rMultiple;
    const equity = hasEur ? acctSize + r * eurRisk : r;
    byDay.set(t.date, parseFloat(equity.toFixed(2)));
  }
  let points: EquityPoint[] = [...byDay.entries()].map(([date, equity]) => ({ date, equity }));

  if (period !== "all") {
    const anchor = new Date(sorted[sorted.length - 1].date);
    const start = new Date(anchor);
    if (period === "1y") start.setFullYear(start.getFullYear() - 1);
    if (period === "6m") start.setMonth(start.getMonth() - 6);
    if (period === "3m") start.setMonth(start.getMonth() - 3);
    if (period === "1m") start.setMonth(start.getMonth() - 1);
    if (period === "1w") start.setDate(start.getDate() - 7);
    const startStr = start.toISOString().split("T")[0];
    points = points.filter((p) => p.date >= startStr);
  }
  return points;
}

export interface CategoryStat {
  key: string;
  label: string;
  color?: string;
  n: number;
  winRate: number;
  totalR: number;
  expectancy: number;
  reliable: boolean;
}

/** Performance je Setup — Trade mit mehreren Setups zählt bei jedem. */
export function computeSetupStats(trades: BacktestTrade[]): CategoryStat[] {
  const agg: Record<string, { n: number; wins: number; losses: number; totalR: number }> = {};
  for (const t of trades) {
    for (const key of t.setups.length ? t.setups : ["(ohne Setup)"]) {
      if (!agg[key]) agg[key] = { n: 0, wins: 0, losses: 0, totalR: 0 };
      agg[key].n++;
      agg[key].totalR += t.rMultiple;
      if (t.result === "win") agg[key].wins++;
      else if (t.result === "loss") agg[key].losses++;
    }
  }
  return Object.entries(agg)
    .map(([key, v]) => {
      const def = SETUP_DEFINITIONS[key];
      const decided = v.wins + v.losses;
      return {
        key,
        label: def?.short || def?.label || key,
        color: def?.color,
        n: v.n,
        winRate: decided > 0 ? (v.wins / decided) * 100 : 0,
        totalR: v.totalR,
        expectancy: v.n > 0 ? v.totalR / v.n : 0,
        reliable: v.n >= MIN_SAMPLE,
      };
    })
    .sort((a, b) => b.expectancy - a.expectancy);
}

/** Performance je Problem-Tag — SCHLECHTESTE zuerst (Leaks finden). */
export function computeProblemStats(trades: BacktestTrade[]): CategoryStat[] {
  const agg: Record<string, { n: number; wins: number; losses: number; totalR: number }> = {};
  for (const t of trades) {
    for (const key of t.problems) {
      if (!agg[key]) agg[key] = { n: 0, wins: 0, losses: 0, totalR: 0 };
      agg[key].n++;
      agg[key].totalR += t.rMultiple;
      if (t.result === "win") agg[key].wins++;
      else if (t.result === "loss") agg[key].losses++;
    }
  }
  return Object.entries(agg)
    .map(([key, v]) => {
      const decided = v.wins + v.losses;
      return {
        key,
        label: key,
        n: v.n,
        winRate: decided > 0 ? (v.wins / decided) * 100 : 0,
        totalR: v.totalR,
        expectancy: v.n > 0 ? v.totalR / v.n : 0,
        reliable: v.n >= MIN_SAMPLE,
      };
    })
    .sort((a, b) => a.expectancy - b.expectancy);
}

export interface TradeFilter {
  setups: string[];
  problems: string[];
  keyword: string;
}

export const EMPTY_FILTER: TradeFilter = { setups: [], problems: [], keyword: "" };

export function isFilterActive(f: TradeFilter): boolean {
  return f.setups.length > 0 || f.problems.length > 0 || f.keyword.trim().length > 0;
}

export function filterTrades(trades: BacktestTrade[], f: TradeFilter): BacktestTrade[] {
  const kw = f.keyword.trim().toLowerCase();
  return trades.filter((t) => {
    if (f.setups.length && !f.setups.some((s) => t.setups.includes(s))) return false;
    if (f.problems.length && !f.problems.some((p) => t.problems.includes(p))) return false;
    if (kw) {
      const hay = `${t.notes || ""} ${(t.problems || []).join(" ")}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}
