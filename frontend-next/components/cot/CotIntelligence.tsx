"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { useCachedFetch } from "@/lib/hooks/useCachedFetch";
import type { CotIntelData, HeatmapRow, ScanItem } from "@/lib/data/cotIntel";
import type { CurrencySignal } from "@/lib/calc/cotIntel";
import { CCY_FLAGS } from "@/lib/constants/flags";

type Tab = "signale" | "ranking" | "heatmap" | "scanner";

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
function flag(ccy: string): string {
  return CCY_FLAGS[ccy] ?? "🏳️";
}

export default function CotIntelligence() {
  // Stale-first: letzter Stand aus localStorage sofort, Refresh im Hintergrund.
  const { data, error } = useCachedFetch<CotIntelData>("cot-intel", "/api/cot/intelligence");
  const [tab, setTab] = useState<Tab>("signale");

  if (error) return <p className="text-down text-sm font-mono">Ladefehler: {error}</p>;
  if (!data) return <p className="text-muted text-sm font-mono animate-pulse">Lade COT-Positionierungsdaten …</p>;

  const seg = (active: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
      active ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-text"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex gap-1.5 border-b border-border pb-3">
        {(
          [
            ["signale", "Signal Engine"],
            ["ranking", "Strength Ranking"],
            ["heatmap", "Weekly Heatmap"],
            ["scanner", "Flips & Extremes"],
          ] as Array<[Tab, string]>
        ).map(([k, l]) => (
          <button key={k} className={seg(tab === k)} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "signale" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {data.signals.map((s) => (
            <SignalCard key={s.ccy} s={s} />
          ))}
        </div>
      )}
      {tab === "ranking" && <Ranking signals={data.signals} />}
      {tab === "heatmap" && <Heatmap rows={data.heatmap} groups={data.heatmapGroups} />}
      {tab === "scanner" && <Scanner flips={data.flips} extremes={data.extremes} />}
    </div>
  );
}

function GroupBar({ label, score, index }: { label: string; score: number | null; index: number | null }) {
  const pct = score === null ? 0 : Math.min(50, Math.abs(score) / 2);
  const pos = score !== null && score >= 0;
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono">
      <span className="w-16 text-muted shrink-0">{label}</span>
      <div className="relative flex-1 h-2.5 bg-surface rounded-sm overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
        <div
          className={`absolute top-0 bottom-0 ${pos ? "bg-up/70" : "bg-down/70"}`}
          style={pos ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
        />
      </div>
      <span className={`w-9 text-right ${scoreCls(score)}`}>{index === null ? "–" : index.toFixed(0)}</span>
    </div>
  );
}

function SignalCard({ s }: { s: CurrencySignal }) {
  return (
    <Link
      href={`/cot/intelligence/${s.ccy}`}
      className="rounded-lg border border-border bg-surface2 p-3.5 space-y-3 block hover:border-accent/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{flag(s.ccy)}</span>
          <span className="font-mono font-bold text-[15px]">{s.ccy}</span>
        </div>
        <span className={`text-2xl font-black font-mono ${scoreCls(s.score)}`}>
          {s.score > 0 ? "+" : ""}
          {s.score}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${biasCls(s.bias)}`}>
          {s.bias}
        </span>
        <span className="text-[10px] font-mono text-muted">Confidence {s.confidence}%</span>
      </div>
      <div className="space-y-1 pt-1 border-t border-border">
        {s.groups.map((g) => (
          <GroupBar key={g.key} label={g.label} score={g.score} index={g.index} />
        ))}
      </div>
    </Link>
  );
}

function Ranking({ signals }: { signals: CurrencySignal[] }) {
  const col = (s: CurrencySignal, key: string) => s.groups.find((g) => g.key === key)?.score ?? null;
  const sorted = [...signals].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5">
      <div className="overflow-x-auto">
        <table className="text-[12px] min-w-[520px] w-full">
          <thead>
            <tr className="text-[9px] text-faint font-mono uppercase tracking-wider">
              <th className="text-left pb-1.5 pr-3">CCY</th>
              <th className="text-right pb-1.5 px-2">Dealer</th>
              <th className="text-right pb-1.5 px-2">AM</th>
              <th className="text-right pb-1.5 px-2">LF</th>
              <th className="text-right pb-1.5 px-2">Retail</th>
              <th className="text-right pb-1.5 px-2">Score</th>
              <th className="text-right pb-1.5 pl-2">Final Bias</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.ccy} className="border-t border-border font-mono">
                <td className="py-1.5 pr-3 font-bold">
                  {flag(s.ccy)} {s.ccy}
                </td>
                {["dealer", "assetMgr", "levFunds", "retail"].map((k) => {
                  const v = col(s, k);
                  return (
                    <td key={k} className={`py-1.5 px-2 text-right ${scoreCls(v)}`}>
                      {v === null ? "–" : `${v > 0 ? "+" : ""}${v}`}
                    </td>
                  );
                })}
                <td className={`py-1.5 px-2 text-right font-bold ${scoreCls(s.score)}`}>
                  {s.score > 0 ? "+" : ""}
                  {s.score}
                </td>
                <td className="py-1.5 pl-2 text-right">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${biasCls(s.bias)}`}>
                    {s.bias}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-faint mt-2">
          Scores = normierte COT-Indizes je Gruppe (−100..+100). Final Bias = gewichteter Composite
          (Dealer 40 %, AM 25 %, LF 20 %, Commercials 10 %, Retail 5 % — Hedger/Retail konträr).
        </p>
      </div>

      <div className="space-y-3">
        <RankSide title="Strongest" items={top3} up />
        <RankSide title="Weakest" items={bottom3} up={false} />
      </div>
    </div>
  );
}

