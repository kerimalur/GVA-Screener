"use client";

import Link from "next/link";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import TimeSeriesChart, { type TimeSeriesPoint } from "@/components/charts/TimeSeriesChart";
import Panel from "@/components/layout/Panel";
import { chart, tooltipStyle, fmtDate } from "@/components/charts/chartTheme";
import type { CotCurrencyDetail } from "@/lib/data/cotIntel";
import { CCY_FLAGS } from "@/lib/constants/flags";
import { indexText } from "@/lib/calc/cotIntel";

function biasCls(bias: string): string {
  if (bias === "BULLISH") return "bg-up/15 text-up border-up/30";
  if (bias === "BEARISH") return "bg-down/15 text-down border-down/30";
  return "bg-surface2 text-muted border-border";
}
function scoreCls(v: number | null): string {
  if (v === null) return "text-faint";
  if (v >= 50) return "text-up";
  if (v > 0) return "text-up/80";
  if (v <= -50) return "text-down";
  if (v < 0) return "text-down/80";
  return "text-muted";
}
const fmt = (v: number | null) => (v === null ? "–" : v.toLocaleString("de-DE"));
const fmtD = (v: number | null) =>
  v === null ? "–" : `${v > 0 ? "+" : ""}${v.toLocaleString("de-DE")}`;

