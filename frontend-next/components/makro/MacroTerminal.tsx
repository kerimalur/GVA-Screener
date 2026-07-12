"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MacroTerminalData } from "@/lib/data/macroTerminal";
import type { MacroScore, SubScores } from "@/lib/calc/macroScore";
import { SUBSCORE_LABELS, REGIME_STYLE } from "@/lib/calc/macroScore";
import { seriesFor, type FredCategory } from "@/lib/constants/fredSeries";

type Tab = "cards" | "breakdown" | "cb";

function scoreCls(v: number): string {
  if (v >= 50) return "text-up";
  if (v > 0) return "text-up/80";
  if (v <= -50) return "text-down";
  if (v < 0) return "text-down/80";
  return "text-muted";
}

function cellBg(v: number): string {
  if (v >= 50) return "bg-up/20";
  if (v > 0) return "bg-up/10";
  if (v <= -50) return "bg-down/20";
  if (v < 0) return "bg-down/10";
  return "";
}

function biasBadge(bias: string): string {
  if (bias === "LONG") return "bg-up/15 text-up border-up/30";
  if (bias === "SHORT") return "bg-down/15 text-down border-down/30";
  return "bg-surface2 text-muted border-border";
}

function fmtPct(v: number | null, digits = 2): string {
  return v === null ? "–" : `${v.toFixed(digits)}%`;
}

export default function MacroTerminal() {
  const [data, setData] = useState<MacroTerminalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("cards");

  useEffect(() => {
    fetch("/api/makro/terminal")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => (d.error ? Promise.reject(new Error(d.error)) : setData(d)))
      .catch((e) => setError(e instanceof Error ? e.message : "Fehler"));
  }, []);

  const staleMap = useMemo(() => new Map(data?.staleFlags ?? []), [data]);
  const isStale = (ccy: string, cat: FredCategory) => {
    const id = seriesFor(ccy, cat)?.id;
    return id ? staleMap.get(id) === true : false;
  };
  const warn = (ccy: string, cat: FredCategory) =>
    isStale(ccy, cat) ? <span title="Serie veraltet — letzter bekannter Wert">{" ⚠️"}</span> : null;

  if (error) return <p className="text-down text-sm font-mono">Ladefehler: {error}</p>;
  if (!data)
    return (
      <p className="text-muted text-sm font-mono animate-pulse">
        Lade G8-Fundamentaldaten (FRED) …
      </p>
    );

  const seg = (active: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
      active ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-text"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex gap-1.5 border-b border-border pb-3">
        {(
          [
            ["cards", "G10 Dashboard"],
            ["breakdown", "Score Breakdown"],
            ["cb", "Central Bank Monitor"],
          ] as Array<[Tab, string]>
        ).map(([k, l]) => (
          <button key={k} className={seg(tab === k)} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "cards" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {data.scores.map((s) => (
            <CurrencyCard key={s.ccy} s={s} warn={warn} />
          ))}
        </div>
      )}

      {tab === "breakdown" && <Breakdown scores={data.scores} />}
      {tab === "cb" && <CentralBankMonitor scores={data.scores} warn={warn} />}
    </div>
  );
}

function CurrencyCard({
  s,
  warn,
}: {
  s: MacroScore;
  warn: (ccy: string, cat: FredCategory) => ReactNode;
}) {
  const regime = REGIME_STYLE[s.regime];
  return (
    <div className="rounded-lg border border-border bg-surface2 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{s.flag}</span>
          <span className="font-mono font-bold text-[15px]">{s.ccy}</span>
        </div>
        <span className={`text-2xl font-black font-mono ${scoreCls(s.total)}`}>
          {s.total > 0 ? "+" : ""}
          {s.total}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${regime.cls}`}>
          {regime.label}
        </span>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${biasBadge(
            s.swingBias,
          )}`}
        >
          {s.swingBias}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center font-mono pt-1 border-t border-border">
        <div>
          <div className="text-[9px] text-faint uppercase tracking-wider">Rate</div>
          <div className="text-[13px] font-bold mt-0.5">
            {fmtPct(s.policyRate)}
            {warn(s.ccy, "policy_rate")}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-faint uppercase tracking-wider">CPI YoY</div>
          <div className="text-[13px] font-bold mt-0.5">
            {fmtPct(s.cpiYoY, 1)}
            {warn(s.ccy, "cpi")}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-faint uppercase tracking-wider">10Y</div>
          <div className="text-[13px] font-bold mt-0.5">
            {fmtPct(s.yield10)}
            {warn(s.ccy, "yield_10y")}
          </div>
        </div>
      </div>
    </div>
  );
}

