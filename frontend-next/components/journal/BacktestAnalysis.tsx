"use client";

import { useMemo, useState } from "react";
import Panel from "@/components/layout/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Label } from "@/components/ui/Field";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { chart, tooltipStyle, fmtDate } from "@/components/charts/chartTheme";
import { SETUP_DEFINITIONS, getProblems } from "@/lib/journal/types";
import {
  computeStats,
  buildEquityByDate,
  computeSetupStats,
  computeProblemStats,
  filterTrades,
  isFilterActive,
  EMPTY_FILTER,
  EQUITY_PERIODS,
  MIN_SAMPLE,
  type BacktestSession,
  type BacktestTrade,
  type EquityPeriod,
  type TradeFilter,
  type CategoryStat,
} from "@/lib/journal/backtests";

function PerformanceTable({
  title,
  rows,
  emptyHint,
}: {
  title: string;
  rows: CategoryStat[];
  emptyHint: string;
}) {
  return (
    <Panel title={title} subtitle={`verlässlich ab n≥${MIN_SAMPLE}`}>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted py-2">{emptyHint}</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-faint border-b border-border">
              <th className="py-1.5 font-semibold">Kategorie</th>
              <th className="py-1.5 font-semibold text-right">n</th>
              <th className="py-1.5 font-semibold text-right">WR</th>
              <th className="py-1.5 font-semibold text-right">Σ R</th>
              <th className="py-1.5 font-semibold text-right">Erwartung/Trade</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/50 last:border-0">
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    {r.color && (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                    )}
                    {r.label}
                    {!r.reliable && (
                      <span className="text-[9px] text-faint" title={`Stichprobe < ${MIN_SAMPLE}`}>
                        (n klein)
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-1.5 text-right font-mono text-muted">{r.n}</td>
                <td className="py-1.5 text-right font-mono">{r.winRate.toFixed(0)}%</td>
                <td
                  className={`py-1.5 text-right font-mono ${
                    r.totalR > 0 ? "text-up" : r.totalR < 0 ? "text-down" : "text-muted"
                  }`}
                >
                  {r.totalR > 0 ? "+" : ""}
                  {r.totalR.toFixed(1)}
                </td>
                <td
                  className={`py-1.5 text-right font-mono font-semibold ${
                    r.expectancy > 0 ? "text-up" : r.expectancy < 0 ? "text-down" : "text-muted"
                  }`}
                >
                  {r.expectancy > 0 ? "+" : ""}
                  {r.expectancy.toFixed(2)} R
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

interface Props {
  session: BacktestSession;
  onContinue: () => void;
  onBack: () => void;
  onDeleteTrade: (tradeId: string) => void;
}

export default function BacktestAnalysis({ session, onContinue, onBack, onDeleteTrade }: Props) {
  const [period, setPeriod] = useState<EquityPeriod>("all");
  const [filter, setFilter] = useState<TradeFilter>(EMPTY_FILTER);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const filtered = useMemo(() => filterTrades(session.trades, filter), [session.trades, filter]);
  const stats = useMemo(
    () => computeStats(filtered, session.accountSize, session.riskPercent),
    [filtered, session.accountSize, session.riskPercent],
  );
  const equity = useMemo(
    () => buildEquityByDate(filtered, period, session.accountSize, session.riskPercent),
    [filtered, period, session.accountSize, session.riskPercent],
  );
  const setupStats = useMemo(() => computeSetupStats(filtered), [filtered]);
  const problemStats = useMemo(() => computeProblemStats(filtered), [filtered]);
  const problemOptions = getProblems();

  return (
    <div className="space-y-4 anim-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon="ph-arrow-left" onClick={onBack}>
          Sessions
        </Button>
        <h2 className="text-sm font-semibold">{session.name}</h2>
        {session.isCompleted && <Badge tone="accent">abgeschlossen</Badge>}
        <div className="ml-auto">
          {!session.isCompleted && (
            <Button size="sm" icon="ph-play" onClick={onContinue}>
              Weiter testen
            </Button>
          )}
        </div>
      </div>

      {/* KPI-Leiste */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 px-1 text-[12px] font-mono">
        <span className="text-muted">{stats.totalTrades} Trades</span>
        <span className={stats.totalR >= 0 ? "text-up" : "text-down"}>
          {stats.totalR >= 0 ? "+" : ""}
          {stats.totalR.toFixed(1)} R (Ø {stats.avgR.toFixed(2)})
        </span>
        <span className="text-muted">{stats.winRate.toFixed(1)}% WR</span>
        <span className="text-muted">
          PF {stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
        </span>
        {stats.hasEur && (
          <>
            <span className={stats.totalEur >= 0 ? "text-up" : "text-down"}>
              {stats.totalEur >= 0 ? "+" : ""}
              {stats.totalEur.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
            </span>
            <span className="text-muted">
              Konto {stats.accountEnd.toLocaleString("de-DE", { maximumFractionDigits: 0 })} (
              {stats.growthPct >= 0 ? "+" : ""}
              {stats.growthPct.toFixed(1)}%)
            </span>
          </>
        )}
      </div>

      {/* Equity */}
      <Panel
        title={`Equity ${stats.hasEur ? "(€)" : "(R)"}`}
        actions={
          <Segmented options={EQUITY_PERIODS.map((p) => ({ value: p.key, label: p.label }))} value={period} onChange={setPeriod} />
        }
      >
        {equity.length === 0 ? (
          <EmptyState icon="ph-chart-line" title="Keine Daten im Zeitraum" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={equity} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="btFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chart.accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={chart.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: chart.text, fontSize: 10 }}
                stroke={chart.axis}
                tickFormatter={(d) => fmtDate(String(d))}
                minTickGap={40}
              />
              <YAxis tick={{ fill: chart.text, fontSize: 10 }} stroke={chart.axis} width={64} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(d) => fmtDate(String(d))}
                formatter={(v) => [Number(v).toLocaleString("de-DE"), stats.hasEur ? "€" : "R"]}
              />
              <Area type="monotone" dataKey="equity" stroke={chart.accent} strokeWidth={2} fill="url(#btFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* Filter */}
      <Panel title="Filter" subtitle="alle gesetzten Kriterien müssen zutreffen">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Setups</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(SETUP_DEFINITIONS).map(([key, s]) => {
                const on = filter.setups.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() =>
                      setFilter((f) => ({
                        ...f,
                        setups: on ? f.setups.filter((x) => x !== key) : [...f.setups, key],
                      }))
                    }
                    className="px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors"
                    style={
                      on
                        ? { backgroundColor: `${s.color}20`, borderColor: s.color, color: s.color }
                        : { borderColor: "var(--color-border2)", color: "var(--color-muted)" }
                    }
                  >
                    {s.short}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Probleme</Label>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {problemOptions.map((p) => {
                const on = filter.problems.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() =>
                      setFilter((f) => ({
                        ...f,
                        problems: on ? f.problems.filter((x) => x !== p) : [...f.problems, p],
                      }))
                    }
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      on
                        ? "bg-down/15 text-down border-down/50"
                        : "bg-bg text-muted border-border2 hover:text-text"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Stichwort</Label>
            <div className="flex gap-1.5">
              <Input
                value={filter.keyword}
                onChange={(e) => setFilter((f) => ({ ...f, keyword: e.target.value }))}
                placeholder="Notizen durchsuchen…"
              />
              {isFilterActive(filter) && (
                <Button variant="subtle" size="sm" onClick={() => setFilter(EMPTY_FILTER)}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* Setup-/Problem-Performance */}
      <div className="grid lg:grid-cols-2 gap-4">
        <PerformanceTable
          title="Performance je Setup"
          rows={setupStats}
          emptyHint="Noch keine Trades mit Setups."
        />
        <PerformanceTable
          title="Leaks: Performance je Problem"
          rows={problemStats}
          emptyHint="Keine Problem-Tags vergeben — gut so."
        />
      </div>

      {/* Trade-Liste */}
      <Panel title={`Trades (${filtered.length})`}>
        {filtered.length === 0 ? (
          <p className="text-[12px] text-muted py-2">Keine Trades im Filter.</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {[...filtered].reverse().map((t: BacktestTrade) => (
              <div
                key={t.id}
                className="flex items-center gap-3 text-[12px] font-mono py-1.5 px-2 rounded bg-bg border border-border/60"
              >
                <span className="text-muted">{t.date}</span>
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
                  {t.rMultiple.toFixed(1)} R
                </span>
                <span className="flex gap-1">
                  {t.setups.map((s) => {
                    const def = SETUP_DEFINITIONS[s];
                    return (
                      <span
                        key={s}
                        className="px-1 rounded text-[9px] font-bold"
                        style={{ backgroundColor: `${def?.color || "#666"}20`, color: def?.color }}
                      >
                        {def?.short || s}
                      </span>
                    );
                  })}
                </span>
                {t.problems.length > 0 && (
                  <span className="text-[10px] text-down truncate max-w-40" title={t.problems.join(", ")}>
                    {t.problems.join(", ")}
                  </span>
                )}
                {t.notes && (
                  <span className="text-[10px] text-muted truncate max-w-48" title={t.notes}>
                    {t.notes}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  {t.screenshot && (
                    <button
                      onClick={() => setViewImage(t.screenshot!)}
                      className="text-faint hover:text-accent transition-colors"
                      title="Screenshot"
                    >
                      <i className="ph-bold ph-image" />
                    </button>
                  )}
                  <button
                    onClick={() => confirm("Trade löschen?") && onDeleteTrade(t.id)}
                    className="text-faint hover:text-down transition-colors"
                    title="Löschen"
                  >
                    <i className="ph-bold ph-trash" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {viewImage && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-6 cursor-zoom-out anim-fade-in"
          onClick={() => setViewImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewImage} alt="Screenshot" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
