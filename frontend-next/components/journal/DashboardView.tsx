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
import ExpectancyCard from "./ExpectancyCard";
import type { AccountConfigs, AccountType, Trade } from "@/lib/journal/types";
import { loadTrades } from "@/lib/journal/trades";
import { loadAccountConfigs } from "@/lib/journal/accounts";
import { calculateTradeStatistics, calculateDrawdown, calculateStreaks } from "@/lib/journal/stats";
import { payoffSplit, type PayoffBucket } from "@/lib/journal/discipline";

/** A+ vs. Nicht-A+ — sichtbarer Beweis, ob die A+-Selektion die Winrate hebt.
 *  Zählt nur Trades, die mit Checkliste geloggt wurden (Verdikt vorhanden). */
function PayoffPanel({ trades }: { trades: Trade[] }) {
  const split = useMemo(() => payoffSplit(trades), [trades]);
  const col = (title: string, b: PayoffBucket, tone: "up" | "warn") => (
    <div style={{ flex: 1, background: "var(--color-surface2)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: `var(--color-${tone})`, marginBottom: "10px" }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", fontFamily: "var(--font-mono)" }}>
        <div>
          <div style={{ fontSize: "10px", color: "var(--color-faint)", textTransform: "uppercase" }}>Trades</div>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>{b.n}</div>
        </div>
        <div>
          <div style={{ fontSize: "10px", color: "var(--color-faint)", textTransform: "uppercase" }}>Winrate</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: b.winratePct != null && b.winratePct >= 50 ? "var(--color-up)" : "var(--color-down)" }}>
            {b.winratePct != null ? `${b.winratePct.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "10px", color: "var(--color-faint)", textTransform: "uppercase" }}>Ø Adherence</div>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>
            {b.avgAdherence != null ? `${b.avgAdherence.toFixed(0)}%` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
  const none = split.aplus.n === 0 && split.rest.n === 0;
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "20px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.8px", color: "var(--color-faint)", textTransform: "uppercase", marginBottom: "12px" }}>
        A+ vs. Nicht-A+ — zahlt sich die Selektion aus?
      </div>
      {none ? (
        <p style={{ fontSize: "12px", color: "var(--color-faint)" }}>
          Noch keine Trades mit A+-Checkliste geloggt. Ab dem nächsten Trade füllt sich der Vergleich.
        </p>
      ) : (
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          {col("A+ Setups", split.aplus, "up")}
          {col("Nicht A+", split.rest, "warn")}
        </div>
      )}
    </div>
  );
}

export default function DashboardView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [configs, setConfigs] = useState<AccountConfigs | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>("funded");

  useEffect(() => {
    setLoading(true);
    Promise.all([loadTrades(), loadAccountConfigs()])
      .then(([t, c]) => { setTrades(t); setConfigs(c); })
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
    () => [...accountTrades]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8),
    [accountTrades],
  );
  const goalPct =
    config?.enableGoals && config.profitTarget && config.profitTarget > 0
      ? Math.min((config.currentBalance / config.profitTarget) * 100, 100)
      : null;
  const currency = config?.currency || "USD";

  if (loading) {
    return <Panel><SkeletonRows rows={8} /></Panel>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }} className="anim-fade-in">

      {/* Tab + Streak */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Segmented
          options={[
            { value: "funded" as const, label: "Funded", icon: "ph-buildings" },
            { value: "ek" as const, label: "Eigenkapital", icon: "ph-wallet" },
          ]}
          value={accountType}
          onChange={setAccountType}
        />
        {streaks.currentStreak > 0 && streaks.streakType && (
          <Badge tone={streaks.streakType === "win" ? "up" : "down"} icon={streaks.streakType === "win" ? "ph-fire" : "ph-snowflake"}>
            {streaks.currentStreak}× {streaks.streakType === "win" ? "Win" : "Loss"} in Folge
          </Badge>
        )}
      </div>

      {!config ? (
        <Panel>
          <EmptyState
            icon="ph-gauge"
            title="Kein Konto eingerichtet"
            description="Lege im Journal zuerst ein Konto an."
            action={<Link href="/journal" style={{ color: "var(--color-accent)", fontSize: "13px" }}>Zum Journal →</Link>}
          />
        </Panel>
      ) : (
        <>
          {/* 3 Hero-Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px" }}>
            <StatCard
              size="lg"
              label="Kontostand"
              value={config.currentBalance.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
              deltaLabel={`${currency} · ${accountType === "funded" ? "Funded" : "Eigenkapital"}`}
            />
            <StatCard
              size="lg"
              label="Gewinn / Verlust"
              value={
                <span style={{ color: totalProfit > 0 ? "var(--color-up)" : totalProfit < 0 ? "var(--color-down)" : "" }}>
                  {totalProfit > 0 ? "+" : ""}{totalProfit.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                </span>
              }
              deltaLabel={`${currency} seit Start`}
            />
            <StatCard
              size="lg"
              label="Total R"
              value={
                <span style={{ color: stats.totalR >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
                  {stats.totalR >= 0 ? "+" : ""}{stats.totalR.toFixed(2)}
                </span>
              }
              deltaLabel={`Ø ${stats.avgR.toFixed(2)}R · ${stats.totalTrades} Trades`}
            />
          </div>

          {/* Secondary KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginTop: "-4px" }}>
            <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} deltaLabel={`${stats.wins}W / ${stats.losses}L / ${stats.breakevens}BE`} />
            <StatCard label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} deltaLabel={`Expectancy ${stats.expectancy >= 0 ? "+" : ""}${stats.expectancy.toFixed(3)}`} />
            <StatCard label="Max Drawdown" value={<span style={{ color: "var(--color-down)" }}>−{dd.maxDrawdown.toFixed(2)} R</span>} deltaLabel={`aktuell −${dd.currentDrawdown.toFixed(2)} R`} />
          </div>

          {/* Disziplin-System: Expectancy + A+-Payoff */}
          <ExpectancyCard trades={accountTrades} />
          <PayoffPanel trades={accountTrades} />

          {/* Equity + Recent */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 288px", gap: "18px" }}>
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "18px", padding: "26px" }}>
              <div style={{ fontSize: "14.5px", fontWeight: 700, marginBottom: "18px" }}>Equity-Verlauf</div>
              {accountTrades.length === 0 ? (
                <EmptyState icon="ph-chart-line" title="Noch keine Trades" description="Sobald du Trades journalst, erscheint hier deine Equity-Kurve." />
              ) : (
                <EquityChart trades={accountTrades} startBalance={config.initialStartBalance} showDrawdown={false} height={260} />
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {goalPct != null && (
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "20px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.8px", color: "var(--color-faint)", textTransform: "uppercase", marginBottom: "14px" }}>Kontoziel</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <ProgressRing value={goalPct} size={64} />
                    <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", lineHeight: 1.7 }}>
                      <div><span style={{ color: "var(--color-faint)" }}>Aktuell </span>{config.currentBalance.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</div>
                      <div><span style={{ color: "var(--color-faint)" }}>Ziel </span>{config.profitTarget!.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "20px", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.8px", color: "var(--color-faint)", textTransform: "uppercase" }}>Letzte Trades</div>
                  <Link href="/journal" style={{ fontSize: "11px", color: "var(--color-accent)", textDecoration: "none" }}>Alle →</Link>
                </div>
                {recentTrades.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "var(--color-faint)" }}>Noch keine Trades.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {recentTrades.map((t) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                        <span style={{ color: "var(--color-faint)" }}>{t.date.slice(5)}</span>
                        <span style={{ fontWeight: 600 }}>{t.pair}</span>
                        <span style={{ color: t.direction === "long" ? "var(--color-up)" : "var(--color-down)" }}>{t.direction === "long" ? "▲" : "▼"}</span>
                        <span style={{ fontWeight: 600, color: t.rMultiple > 0 ? "var(--color-up)" : t.rMultiple < 0 ? "var(--color-down)" : "var(--color-faint)" }}>
                          {t.rMultiple > 0 ? "+" : ""}{t.rMultiple.toFixed(1)}R
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