function Breakdown({ scores }: { scores: MacroScore[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] min-w-[760px] w-full">
        <thead>
          <tr className="text-[9px] text-faint font-mono uppercase tracking-wider">
            <th className="text-left pb-1.5 pr-3">CCY</th>
            {SUBSCORE_LABELS.map((c) => (
              <th key={c.key} className="text-right pb-1.5 px-2">
                {c.label}
              </th>
            ))}
            <th className="text-right pb-1.5 px-2">TOTAL</th>
            <th className="text-right pb-1.5 pl-2">BIAS</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => (
            <tr key={s.ccy} className="border-t border-border">
              <td className="py-1.5 pr-3 font-mono font-bold">
                {s.flag} {s.ccy}
              </td>
              {SUBSCORE_LABELS.map((c) => {
                const v = s.scores[c.key as keyof SubScores];
                return (
                  <td
                    key={c.key}
                    className={`py-1.5 px-2 text-right font-mono ${scoreCls(v)} ${cellBg(v)}`}
                  >
                    {v > 0 ? "+" : ""}
                    {v}
                  </td>
                );
              })}
              <td className={`py-1.5 px-2 text-right font-mono font-bold ${scoreCls(s.total)}`}>
                {s.total > 0 ? "+" : ""}
                {s.total}
              </td>
              <td className="py-1.5 pl-2 text-right">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${biasBadge(
                    s.swingBias,
                  )}`}
                >
                  {s.swingBias}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-faint mt-2 leading-relaxed">
        Sub-Scores −100..+100. Blau/Grün = positiv für die Währung, Rot = negativ, grau = neutral.
        TOTAL = gleichgewichteter Durchschnitt. BIAS ab ±15.
      </p>
    </div>
  );
}

function CentralBankMonitor({
  scores,
  warn,
}: {
  scores: MacroScore[];
  warn: (ccy: string, cat: FredCategory) => ReactNode;
}) {
  const qeqt: Record<string, string> = { QE: "QE 🟢", QT: "QT 🔴", HOLD: "HOLD 🟡", NONE: "—" };
  const pbCls: Record<string, string> = {
    HAWKISH: "text-up",
    DOVISH: "text-down",
    NEUTRAL: "text-muted",
  };
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] min-w-[820px] w-full">
        <thead>
          <tr className="text-[9px] text-faint font-mono uppercase tracking-wider">
            <th className="text-left pb-1.5 pr-3">Central Bank</th>
            <th className="text-left pb-1.5 px-2">CCY</th>
            <th className="text-right pb-1.5 px-2">Policy Rate</th>
            <th className="text-right pb-1.5 px-2">Last Change</th>
            <th className="text-right pb-1.5 px-2">Real Rate</th>
            <th className="text-right pb-1.5 px-2">Infl. Gap</th>
            <th className="text-right pb-1.5 px-2">Balance Sheet</th>
            <th className="text-center pb-1.5 px-2">QE/QT</th>
            <th className="text-right pb-1.5 pl-2">Policy Bias</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => {
            const c = s.cb;
            const arrow = c.lastChangeBps === null ? "" : c.lastChangeBps > 0 ? "↑" : c.lastChangeBps < 0 ? "↓" : "→";
            return (
              <tr key={s.ccy} className="border-t border-border font-mono">
                <td className="py-1.5 pr-3 font-sans font-semibold">{s.bank}</td>
                <td className="py-1.5 px-2">
                  {s.flag} {s.ccy}
                </td>
                <td className="py-1.5 px-2 text-right">
                  {fmtPct(s.policyRate)}
                  {warn(s.ccy, "policy_rate")}
                </td>
                <td className="py-1.5 px-2 text-right text-muted">
                  {c.lastChangeBps === null
                    ? "–"
                    : `${arrow} ${Math.abs(c.lastChangeBps)} bps${c.lastChangeDate ? ` · ${c.lastChangeDate}` : ""}`}
                </td>
                <td className={`py-1.5 px-2 text-right ${c.realRate === null ? "text-faint" : c.realRate >= 0 ? "text-up" : "text-down"}`}>
                  {c.realRate === null ? "–" : `${c.realRate > 0 ? "+" : ""}${c.realRate.toFixed(2)}%`}
                </td>
                <td className={`py-1.5 px-2 text-right ${c.inflationGap === null ? "text-faint" : c.inflationGap > 0 ? "text-warn" : "text-accent"}`}>
                  {c.inflationGap === null ? "–" : `${c.inflationGap > 0 ? "+" : ""}${c.inflationGap.toFixed(1)}pp`}
                </td>
                <td className="py-1.5 px-2 text-right text-muted">
                  {c.balanceSheetDisplay}
                  {warn(s.ccy, "balance_sheet")}
                </td>
                <td className="py-1.5 px-2 text-center">{qeqt[c.qeqt]}</td>
                <td className={`py-1.5 pl-2 text-right font-bold ${pbCls[c.policyBias]}`}>
                  {c.policyBias}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-faint mt-2 leading-relaxed">
        Balance Sheet nur für Fed/EZB/BoJ (FRED) — Rest n/a. Real Rate = Leitzins − CPI YoY.
        Inflation Gap = CPI YoY − Ziel. Policy Bias aus 6M-Zinstrend + Inflation-Gap.
      </p>
    </div>
  );
}
