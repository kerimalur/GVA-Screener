"use client";

import { useEffect, useState } from "react";
import type { BacktestResult } from "@/lib/calc/cotBacktest";
import { CONTRACT_BY_CODE } from "@/lib/constants/cftcContracts";

interface ApiResponse extends BacktestResult {
  contract: { code: string; label: string; priceInstrument: string; invertPrice: boolean };
  params: {
    pct: number;
    direction: "top" | "bottom";
    mode: "level" | "delta";
    source: "legacy" | "tff";
    window: number;
  };
  error?: string;
}

const HORIZON_LABEL: Record<number, string> = { 20: "+4 Wochen", 40: "+8 Wochen", 60: "+12 Wochen" };

const GRADE_STYLE: Record<string, string> = {
  belastbar: "border-up/60 bg-up/10 text-up",
  schwach: "border-warn/60 bg-warn/10 text-warn",
  unzureichend: "border-border bg-surface2 text-muted",
};

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)} %`;
}

/** Historischer COT-Backtest: Niveau- oder Δ-Extrem, mit Basisrate + Klartext-Fazit. */
export default function BacktestPanel({ code }: { code: string }) {
  const [pct, setPct] = useState(10);
  const [direction, setDirection] = useState<"top" | "bottom">("top");
  const [mode, setMode] = useState<"level" | "delta">("delta");
  const [source, setSource] = useState<"legacy" | "tff">("tff");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inTff = CONTRACT_BY_CODE.get(code)?.inTff ?? false;

  useEffect(() => {
    fetch(
      `/api/data/cot/backtest?code=${code}&pct=${pct}&direction=${direction}&mode=${mode}&source=${source}`,
    )
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        if (json.error) setError(json.error);
        else {
          setData(json);
          setError(null);
        }
      })
      .catch((e) => setError(String(e)));
  }, [code, pct, direction, mode, source]);

  const group =
    data?.params.source === "tff" ? "Leveraged Funds (TFF)" : "Non-Commercials (Legacy)";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted mr-1">Signal:</span>
          {(
            [
              ["delta", "Δ-Extrem (Flow)"],
              ["level", "Niveau-Extrem"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors ${
                mode === m
                  ? "bg-accent/15 text-accent border-accent"
                  : "text-muted border-border hover:border-border2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted mr-1">Extrem:</span>
          {(["top", "bottom"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors ${
                direction === d
                  ? d === "top"
                    ? "bg-up/15 text-up border-up"
                    : "bg-down/15 text-down border-down"
                  : "text-muted border-border hover:border-border2"
              }`}
            >
              {d === "top"
                ? mode === "delta" ? "Zufluss (Top)" : "Extrem-Long (Top)"
                : mode === "delta" ? "Abfluss (Bottom)" : "Extrem-Short (Bottom)"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted mr-1">Schwelle:</span>
          {[5, 10, 15].map((p) => (
            <button
              key={p}
              onClick={() => setPct(p)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold border transition-colors ${
                pct === p
                  ? "bg-accent/15 text-accent border-accent"
                  : "text-muted border-border hover:border-border2"
              }`}
            >
              {p}%
            </button>
          ))}
        </div>
        {inTff && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted mr-1">Quelle:</span>
            {(
              [
                ["tff", "TFF (Lev. Funds)"],
                ["legacy", "Legacy"],
              ] as const
            ).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors ${
                  source === s
                    ? "bg-accent/15 text-accent border-accent"
                    : "text-muted border-border hover:border-border2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="text-down text-sm font-mono py-4">{error}</div>}
      {!data && !error && (
        <div className="text-muted text-sm font-mono py-4">Backtest läuft …</div>
      )}

      {data && !error && (
        <>
          {/* Klartext-Fazit */}
          <div className={`border rounded p-3 text-[12px] leading-relaxed ${GRADE_STYLE[data.verdict.grade]}`}>
            <span className="font-bold uppercase tracking-wider text-[10px] mr-2">
              {data.verdict.grade}
            </span>
            {data.verdict.text}
          </div>

          {/* Aggregat mit Basisrate + Edge */}
          <div className="grid grid-cols-3 gap-3">
            {data.horizons.map((h) => {
              const s = data.stats[h];
              const b = data.baseline[h];
              const e = data.edge[h];
              return (
                <div key={h} className="bg-surface2 border border-border rounded p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">
                    {HORIZON_LABEL[h] ?? `+${h} Tage`}
                  </div>
                  {s ? (
                    <>
                      <div className={`text-lg font-bold font-mono ${s.avg >= 0 ? "text-up" : "text-down"}`}>
                        {fmtPct(s.avg)}
                      </div>
                      <div className="text-[11px] text-muted font-mono mt-1">
                        Median {fmtPct(s.median)} · {s.n} Signale · {s.hitRate.toFixed(0)}% pos.
                      </div>
                      {b && e !== null && (
                        <div className="text-[11px] font-mono mt-1">
                          <span className="text-faint">Basis {fmtPct(b.avg)} → </span>
                          <span className={`font-bold ${e >= 0 ? "text-up" : "text-down"}`}>
                            Edge {e > 0 ? "+" : ""}{e.toFixed(2)} pp
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-muted text-sm font-mono">–</div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted leading-relaxed">
            Ø-Preisentwicklung von <span className="font-mono">{data.contract.priceInstrument}</span>,
            nachdem {group}{" "}
            {mode === "delta"
              ? direction === "top"
                ? `eine Wochenveränderung im obersten ${pct}%-Perzentil (Extrem-Zufluss)`
                : `eine Wochenveränderung im untersten ${pct}%-Perzentil (Extrem-Abfluss)`
              : direction === "top"
                ? `das oberste ${pct}%-Perzentil der Nettoposition (Extrem-Long)`
                : `das unterste ${pct}%-Perzentil der Nettoposition (Extrem-Short)`}{" "}
            der letzten 5 Jahre erreicht hatten. Basisrate = Ø-Return ALLER Wochen desselben
            Zeitraums — erst die Differenz (Edge) macht das Signal bewertbar.
            {data.contract.invertPrice &&
              " Returns invertiert (Future quotiert Fremdwährung, Pair ist USD-basiert) — '+' = Bewegung in Richtung des Futures-Extrems."}
          </p>

          {/* Signal-Liste */}
          <div className="max-h-64 overflow-y-auto border border-border rounded">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-surface2">
                <tr className="text-[10px] uppercase tracking-widest text-muted">
                  <th className="text-left py-1.5 px-3">Signal-Datum</th>
                  <th className="text-right py-1.5 px-3">Netto</th>
                  {mode === "delta" && <th className="text-right py-1.5 px-3">Δ Woche</th>}
                  <th className="text-right py-1.5 px-3">Perzentil</th>
                  {data.horizons.map((h) => (
                    <th key={h} className="text-right py-1.5 px-3">{HORIZON_LABEL[h] ?? `+${h}T`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.signals].reverse().map((s) => (
                  <tr key={s.date} className="border-t border-border/50">
                    <td className="py-1 px-3">{new Date(s.date).toLocaleDateString("de-DE")}</td>
                    <td className="text-right py-1 px-3">{s.net.toLocaleString("de-DE")}</td>
                    {mode === "delta" && (
                      <td className={`text-right py-1 px-3 ${(s.delta ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                        {s.delta !== null ? `${s.delta > 0 ? "+" : ""}${s.delta.toLocaleString("de-DE")}` : "–"}
                      </td>
                    )}
                    <td className="text-right py-1 px-3">{s.percentile.toFixed(0)}</td>
                    {data.horizons.map((h) => {
                      const r = s.fwd[h];
                      return (
                        <td
                          key={h}
                          className={`text-right py-1 px-3 ${
                            r === null ? "text-faint" : r >= 0 ? "text-up" : "text-down"
                          }`}
                        >
                          {r === null ? "–" : fmtPct(r)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {data.signals.length === 0 && (
                  <tr>
                    <td
                      colSpan={(mode === "delta" ? 4 : 3) + data.horizons.length}
                      className="py-4 text-center text-muted"
                    >
                      Keine Signale bei dieser Schwelle.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
