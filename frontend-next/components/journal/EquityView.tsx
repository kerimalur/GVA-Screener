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
  const results = [...trades].sort((a, b) => a.date.localeCompare(b.date)).slice(-maxDots).map((t) => t.result);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      {results.map((r, i) => (
        <span key={i} style={{
          width: "7px", height: "7px", borderRadius: "50%",
          background: r === "win" ? "var(--color-up)" : r === "loss" ? "var(--color-down)" : "var(--color-faint)",
        }} />
      ))}
    </div>
  );
}

const KPI_ITEMS = (stats: ReturnType<typeof calculateTradeStatistics>, dd: ReturnType<typeof calculateDrawdown>) => [
  { label: "Total R", value: `${stats.totalR >= 0 ? "+" : ""}${stats.totalR.toFixed(2)}`, color: stats.totalR >= 0 ? "var(--color-up)" : "var(--color-down)" },
  { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%`, color: "" },
  { label: "Profit Factor", value: stats.profitFactor === Infinity ? "\u221e" : stats.profitFactor.toFixed(2), color: "" },
  { label: "Max Drawdown", value: `\u2212${dd.maxDrawdown.toFixed(2)} R`, color: "var(--color-down)" },
  { label: "Expectancy", value: `${stats.expectancy >= 0 ? "+" : ""}${stats.expectancy.toFixed(3)}`, color: stats.expectancy >= 0 ? "var(--color-up)" : "var(--color-down)" },
  { label: "Sharpe Ratio", value: stats.sharpeRatio.toFixed(2), color: stats.sharpeRatio >= 1 ? "var(--color-up)" : "" },
];

export default function EquityView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [configs, setConfigs] = useState<AccountConfigs | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState<AccountType>("funded");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [showDrawdown, setShowDrawdown] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadTrades(), loadAccountConfigs()])
      .then(([t, c]) => { setTrades(t); setConfigs(c); })
      .catch(() => toast.error("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  const filteredTrades = useMemo(() => trades.filter((trade) => {
    if (trade.type !== accountFilter || trade.sessionType !== "live") return false;
    if (timeFilter !== "all") {
      const cutoff = new Date();
      if (timeFilter === "month") cutoff.setMonth(cutoff.getMonth() - 1);
      if (timeFilter === "quarter") cutoff.setMonth(cutoff.getMonth() - 3);
      if (timeFilter === "year") cutoff.setFullYear(cutoff.getFullYear() - 1);
      if (new Date(trade.date) < cutoff) return false;
    }
    return true;
  }), [trades, accountFilter, timeFilter]);

  const stats = useMemo(() => calculateTradeStatistics(filteredTrades), [filteredTrades]);
  const dd = useMemo(() => calculateDrawdown(filteredTrades), [filteredTrades]);
  const streaks = useMemo(() => calculateStreaks(filteredTrades), [filteredTrades]);
  const bestTrade = filteredTrades.reduce((m, t) => Math.max(m, t.rMultiple || 0), 0);
  const worstTrade = filteredTrades.reduce((m, t) => Math.min(m, t.rMultiple || 0), 0);
  const startBalance = (accountFilter === "ek" ? configs?.ek?.initialStartBalance : configs?.funded?.initialStartBalance) ?? (accountFilter === "ek" ? 10000 : 100000);
  const currency = (accountFilter === "ek" ? configs?.ek?.currency : configs?.funded?.currency) ?? "USD";

  if (loading) return <Panel><SkeletonRows rows={8} /></Panel>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }} className="anim-fade-in">

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <Segmented options={[{ value: "funded" as const, label: "Funded" }, { value: "ek" as const, label: "EK" }]} value={accountFilter} onChange={setAccountFilter} />
          <Segmented options={[{ value: "all" as const, label: "Alle" }, { value: "month" as const, label: "1M" }, { value: "quarter" as const, label: "3M" }, { value: "year" as const, label: "1J" }]} value={timeFilter} onChange={setTimeFilter} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "var(--color-muted)", cursor: "pointer" }}>
            <span style={{
              width: "16px", height: "16px", borderRadius: "5px",
              background: showDrawdown ? "var(--color-accent)" : "var(--color-surface2)",
              border: `1px solid ${showDrawdown ? "var(--color-accent)" : "var(--color-border2)"}`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }} onClick={() => setShowDrawdown(!showDrawdown)}>
              {showDrawdown && <span style={{ color: "var(--color-active)", fontSize: "10px", fontWeight: 700 }}>✓</span>}
            </span>
            Drawdown anzeigen
          </label>
          <StreakDots trades={filteredTrades} />
        </div>
      </div>

      {/* 6 KPI Cards — 5-column like design (6 items, last wraps or stays) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "14px" }}>
        {KPI_ITEMS(stats, dd).map(({ label, value, color }) => (
          <div key={label} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "18px 20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.8px", color: "var(--color-faint)", textTransform: "uppercase", marginBottom: "8px" }}>{label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "22px", fontWeight: 600, color: color || "var(--color-text)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Equity Chart */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "18px", padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ fontSize: "14.5px", fontWeight: 700 }}>Equity-Kurve</div>
          <div style={{ fontSize: "12px", color: "var(--color-faint)", fontFamily: "var(--font-mono)" }}>
            Start-Balance {startBalance.toLocaleString("de-DE")} {currency}
          </div>
        </div>
        {filteredTrades.length === 0 ? (
          <EmptyState icon="ph-chart-line" title="Keine Trades im Zeitraum" description="Passe Filter an oder journale deinen ersten Trade." />
        ) : (
          <EquityChart trades={filteredTrades} startBalance={startBalance} showDrawdown={showDrawdown} height={300} />
        )}
      </div>

      {/* Secondary Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "18px" }}>
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "18px", padding: "26px" }}>
          <div style={{ fontSize: "14.5px", fontWeight: 700, marginBottom: "22px" }}>R-Multiple-Verteilung</div>
          <RMultipleChart trades={filteredTrades} height={180} />
        </div>
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "18px", padding: "26px" }}>
          <div style={{ fontSize: "14.5px", fontWeight: 700, marginBottom: "22px" }}>Ergebnis</div>
          <WinRateChart trades={filteredTrades} height={150} />
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
            {[
              { label: "Best Trade", value: `+${bestTrade.toFixed(1)}R`, color: "var(--color-up)" },
              { label: "Worst Trade", value: `${worstTrade.toFixed(1)}R`, color: "var(--color-down)" },
              { label: "Win-Serie (max)", value: String(streaks.maxWinStreak), color: "var(--color-up)" },
              { label: "Loss-Serie (max)", value: String(streaks.maxLossStreak), color: "var(--color-down)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-muted)" }}>{label}</span>
                <span style={{ fontFamily: "var(--font-mono)", color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
