"use client";

import { useEffect, useMemo, useState } from "react";
import type { Season2Matrix, Season2Row } from "@/lib/ml/seasonality2";

/**
 * Saisonalität 2.0 Explorer — interaktiver Browser über die Season-Matrix.
 *
 * Zeigt saisonale Sub-Patterns (Monat, Woche-des-Monats, Quartalsende,
 * Regime-konditioniert) mit Forward-Return-Statistiken. Alles client-seitig
 * aggregiert — kein Server-Roundtrip bei Filterwechsel.
 */

type Horizon = 1 | 2 | 3 | 4;
type ViewMode = "month" | "wom" | "quarterEnd" | "regime" | "special";

const HORIZONS: { value: Horizon; label: string }[] = [
  { value: 1, label: "1W" },
  { value: 2, label: "2W" },
  { value: 3, label: "3W" },
  { value: 4, label: "4W" },
];

const MONTH_LABELS = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "month", label: "Monat" },
  { value: "wom", label: "Woche d. Monats" },
  { value: "quarterEnd", label: "Quartalsende" },
  { value: "regime", label: "Regime" },
  { value: "special", label: "Spezial-Fenster" },
];

// ── Stat-Helfer (identisch zu LaborExplorer) ──

interface Stat {
  n: number;
  wr: number | null;
  avg: number | null;
  sig: boolean;
}

function makeStat(n: number, hits: number, sumRet: number): Stat {
  if (n === 0) return { n: 0, wr: null, avg: null, sig: false };
  const p = hits / n;
  const se = Math.sqrt(0.25 / n);
  return {
    n,
    wr: p * 100,
    avg: sumRet / n,
    sig: Math.abs(p - 0.5) > 1.96 * se,
  };
}

function wrCls(s: Stat, minN: number): string {
  if (s.n < minN || s.wr === null) return "text-faint";
  if (!s.sig) return "text-muted";
  return s.wr >= 50 ? "text-up" : "text-down";
}

function wrBg(s: Stat, minN: number): string {
  if (s.n < minN || s.wr === null) return "";
  if (s.wr >= 57) return "bg-up/20";
  if (s.wr >= 53) return "bg-up/10";
  if (s.wr <= 43) return "bg-down/20";
  if (s.wr <= 47) return "bg-down/10";
  return "";
}

function fmtWr(s: Stat): string {
  return s.wr === null ? "–" : `${s.wr.toFixed(1)}%`;
}

function fmtAvg(s: Stat): string {
  return s.avg === null ? "–" : `${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(3)}%`;
}

// ── Aggregation ──

function retKey(h: Horizon): keyof Season2Row {
  return `ret${h}w` as keyof Season2Row;
}

function aggregate(
  rows: Season2Row[],
  horizon: Horizon,
  groupFn: (r: Season2Row) => string,
  directionFn: (r: Season2Row) => number, // 1=LONG, -1=SHORT, 0=skip
): Map<string, Stat> {
  const buckets = new Map<string, { n: number; hits: number; sumRet: number }>();
  const rk = retKey(horizon);

  for (const r of rows) {
    const ret = r[rk] as number | null;
    if (ret === null) continue;
    const dir = directionFn(r);
    if (dir === 0) continue;

    const key = groupFn(r);
    const b = buckets.get(key) ?? { n: 0, hits: 0, sumRet: 0 };
    const dirRet = dir * ret;
    b.n++;
    if (dirRet > 0) b.hits++;
    b.sumRet += dirRet;
    buckets.set(key, b);
  }

  const result = new Map<string, Stat>();
  for (const [key, b] of buckets) {
    result.set(key, makeStat(b.n, b.hits, b.sumRet));
  }
  return result;
}

// Saison-Richtung: monthAvgReturn > 0 → LONG, < 0 → SHORT
function seasonDirection(r: Season2Row): number {
  if (r.monthAvgReturn === null) return 0;
  if (r.monthAvgReturn > 0.05) return 1;   // leicht positiver Bias → LONG
  if (r.monthAvgReturn < -0.05) return -1;  // leicht negativer Bias → SHORT
  return 0;
}

