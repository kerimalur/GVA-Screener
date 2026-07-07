/**
 * Statistik-Aggregationen — Port aus shared/utils/calculations.ts des Journals.
 */

import type { Trade } from "./types";

export interface TradeStatistics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  totalR: number;
  avgR: number;
  profitFactor: number;
  expectancy: number;
}

export function calculateTradeStatistics(trades: Trade[]): TradeStatistics {
  if (trades.length === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, breakevens: 0, winRate: 0,
      avgWinR: 0, avgLossR: 0, totalR: 0, avgR: 0, profitFactor: 0, expectancy: 0,
    };
  }

  const wins = trades.filter((t) => t.result === "win");
  const losses = trades.filter((t) => t.result === "loss");
  const breakevens = trades.filter((t) => t.result === "breakeven");

  const totalR = trades.reduce((sum, t) => sum + t.rMultiple, 0);
  const avgR = totalR / trades.length;
  const avgWinR = wins.length > 0 ? wins.reduce((s, t) => s + t.rMultiple, 0) / wins.length : 0;
  const avgLossR =
    losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0) / losses.length) : 0;
  const winRate =
    wins.length + losses.length > 0 ? (wins.length / (wins.length + losses.length)) * 100 : 0;

  const grossProfit = trades.filter((t) => t.rMultiple > 0).reduce((s, t) => s + t.rMultiple, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.rMultiple < 0).reduce((s, t) => s + t.rMultiple, 0),
  );
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const expectancy = (winRate / 100) * avgWinR - ((100 - winRate) / 100) * avgLossR;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate, avgWinR, avgLossR, totalR, avgR, profitFactor, expectancy,
  };
}

export interface DrawdownData {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  currentDrawdown: number;
  equityCurve: number[];
  peakEquity: number;
}

export function calculateDrawdown(trades: Trade[]): DrawdownData {
  if (trades.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0, currentDrawdown: 0, equityCurve: [0], peakEquity: 0 };
  }

  const sorted = [...trades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve: number[] = [0];

  for (const trade of sorted) {
    equity += trade.rMultiple;
    equityCurve.push(equity);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    maxDrawdown,
    maxDrawdownPercent: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
    currentDrawdown: peak - equity,
    equityCurve,
    peakEquity: peak,
  };
}

export interface StreakData {
  currentStreak: number;
  streakType: "win" | "loss" | null;
  maxWinStreak: number;
  maxLossStreak: number;
}

export function calculateStreaks(trades: Trade[]): StreakData {
  if (trades.length === 0) {
    return { currentStreak: 0, streakType: null, maxWinStreak: 0, maxLossStreak: 0 };
  }

  const sorted = [...trades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let currentStreak = 0;
  let streakType: "win" | "loss" | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const trade = sorted[i];
    if (trade.result === "breakeven") continue;
    if (streakType === null) {
      streakType = trade.result as "win" | "loss";
      currentStreak = 1;
    } else if (trade.result === streakType) {
      currentStreak++;
    } else break;
  }

  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  for (const trade of sorted) {
    if (trade.result === "win") {
      winStreak++;
      lossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (trade.result === "loss") {
      lossStreak++;
      winStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }

  return { currentStreak, streakType, maxWinStreak, maxLossStreak };
}