function RankSide({ title, items, up }: { title: string; items: CurrencySignal[]; up: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface2 p-3">
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${up ? "text-up" : "text-down"}`}>
        {title}
      </div>
      <div className="space-y-1.5">
        {items.map((s) => (
          <div key={s.ccy} className="flex items-center justify-between text-[12px] font-mono">
            <span>
              {flag(s.ccy)} {s.ccy}
            </span>
            <span className={`font-bold ${scoreCls(s.score)}`}>
              {s.score > 0 ? "+" : ""}
              {s.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ rows, groups }: { rows: HeatmapRow[]; groups: string[] }) {
  const [onlyCcy, setOnlyCcy] = useState(true);
  const [direction, setDirection] = useState<"all" | "long" | "short">("all");
  const [minAbs, setMinAbs] = useState(0);

  // Farbskala relativ zum größten |Δ| der sichtbaren Zellen
  const maxAbs = useMemo(() => {
    let m = 1;
    for (const r of rows) for (const g of groups) {
      const v = r.cells[g];
      if (v != null) m = Math.max(m, Math.abs(v));
    }
    return m;
  }, [rows, groups]);

  const visible = onlyCcy ? rows.filter((r) => r.ccy) : rows;

  const cellStyle = (v: number | null): CSSProperties => {
    if (v === null || Math.abs(v) < minAbs) return {};
    if (direction === "long" && v < 0) return { opacity: 0.15 };
    if (direction === "short" && v > 0) return { opacity: 0.15 };
    const t = Math.min(1, Math.abs(v) / maxAbs);
    // RGB-Kanäle von --color-up / --color-down — die Deckkraft trägt hier die Stärke.
    const color = v > 0 ? "79,216,138" : "240,102,92";
    return { backgroundColor: `rgba(${color},${(t * 0.5).toFixed(2)})` };
  };

  const seg = (active: boolean) =>
    `px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
      active ? "border-accent text-accent bg-accent/10" : "border-border text-muted"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <div className="flex gap-1.5">
          <button className={seg(onlyCcy)} onClick={() => setOnlyCcy(true)}>Currencies</button>
          <button className={seg(!onlyCcy)} onClick={() => setOnlyCcy(false)}>All</button>
        </div>
        <div className="flex gap-1.5">
          {(["all", "long", "short"] as const).map((d) => (
            <button key={d} className={seg(direction === d)} onClick={() => setDirection(d)}>
              {d === "all" ? "Long+Short" : d === "long" ? "Long" : "Short"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[10px] font-mono text-muted">
          Min |Δ| {minAbs.toLocaleString("de-DE")}
          <input type="range" min={0} max={Math.round(maxAbs / 2)} step={100} value={minAbs}
            onChange={(e) => setMinAbs(Number(e.target.value))} />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="text-[11px] min-w-[640px] w-full">
          <thead>
            <tr className="text-[9px] text-faint font-mono uppercase tracking-wider">
              <th className="text-left pb-1.5 pr-3">Market</th>
              {groups.map((g) => (
                <th key={g} className="text-right pb-1.5 px-2">{g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.code} className="border-t border-border font-mono">
                <td className="py-1.5 pr-3 font-sans font-semibold whitespace-nowrap">{r.label}</td>
                {groups.map((g) => {
                  const v = r.cells[g];
                  return (
                    <td key={g} className="py-1.5 px-2 text-right" style={cellStyle(v)}>
                      {v === null ? <span className="text-faint">–</span> : `${v > 0 ? "+" : ""}${v.toLocaleString("de-DE")}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-faint mt-2">Zellen = wöchentliche Netto-Änderung (Δ Kontrakte). Grün = Zukauf, Rot = Abbau.</p>
    </div>
  );
}

function Scanner({ flips, extremes }: { flips: ScanItem[]; extremes: ScanItem[] }) {
  const row = (it: ScanItem, i: number) => (
    <tr key={`${it.code}-${it.group}-${i}`} className="border-t border-border font-mono text-[11px]">
      <td className="py-1.5 pr-3 font-sans font-semibold whitespace-nowrap">
        {it.ccy ? `${flag(it.ccy)} ` : ""}
        {it.label}
      </td>
      <td className="py-1.5 px-2 text-muted">{it.group}</td>
      <td className="py-1.5 px-2">{it.detail}</td>
      <td className="py-1.5 pl-2 text-right text-faint">{it.oi ? it.oi.toLocaleString("de-DE") : "–"}</td>
    </tr>
  );
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-warn mb-2">
          Extremes — 90./10.-Perzentil (260W), größtes OI zuerst
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full min-w-[420px]">
            <thead>
              <tr className="text-[9px] text-faint font-mono uppercase tracking-wider sticky top-0 bg-surface">
                <th className="text-left pb-1.5 pr-3">Market</th>
                <th className="text-left pb-1.5 px-2">Gruppe</th>
                <th className="text-left pb-1.5 px-2">Signal</th>
                <th className="text-right pb-1.5 pl-2">OI</th>
              </tr>
            </thead>
            <tbody>
              {extremes.length ? extremes.map(row) : (
                <tr><td colSpan={4} className="py-3 text-center text-muted text-[12px]">Keine Extreme.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-accent mb-2">
          Flips — Vorzeichenwechsel diese Woche
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full min-w-[420px]">
            <thead>
              <tr className="text-[9px] text-faint font-mono uppercase tracking-wider sticky top-0 bg-surface">
                <th className="text-left pb-1.5 pr-3">Market</th>
                <th className="text-left pb-1.5 px-2">Gruppe</th>
                <th className="text-left pb-1.5 px-2">Wechsel</th>
                <th className="text-right pb-1.5 pl-2">OI</th>
              </tr>
            </thead>
            <tbody>
              {flips.length ? flips.map(row) : (
                <tr><td colSpan={4} className="py-3 text-center text-muted text-[12px]">Keine Flips.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