// WoM-Richtung
function womDirection(r: Season2Row): number {
  if (r.womAvgReturn === null) return 0;
  if (r.womAvgReturn > 0.05) return 1;
  if (r.womAvgReturn < -0.05) return -1;
  return 0;
}

export default function SeasonExplorer() {
  const [matrix, setMatrix] = useState<Season2Matrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter
  const [horizon, setHorizon] = useState<Horizon>(2);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [periodYears, setPeriodYears] = useState(8);
  const [minN, setMinN] = useState(30);
  const [pairFilter, setPairFilter] = useState("all");

  useEffect(() => {
    fetch("/api/ml/season")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Season2Matrix) => { setMatrix(d); setLoading(false); })
      .catch((e) => { setError(e instanceof Error ? e.message : "Fehler"); setLoading(false); });
  }, []);

  // Gefilterte Zeilen
  const rows = useMemo(() => {
    if (!matrix) return [];
    const cutoffIdx = Math.max(0, matrix.weeks.length - periodYears * 52);
    let filtered = matrix.rows.filter((r) => r.weekIdx >= cutoffIdx);
    if (pairFilter !== "all") {
      const pi = matrix.pairs.indexOf(pairFilter);
      if (pi >= 0) filtered = filtered.filter((r) => r.pairIdx === pi);
    }
    return filtered;
  }, [matrix, periodYears, pairFilter]);

  // ── View: Monats-Heatmap ──
  const monthStats = useMemo(() => {
    if (viewMode !== "month") return null;
    return aggregate(rows, horizon, (r) => MONTH_LABELS[r.month - 1], seasonDirection);
  }, [rows, horizon, viewMode]);

  // ── View: Woche-des-Monats ──
  const womStats = useMemo(() => {
    if (viewMode !== "wom") return null;
    // Gruppiert nach Monat × WoM
    return aggregate(
      rows,
      horizon,
      (r) => `${MONTH_LABELS[r.month - 1]}-W${r.weekOfMonth}`,
      womDirection,
    );
  }, [rows, horizon, viewMode]);

  // ── View: Quartalsende ──
  const qeStats = useMemo(() => {
    if (viewMode !== "quarterEnd") return null;
    const qeRows = rows.filter((r) => r.isQuarterEnd === 1);
    const qeDir = (r: Season2Row): number => {
      if (r.qeAvgReturn === null) return 0;
      return r.qeAvgReturn > 0 ? 1 : r.qeAvgReturn < 0 ? -1 : 0;
    };
    return aggregate(qeRows, horizon, (r) => `Q${Math.ceil(r.month / 3)}`, qeDir);
  }, [rows, horizon, viewMode]);

  // ── View: Regime ──
  const regimeStats = useMemo(() => {
    if (viewMode !== "regime") return null;
    const riskOnDir = (r: Season2Row): number => {
      if (r.monthAvgRiskOn === null) return 0;
      return r.monthAvgRiskOn > 0.05 ? 1 : r.monthAvgRiskOn < -0.05 ? -1 : 0;
    };
    const riskOffDir = (r: Season2Row): number => {
      if (r.monthAvgRiskOff === null) return 0;
      return r.monthAvgRiskOff > 0.05 ? 1 : r.monthAvgRiskOff < -0.05 ? -1 : 0;
    };
    const on = aggregate(rows, horizon, (r) => MONTH_LABELS[r.month - 1], riskOnDir);
    const off = aggregate(rows, horizon, (r) => MONTH_LABELS[r.month - 1], riskOffDir);
    return { on, off };
  }, [rows, horizon, viewMode]);

  // ── View: Spezial-Fenster ──
  const specialStats = useMemo(() => {
    if (viewMode !== "special") return null;
    const yearEnd = aggregate(
      rows.filter((r) => r.isYearEnd === 1),
      horizon,
      () => "Jahresende",
      seasonDirection,
    );
    const yearStart = aggregate(
      rows.filter((r) => r.isYearStart === 1),
      horizon,
      () => "Jahresanfang",
      seasonDirection,
    );
    const monthFirst = aggregate(
      rows.filter((r) => r.isMonthFirstWeek === 1),
      horizon,
      () => "1. Monatswoche",
      seasonDirection,
    );
    const h1 = aggregate(
      rows.filter((r) => r.halfYear === 1),
      horizon,
      () => "H1 (Jan–Jun)",
      seasonDirection,
    );
    const h2 = aggregate(
      rows.filter((r) => r.halfYear === 2),
      horizon,
      () => "H2 (Jul–Dez)",
      seasonDirection,
    );
    return new Map([
      ...yearEnd, ...yearStart, ...monthFirst, ...h1, ...h2,
    ]);
  }, [rows, horizon, viewMode]);

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        <div className="animate-spin mr-3 h-5 w-5 rounded-full border-2 border-current border-t-transparent" />
        Season-Matrix wird berechnet …
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
        Fehler: {error}
      </div>
    );
  }

  if (!matrix) return null;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h2 className="text-lg font-semibold">Saisonalität 2.0 — Feature-Explorer</h2>
        <p className="text-sm text-muted mt-1">
          Erweiterte saisonale Patterns: Monat, Woche-des-Monats, Quartalsende, Regime-konditioniert.
          Alle Rolling (as-of), kein Lookahead. {rows.length.toLocaleString()} Datenpunkte.
        </p>
      </div>

      {/* ── Filter-Bar ── */}
      <div className="flex flex-wrap gap-4 items-center text-sm">
        {/* View-Mode */}
        <div className="flex items-center gap-2">
          <span className="text-faint">Ansicht:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {VIEW_MODES.map((v) => (
              <button
                key={v.value}
                onClick={() => setViewMode(v.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === v.value
                    ? "bg-surface2 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Horizont */}
        <div className="flex items-center gap-2">
          <span className="text-faint">Horizont:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {HORIZONS.map((h) => (
              <button
                key={h.value}
                onClick={() => setHorizon(h.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  horizon === h.value
                    ? "bg-surface2 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        {/* Zeitraum */}
        <div className="flex items-center gap-2">
          <span className="text-faint">Zeitraum:</span>
          <select
            value={periodYears}
            onChange={(e) => setPeriodYears(Number(e.target.value))}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs"
          >
            {[3, 5, 8, 10, 15, 17].map((y) => (
              <option key={y} value={y}>{y}J</option>
            ))}
          </select>
        </div>

        {/* Min N */}
        <div className="flex items-center gap-2">
          <span className="text-faint">Min n:</span>
          <select
            value={minN}
            onChange={(e) => setMinN(Number(e.target.value))}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs"
          >
            {[10, 20, 30, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* Pair-Filter */}
        <div className="flex items-center gap-2">
          <span className="text-faint">Pair:</span>
          <select
            value={pairFilter}
            onChange={(e) => setPairFilter(e.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs"
          >
            <option value="all">Alle 28</option>
            {matrix.pairs.map((p) => (
              <option key={p} value={p}>{p.replace("_", "/")}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Tabellen je View ── */}

      {viewMode === "month" && monthStats && (
        <StatTable title="Monats-Saisonalität" stats={monthStats} keys={MONTH_LABELS} minN={minN} />
      )}

      {viewMode === "wom" && womStats && (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            WR wenn die Rolling-WoM-Saisonalität &gt;±0.05% zeigt und man in deren Richtung tradet.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-faint font-medium">Monat</th>
                  {[1, 2, 3, 4, 5].map((w) => (
                    <th key={w} className="text-center py-2 px-3 text-faint font-medium">W{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTH_LABELS.map((m) => (
                  <tr key={m} className="border-b border-border/50 hover:bg-surface2/50">
                    <td className="py-2 px-3 font-medium">{m}</td>
                    {[1, 2, 3, 4, 5].map((w) => {
                      const key = `${m}-W${w}`;
                      const s = womStats.get(key) ?? { n: 0, wr: null, avg: null, sig: false };
                      return (
                        <td key={w} className={`py-2 px-3 text-center font-mono ${wrCls(s, minN)} ${wrBg(s, minN)}`}>
                          {fmtWr(s)}
                          <span className="block text-[10px] text-faint">n={s.n}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === "quarterEnd" && qeStats && (
        <StatTable title="Quartalsende-Effekt" stats={qeStats} keys={["Q1", "Q2", "Q3", "Q4"]} minN={minN} />
      )}

      {viewMode === "regime" && regimeStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold mb-2 text-up">Risk-On Jahre (SPX ↑)</h3>
            <StatTable stats={regimeStats.on} keys={MONTH_LABELS} minN={minN} />
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2 text-down">Risk-Off Jahre (SPX ↓)</h3>
            <StatTable stats={regimeStats.off} keys={MONTH_LABELS} minN={minN} />
          </div>
        </div>
      )}

      {viewMode === "special" && specialStats && (
        <StatTable
          title="Spezial-Fenster"
          stats={specialStats}
          keys={["Jahresende", "Jahresanfang", "1. Monatswoche", "H1 (Jan–Jun)", "H2 (Jul–Dez)"]}
          minN={minN}
        />
      )}

      {/* ── Legende ── */}
      <div className="text-[10px] text-faint border-t border-border pt-3 flex flex-wrap gap-4">
        <span><span className="inline-block w-3 h-3 rounded bg-up/20 mr-1" /> WR ≥57%</span>
        <span><span className="inline-block w-3 h-3 rounded bg-up/10 mr-1" /> WR 53–57%</span>
        <span><span className="inline-block w-3 h-3 rounded bg-down/10 mr-1" /> WR 47–43%</span>
        <span><span className="inline-block w-3 h-3 rounded bg-down/20 mr-1" /> WR ≤43%</span>
        <span className="text-muted">Grau = nicht signifikant (p&gt;0.05)</span>
        <span className="text-faint">Blass = n &lt; Min</span>
      </div>
    </div>
  );
}

// ── Reusable Stat-Tabelle ──

function StatTable({
  title,
  stats,
  keys,
  minN,
}: {
  title?: string;
  stats: Map<string, Stat>;
  keys: string[];
  minN: number;
}) {
  return (
    <div>
      {title && <h3 className="text-sm font-semibold mb-2">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-faint font-medium w-32">Gruppe</th>
              <th className="text-center py-2 px-3 text-faint font-medium">WR</th>
              <th className="text-center py-2 px-3 text-faint font-medium">Ø Return</th>
              <th className="text-center py-2 px-3 text-faint font-medium">n</th>
              <th className="text-center py-2 px-3 text-faint font-medium">Sig</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const s = stats.get(key) ?? { n: 0, wr: null, avg: null, sig: false };
              return (
                <tr key={key} className={`border-b border-border/50 hover:bg-surface2/50 ${wrBg(s, minN)}`}>
                  <td className="py-2 px-3 font-medium">{key}</td>
                  <td className={`py-2 px-3 text-center font-mono ${wrCls(s, minN)}`}>
                    {fmtWr(s)}
                  </td>
                  <td className={`py-2 px-3 text-center font-mono ${
                    s.avg !== null && s.avg > 0 ? "text-up" : s.avg !== null && s.avg < 0 ? "text-down" : "text-faint"
                  }`}>
                    {fmtAvg(s)}
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-faint">{s.n}</td>
                  <td className="py-2 px-3 text-center">
                    {s.sig ? <span className="text-up">✓</span> : <span className="text-faint">–</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
