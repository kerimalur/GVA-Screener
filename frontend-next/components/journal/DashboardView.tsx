"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Panel from "@/components/layout/Panel";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import ProgressRing from "@/components/ui/ProgressRing";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import EquityChart from "./charts/EquityChart";
import type { AccountConfigs, AccountType, Trade } from "@/lib/journal/types";
import { loadTrades } from "@/lib/journal/trades";
import { loadAccountConfigs } from "@/lib/journal/accounts";
import { calculateTradeStatistics, calculateDrawdown, calculateStreaks } from "@/lib/journal/stats";

export default function DashboardView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [configs, setConfigs] = useState<AccountConfigs | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>("funded");

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

  const config = configs?.[accountType] ?? null;
  const accountTrades = useMemo(
    () => trades.filter((t) => t.type === accountType && t.sessionType === "live"),
    [trades, accountType],
  );

  const stats = useMemo(() => calculateTradeStatistics(accountTrades), [accountTrades]);
  const dd = useMemo(() => calculateDrawdown(accountTrades), [accountTrades]);
  const streaks = useMemo(() => calculateStreaks(accountTrades), [accountTrades]);

  const totalProfit = useMemo(
    () => accountTrades.reduce((s, t) => s + (t.profitAmount ?? 0), 0),
    [accountTrades],
  );

  const recentTrades = useMemo(
    () =>
      [...accountTrades]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    [accountTrades],
  );

  const goalPct =
    config?.enableGoals && config.profitTarget && config.profitTarget > 0
      ? Math.min((config.currentBalance / config.profitTarget) * 100, 100)
      : null;

  if (loading) {
    return (
      <Panel>
        <SkeletonRows rows={8} />
      </Panel>
    );
  }

  const currency = config?.currency || "USD";

  return (
    <div className="space-y-4 anim-fade-in">
      <div className="flex items-center gap-3">
        <Segmented
          options={[
            { value: "funded" as const, label: "Funded", icon: "ph-buildings" },
            { value: "ek" as const, label: "Eigenkapital", icon: "ph-wallet" },
          ]}
          value={accountType}
          onChange={setAccountType}
        />
        {streaks.currentStreak > 0 && streaks.streakType && (
          <Badge
            tone={streaks.streakType === "win" ? "up" : "down"}
            icon={streaks.streakType === "win" ? "ph-fire" : "ph-snowflake"}
          >
            {streaks.currentStreak}× {streaks.streakType === "win" ? "Win" : "Loss"} in Folge
          </Badge>
        )}
      </div>

      {!config ? (
        <Panel>
          <EmptyState
            icon="ph-gauge"
            title="Kein Konto eingerichtet"
            description="Lege im Journal zuerst ein Konto an — dann erscheinen hier deine Kennzahlen."
            action={
              <Link href="/journal" className="text-accent text-[13px] hover:underline">
                Zum Journal →
              </Link>
            }
          />
        </Panel>
      ) : (
        <>
          {/* KPI-Zeile */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard
              label="Kontostand"
              icon="ph-bank"
              value={`${config.currentBalance.toLocaleString("de-DE", { minimumFractionDigits: 2 })}`}
              deltaLabel={currency}
            />
            <StatCard
              label="Gewinn/Verlust"
              icon="ph-coins"
              value={
                <span className={totalProfit > 0 ? "text-up" : totalProfit < 0 ? "text-down" : ""}>
                  {totalProfit > 0 ? "+" : ""}
                  {totalProfit.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                </span>
              }
              deltaLabel={currency}
            />
            <StatCard
              label="Total R"
              icon="ph-sigma"
              value={
                <span className={stats.totalR >= 0 ? "text-up" : "text-down"}>
                  {stats.totalR >= 0 ? "+" : ""}
                  {stats.totalR.toFixed(2)}
                </span>
              }
              deltaLabel={`Ø ${stats.avgR.toFixed(2)}R · ${stats.totalTrades} Trades`}
            />
            <StatCard
              label="Win Rate"
              icon="ph-target"
              value={`${stats.winRate.toFixed(1)}%`}
              deltaLabel={`${stats.wins}W / ${stats.losses}L / ${stats.breakevens}BE`}
            />
            <StatCard
              label="Profit Factor"
              icon="ph-scales"
              value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
              deltaLabel={`Expectancy ${stats.expectancy >= 0 ? "+" : ""}${stats.expectancy.toFixed(3)}`}
            />
            <StatCard
              label="Max Drawdown"
              icon="ph-arrow-elbow-down-right"
              value={<span className="text-down">−{dd.maxDrawdown.toFixed(2)} R</span>}
              deltaLabel={`aktuell −${dd.currentDrawdown.toFixed(2)} R`}
            />
          </div>

          {/* Chart + Ziel/Recent */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Panel title="Equity" className="lg:col-span-2">
              {accountTrades.length === 0 ? (
                <EmptyState
                  icon="ph-chart-line"
                  title="Noch keine Trades"
                  description="Sobald du Trades journalst, erscheint hier deine Equity-Kurve."
                />
              ) : (
                <EquityChart
                  trades={accountTrades}
                  startBalance={config.initialStartBalance}
                  showDrawdown={false}
                  height={280}
                />
              )}
            </Panel>

            <div className="space-y-4">
              {goalPct != null && (
                <Panel title="Kontoziel">
                  <div className="flex items-center gap-4">
                    <ProgressRing value={goalPct} size={72} />
                    <div className="text-[12px] font-mono space-y-1">
                      <div>
                        <span className="text-muted">Aktuell </span>
                        {config.currentBalance.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                      </div>
                      <div>
                        <span className="text-muted">Ziel </span>
                        {config.profitTarget!.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                </Panel>
              )}

              <Panel
                title="Letzte Trades"
                actions={
                  <Link href="/journal" className="text-[11px] text-accent hover:underline">
                    Alle →
                  </Link>
                }
              >
                {recentTrades.length === 0 ? (
                  <p className="text-[12px] text-muted">Noch keine Trades.</p>
                ) : (
                  <div className="space-y-1.5">
                    {recentTrades.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between text-[12px] font-mono"
                      >
                        <span className="text-muted">{t.date.slice(5)}</span>
                        <span className="font-semibold">{t.pair}</span>
                        <span className={t.direction === "long" ? "text-up" : "text-down"}>
                          {t.direction === "long" ? "▲" : "▼"}
                        </span>
                        <span
                          className={`font-semibold ${
                            t.rMultiple > 0 ? "text-up" : t.rMultiple < 0 ? "text-down" : "text-muted"
                          }`}
                        >
                          {t.rMultiple > 0 ? "+" : ""}
                          {t.rMultiple.toFixed(1)}R
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
