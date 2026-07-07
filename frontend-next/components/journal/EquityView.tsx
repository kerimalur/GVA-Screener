"use client";

import { useEffect, useMemo, useState } from "react";
import Panel from "@/components/layout/Panel";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import EquityChart from "./charts/EquityChart";
import RMultipleChart from "./charts/RMultipleChart";
import WinRateChart from "./charts/WinRateChart";
import type { AccountConfigs, AccountType, Trade } from "@/lib/journal/types";
import { loadTrades } from "@/lib/journal/trades";
import { loadAccountConfigs } from "@/lib/journal/accounts";
import { calculateTradeStatistics, calculateDrawdown, calculateStreaks } from "@/lib/journal/stats";

type TimeFilter = "all" | "month" | "quarter" | "year";

function StreakDots({ trades, maxDots = 25 }: { trades: Trade[]; maxDots?: number }) {
  const results = [...trades]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-maxDots)
    .map((t) => t.result);
  return (
    <div className="flex items-center gap-1" title={`Letzte ${results.length} Trades`}>
      {results.map((r, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            r === "win" ? "bg-up" : r === "loss" ? "bg-down" : "bg-neutral"
          }`}
        />
      ))}
    </div>
  );
}

export default function EquityView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [configs, setConfigs] = useState<AccountConfigs | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState<AccountType>("funded");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [showDrawdown, setShowDrawdown] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten-Fetch beim Mount
    setLoading(true);
    Promise.all([loadTrades(), loadAccountConfigs()])
      .then(([t, c]) => {
        setTrades(t);
        setConfigs(c);
      })
      .catch(() => toast.error("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  const filteredTrades = useMemo(
    () =>
      trades.filter((trade) => {
        if (trade.type !== accountFilter) return false;
        if (trade.sessionType !== "live") return false;
        if (timeFilter !== "all") {
          const tradeDate = new Date(trade.date);
          const cutoff = new Date();
          if (timeFilter === "month") cutoff.setMonth(cutoff.getMonth() - 1);
          if (timeFilter === "quarter") cutoff.setMonth(cutoff.getMonth() - 3);
          if (timeFilter === "year") cutoff.setFullYear(cutoff.getFullYear() - 1);
          if (tradeDate < cutoff) return false;
        }
        return true;
      }),
    [trades, accountFilter, timeFilter],
  );

  const stats = useMemo(() => calculateTradeStatistics(filteredTrades), [filteredTrades]);
  const dd = useMemo(() => calculateDrawdown(filteredTrades), [filteredTrades]);
  const streaks = useMemo(() => calculateStreaks(filteredTrades), [filteredTrades]);

  const bestTrade = filteredTrades.reduce((m, t) => Math.max(m, t.rMultiple || 0), 0);
  const worstTrade = filteredTrades.reduce((m, t) => Math.min(m, t.rMultiple || 0), 0);
  const startBalance =
    (accountFilter === "ek"
      ? configs?.ek?.initialStartBalance
      : configs?.funded?.initialStartBalance) ?? (accountFilter === "ek" ? 10000 : 100000);

  if (loading) {
    return (
      <Panel>
        <SkeletonRows rows={8} />
      </Panel>
    );
  }

  return (
    <div className="space-y-4 anim-fade-in">
      {/* Kopfzeile: Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={[
            { value: "funded" as const, label: "Funded" },
            { value: "ek" as const, label: "EK" },
          ]}
          value={accountFilter}
          onChange={setAccountFilter}
        />
        <Segmented
          options={[
            { value: "all" as const, label: "Alle" },
            { value: "month" as const, label: "1M" },
            { value: "quarter" as const, label: "3M" },
            { value: "year" as const, label: "1J" },
          ]}
          value={timeFilter}
          onChange={setTimeFilter}
        />
        <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer ml-1">
          <input
            type="checkbox"
            checked={showDrawdown}
            onChange={(e) => setShowDrawdown(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--color-accent)]"
          />
          Drawdown
        </label>
        <div className="ml-auto">
          <StreakDots trades={filteredTrades} />
        </div>
      </div>

      {/* Kennzahlen-Leiste */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2 px-1">
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest">Total R</p>
          <p
            className={`text-2xl font-semibold font-mono ${
              stats.totalR >= 0 ? "text-up" : "text-down"
            }`}
          >
            {stats.totalR >= 0 ? "+" : ""}
            {stats.totalR.toFixed(2)} R
          </p>
          <p className="text-[10px] text-muted font-mono">
            Ø {stats.avgR >= 0 ? "+" : ""}
            {stats.avgR.toFixed(2)}R
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest">Win Rate</p>
          <p className="text-xl font-semibold font-mono">{stats.winRate.toFixed(1)}%</p>
          <p className="text-[10px] text-muted font-mono">
            {stats.wins}W / {stats.losses}L
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest">Profit Factor</p>
          <p className="text-xl font-semibold font-mono">
            {stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest">Max Drawdown</p>
          <p className="text-xl font-semibold font-mono text-down">
            −{dd.maxDrawdown.toFixed(2)} R
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest">Expectancy</p>
          <p className="text-xl font-semibold font-mono">
            {stats.expectancy >= 0 ? "+" : ""}
            {stats.expectancy.toFixed(3)}
          </p>
        </div>
      </div>

      {/* Haupt-Chart */}
      <Panel title="Equity-Verlauf" subtitle={`Start-Balance ${startBalance.toLocaleString("de-DE")}`}>
        {filteredTrades.length === 0 ? (
          <EmptyState
            icon="ph-chart-line"
            title="Keine Trades im Zeitraum"
            description="Passe Konto- oder Zeitfilter an oder journale deinen ersten Trade."
          />
        ) : (
          <EquityChart
            trades={filteredTrades}
            startBalance={startBalance}
            showDrawdown={showDrawdown}
            height={420}
          />
        )}
      </Panel>

      {/* Sekundär-Charts */}
      <div className="grid md:grid-cols-3 gap-4">
        <Panel title="R-Multiple-Verteilung" className="md:col-span-2">
          <RMultipleChart trades={filteredTrades} height={200} />
        </Panel>
        <Panel title="Ergebnis">
          <WinRateChart trades={filteredTrades} height={180} />
          <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-muted">Best Trade</span>
              <span className="font-mono text-up">+{bestTrade.toFixed(1)}R</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Worst Trade</span>
              <span className="font-mono text-down">{worstTrade.toFixed(1)}R</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Win-Serie (max)</span>
              <span className="font-mono text-up">{streaks.maxWinStreak}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Loss-Serie (max)</span>
              <span className="font-mono text-down">{streaks.maxLossStreak}</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
