"use client";

import { useEffect, useState } from "react";
import {
  BUCKET_LABELS,
  type BucketKey,
  type ConditionalResult,
} from "@/lib/calc/conditionalOutcome";

interface ApiResponse extends ConditionalResult {
  contract: { code: string; label: string; ccy: string; priceInstrument: string; invertPrice: boolean };
  source: "tff" | "legacy";
  error?: string;
}

const HORIZON_LABEL: Record<number, string> = { 20: "+4W", 40: "+8W", 60: "+12W" };

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/**
 * Konfluenz-Matrix: COT-Flow (4W) × 10Y-Spread-Drehung (12W) → historische
 * Forward-Returns je Konstellation, aktuelle Konstellation hervorgehoben.
 */
export default function ConditionalOutcomePanel({ code }: { code: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/data/cot/conditional?code=${code}`)
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        if (json.error) setError(json.error);
        else {
          setData(json);
          setError(null);
        }
      })
      .catch((e) => setError(String(e)));
  }, [code]);

  if (error) return <div className="text-muted text-sm font-mono py-4">{error}</div>;
  if (!data) return <div className="text-muted text-sm font-mono py-4">Berechnung läuft …</div>;

  return (
    <div className="space-y-4">
      {/* Aktuelle Konstellation */}
      <div className="border border-accent/50 bg-accent/10 rounded p-3 text-[12px] leading-relaxed">
        {data.verdictText}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] font-mono">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-border">
              <th className="text-left py-2 pr-3 font-sans">Konstellation</th>
              {data.horizons.map((h) => (
                <th key={h} className="text-right py-2 px-3">
                  {HORIZON_LABEL[h] ?? `+${h}T`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(BUCKET_LABELS) as BucketKey[]).map((k) => {
              const isCurrent = data.current.bucket === k;
              return (
                <tr
                  key={k}
                  className={`border-b border-border/40 ${isCurrent ? "bg-accent/10" : ""}`}
                >
                  <td className="py-2 pr-3 font-sans">
                    {BUCKET_LABELS[k]}
                    {isCurrent && (
                      <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                        AKTUELL
                      </span>
                    )}
                  </td>
                  {data.horizons.map((h) => {
                    const s = data.buckets[k][h];
                    return (
                      <td key={h} className="text-right py-2 px-3">
                        {s ? (
                          <>
                            <span className={`font-bold ${s.avg >= 0 ? "text-up" : "text-down"}`}>
                              {fmtPct(s.avg)}
                            </span>
                            <span className="text-faint"> ·{s.hitRate.toFixed(0)}%·n{s.n}</span>
                          </>
                        ) : (
                          <span className="text-faint">–</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t border-border">
              <td className="py-2 pr-3 font-sans text-muted">Basisrate (alle Wochen)</td>
              {data.horizons.map((h) => {
                const b = data.baseline[h];
                return (
                  <td key={h} className="text-right py-2 px-3 text-muted">
                    {b ? `${fmtPct(b.avg)} ·n${b.n}` : "–"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        Flow = 4-Wochen-Δ der {data.source === "tff" ? "Leveraged-Funds" : "Non-Commercials"}-Nettoposition
        (% OI). Spread-Drehung = Veränderung des 10Y-Spreads {data.contract.ccy}−USD über ~12 Wochen.
        Returns beziehen sich auf <span className="font-mono">{data.contract.priceInstrument}</span>
        {data.contract.invertPrice && " (invertiert: '+' = Bewegung in Richtung Futures-Stärke)"} —
        n unter ~8 gilt als nicht belastbar.
      </p>
    </div>
  );
}
