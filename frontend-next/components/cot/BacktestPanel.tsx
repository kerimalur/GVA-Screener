"use client";

import { useEffect, useState } from "react";
import type { BacktestResult } from "@/lib/calc/cotBacktest";

interface ApiResponse extends BacktestResult {
  contract: { code: string; label: string; priceInstrument: string; invertPrice: boolean };
  params: { pct: number; direction: "top" | "bottom"; window: number };
  error?: string;
}

const HORIZON_LABEL: Record<number, string> = { 20: "+4 Wochen", 40: "+8 Wochen", 60: "+12 Wochen" };

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)} %`;
}

/** Historischer Extrem-Backtest mit einstellbarer Schwelle/Richtung. */
export default function BacktestPanel({ code }: { code: string }) {
  const [pct, setPct] = useState(10);
  const [direction, setDirection] = useState<"top" | "bottom">("top");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/data/cot/backtest?code=${code}&pct=${pct}&direction=${direction}`)
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [code, pct, direction]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
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
              {d === "top" ? "Extrem-Long (Top)" : "Extrem-Short (Bottom)"}
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
      </div>

      {error && <div className="text-down text-sm font-mono py-4">{error}</div>}
      {loading && !data && (
        <div className="text-muted text-sm font-mono py-4">Backtest läuft …</div>
      )}

      {data && !error && (
        <>
          {/* Aggregat */}
          <div className="grid grid-cols-3 gap-3">
            {data.horizons.map((h) => {
              const s = data.stats[h];
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
                        Median {fmtPct(s.median)} · {s.n} Signale
                      </div>
                      <div className="text-[11px] text-muted font-mono">
                        {s.hitRate.toFixed(0)}% davon positiv
                      </div>
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
            nachdem Non-Commercials das{" "}
            {direction === "top" ? `oberste ${pct}%-Perzentil (Extrem-Long)` : `unterste ${pct}%-Perzentil (Extrem-Short)`}{" "}
            der letzten 5 Jahre erreicht hatten.
            {data.contract.invertPrice &&
              " Returns invertiert (Future quotiert Fremdwährung, Pair ist USD-basiert) — '+' = Bewegung in Richtung des Futures-Extrems."}{" "}
            Negative Ø-Werte nach Extrem-Long stützen die Konträr-These.
          </p>

          {/* Signal-Liste */}
          <div className="max-h-64 overflow-y-auto border border-border rounded">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-surface2">
                <tr className="text-[10px] uppercase tracking-widest text-muted">
                  <th className="text-left py-1.5 px-3">Signal-Datum</th>
                  <th className="text-right py-1.5 px-3">Netto</th>
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
                    <td colSpan={3 + data.horizons.length} className="py-4 text-center text-muted">
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