export default function CotCurrencyDetailView({ d }: { d: CotCurrencyDetail }) {
  const flag = CCY_FLAGS[d.ccy] ?? "🏳️";
  const s = d.signal;

  const tffData: TimeSeriesPoint[] = d.tff.map((p) => ({
    date: p.date,
    Dealer: p.dealerNet,
    "Asset Mgr": p.assetNet,
    "Lev Funds": p.levNet,
    "Other Rept.": p.otherNet,
    "Non-Rept.": p.retailNet,
  }));
  const legacyData: TimeSeriesPoint[] = d.legacy.map((p) => ({
    date: p.date,
    "Large Specs": p.ncNet,
    Commercials: p.commNet,
    "Small Traders": p.retailNet,
  }));
  const oiData: TimeSeriesPoint[] = d.legacy.map((p) => ({ date: p.date, "Open Interest": p.oi }));

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/cot/intelligence" className="text-[12px] font-mono text-accent hover:underline">
          ← COT Intelligence
        </Link>
        <span className="text-faint">/</span>
        <span className="text-[13px] font-mono font-bold">
          {flag} {d.ccy} — {d.label}
        </span>
        {d.latestDate && <span className="text-[11px] text-faint font-mono">Stand {d.latestDate}</span>}
      </div>

      {/* Signal + Narrativ */}
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
        <Panel title="Signal Engine">
          <div className="flex items-center justify-between mb-3">
            <span className={`text-4xl font-black font-mono ${scoreCls(s.score)}`}>
              {s.score > 0 ? "+" : ""}
              {s.score}
            </span>
            <div className="text-right">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${biasCls(s.bias)}`}>
                {s.bias}
              </span>
              <div className="text-[11px] font-mono text-muted mt-1">Confidence {s.confidence}%</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {s.groups.map((g) => (
              <div key={g.key} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted">{g.label}</span>
                <span className={scoreCls(g.score)}>
                  {g.index === null ? "–" : `Idx ${g.index.toFixed(0)}`}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Institutionelle Analyse">
          <ul className="space-y-2 text-[13px] leading-relaxed">
            {d.narrative.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">›</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            {s.groups.map((g) => (
              <div key={g.key} className="text-[11px] font-mono text-muted">
                {indexText(g.label, g.index)}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Charts */}
      <Panel title="TFF Netto-Positionen" subtitle="Dealer, Asset Manager, Leveraged Funds, Other, Non-Reportable">
        {tffData.length ? (
          <TimeSeriesChart
            data={tffData}
            defaultTimeframe="1J"
            refLineY={0}
            series={[
              { key: "Dealer", label: "Dealer", color: chart.palette[0] },
              { key: "Asset Mgr", label: "Asset Mgr", color: chart.palette[1] },
              { key: "Lev Funds", label: "Lev Funds", color: chart.palette[3] },
              { key: "Other Rept.", label: "Other Rept.", color: chart.palette[4] },
              { key: "Non-Rept.", label: "Non-Rept.", color: chart.palette[6] },
            ]}
          />
        ) : (
          <p className="text-muted text-sm font-mono">Keine TFF-Daten für diesen Contract.</p>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Legacy Netto-Positionen" subtitle="Large Specs, Commercials, Small Traders">
          <TimeSeriesChart
            data={legacyData}
            defaultTimeframe="1J"
            refLineY={0}
            height={260}
            series={[
              { key: "Large Specs", label: "Large Specs", color: chart.palette[0] },
              { key: "Commercials", label: "Commercials", color: chart.palette[2] },
              { key: "Small Traders", label: "Small Traders", color: chart.palette[3] },
            ]}
          />
        </Panel>
        <Panel title="Open Interest">
          <TimeSeriesChart
            data={oiData}
            defaultTimeframe="1J"
            height={260}
            series={[{ key: "Open Interest", label: "Open Interest", color: chart.accent }]}
          />
        </Panel>
      </div>

      <Panel title="COT Index" subtitle="Rolling-Perzentil der Non-Commercials-Nettoposition (260W) — 20/80 = Extremzonen">
        <CotIndexChart data={d.cotIndex} />
      </Panel>

      {/* Positionsübersicht */}
      <Panel title="Aktuelle Positionsübersicht" subtitle="Long/Short/Netto, Anteil am Open Interest, Δ zur Vorwoche">
        <div className="overflow-x-auto">
          <table className="text-[12px] min-w-[640px] w-full font-mono">
            <thead>
              <tr className="text-[9px] text-faint uppercase tracking-wider">
                <th className="text-left pb-1.5 pr-3">Kategorie</th>
                <th className="text-right pb-1.5 px-2">Long</th>
                <th className="text-right pb-1.5 px-2">Short</th>
                <th className="text-right pb-1.5 px-2">Net</th>
                <th className="text-right pb-1.5 px-2">% OI</th>
                <th className="text-right pb-1.5 px-2">Δ Long</th>
                <th className="text-right pb-1.5 px-2">Δ Short</th>
                <th className="text-right pb-1.5 pl-2">Δ Net</th>
              </tr>
            </thead>
            <tbody>
              {d.positions.map((p) => (
                <tr key={p.group} className="border-t border-border">
                  <td className="py-1.5 pr-3 font-sans font-semibold">{p.group}</td>
                  <td className="py-1.5 px-2 text-right">{fmt(p.long)}</td>
                  <td className="py-1.5 px-2 text-right">{fmt(p.short)}</td>
                  <td className={`py-1.5 px-2 text-right font-bold ${p.net >= 0 ? "text-up" : "text-down"}`}>
                    {fmtD(p.net)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-muted">
                    {p.pctOi === null ? "–" : `${p.pctOi.toFixed(1)}%`}
                  </td>
                  <td className={`py-1.5 px-2 text-right ${(p.dLong ?? 0) >= 0 ? "text-up/80" : "text-down/80"}`}>{fmtD(p.dLong)}</td>
                  <td className={`py-1.5 px-2 text-right ${(p.dShort ?? 0) >= 0 ? "text-up/80" : "text-down/80"}`}>{fmtD(p.dShort)}</td>
                  <td className={`py-1.5 pl-2 text-right ${(p.dNet ?? 0) >= 0 ? "text-up" : "text-down"}`}>{fmtD(p.dNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Long/Short-Verteilung */}
      <Panel title="Long vs. Short Verteilung" subtitle="% Long je Trader-Gruppe (aktuelle Woche)">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          {d.positions.map((p) => (
            <LongShortDonut key={p.group} group={p.group} long={p.long} short={p.short} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CotIndexChart({ data }: { data: Array<{ date: string; index: number | null }> }) {
  const rows = data.filter((d) => d.index !== null).slice(-260);
  if (rows.length === 0) return <p className="text-muted text-sm font-mono">Keine Daten.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fill: chart.text, fontSize: 10, fontFamily: "monospace" }} tickFormatter={fmtDate} stroke={chart.axis} minTickGap={40} />
        <YAxis domain={[0, 100]} tick={{ fill: chart.text, fontSize: 10, fontFamily: "monospace" }} stroke={chart.axis} width={35} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => [typeof v === "number" ? v.toFixed(0) : String(v), "COT-Index"]} />
        <ReferenceLine y={80} stroke={chart.up} strokeDasharray="4 4" />
        <ReferenceLine y={20} stroke={chart.down} strokeDasharray="4 4" />
        <Area type="monotone" dataKey="index" name="COT-Index" stroke={chart.accent} fill={chart.accent} fillOpacity={0.15} strokeWidth={1.5} dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function LongShortDonut({ group, long, short }: { group: string; long: number; short: number }) {
  const total = long + short;
  const longPct = total > 0 ? (long / total) * 100 : 0;
  const pie = [
    { name: "Long", value: long },
    { name: "Short", value: short },
  ];
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 110, height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pie} dataKey="value" innerRadius={34} outerRadius={50} startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={chart.up} />
              <Cell fill={chart.down} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[15px] font-bold font-mono">{longPct.toFixed(0)}%</span>
        </div>
      </div>
      <span className="text-[11px] text-muted font-mono mt-1">{group}</span>
    </div>
  );
}
