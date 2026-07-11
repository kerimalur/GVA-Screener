"use client";

import type { CurrencyCockpitRow } from "@/lib/calc/currencyCockpit";
import type { CurrencyFactor } from "@/lib/calc/currencyBias";

/**
 * Währungs-Cockpit: 8 Währungen untereinander, je eine Zeile mit Bias,
 * COT, Zinsen, Retail-Aggregat, Saisonalität und High-Impact-News-Flag.
 * Faktor-Details nativ aufklappbar.
 */

function findFactor(factors: CurrencyFactor[], needle: string): CurrencyFactor | undefined {
  return factors.find((f) => f.name.toLowerCase().includes(needle));
}

function DirBadge({ direction }: { direction: "LONG" | "SHORT" | null }) {
  const cls =
    direction === "LONG"
      ? "border-up text-up bg-up/10"
      : direction === "SHORT"
        ? "border-down text-down bg-down/10"
        : "border-border text-muted";
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${cls}`}>
      {direction ?? "NEUTRAL"}
    </span>
  );
}

function DirDot({ dir }: { dir: -1 | 0 | 1 }) {
  return (
    <span className={dir === 1 ? "text-up" : dir === -1 ? "text-down" : "text-faint"}>
      {dir === 1 ? "▲" : dir === -1 ? "▼" : "•"}
    </span>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-widest text-faint mb-0.5">{label}</div>
      <div className="text-[11px] font-mono leading-tight">{children}</div>
    </div>
  );
}

export default function CurrencyCockpit({
  rows,
  extremeHi,
  extremeLo,
}: {
  rows: CurrencyCockpitRow[];
  extremeHi: number;
  extremeLo: number;
}) {
  if (rows.length === 0) {
    return <p className="text-muted text-sm font-mono">Daten fehlen — Backfill ausführen.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const cot = findFactor(r.factors, "cot");
        const rate = findFactor(r.factors, "leitzins");
        const isExtreme =
          r.percentile !== null && (r.percentile >= extremeHi || r.percentile <= extremeLo);
        const seasonNet = r.seasonLong.length - r.seasonShort.length;
        const driftNews = r.news.filter((n) => n.drift).length;

        return (
          <details
            key={r.ccy}
            className="bg-surface2 border border-border rounded-lg overflow-hidden group"
          >
            <summary className="cursor-pointer select-none list-none px-3.5 py-3 hover:bg-surface/40 transition-colors">
              <div className="grid grid-cols-2 md:grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-x-4 gap-y-2 items-center">
                {/* Währung + Bias */}
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-black font-mono w-9">{r.ccy}</span>
                  <div className="flex flex-col gap-0.5">
                    <DirBadge direction={r.direction} />
                    <span className="text-[9px] text-faint uppercase tracking-wider">
                      {r.alignedCount}/{r.factorCount} Faktoren
                    </span>
                  </div>
                </div>

                {/* COT */}
                <Cell label="COT">
                  <span className="flex items-center gap-1">
                    {cot ? <DirDot dir={cot.dir} /> : <span className="text-faint">•</span>}
                    <span className={cot?.dir === 1 ? "text-up" : cot?.dir === -1 ? "text-down" : "text-muted"}>
                      {cot?.dir === 1 ? "bullish" : cot?.dir === -1 ? "bearish" : "neutral"}
                    </span>
                    {r.percentile !== null && (
                      <span className={isExtreme ? "text-warn" : "text-faint"}>
                        {isExtreme ? "⚠" : ""}
                        {r.percentile.toFixed(0)}.
                      </span>
                    )}
                  </span>
                </Cell>

                {/* Zinsen */}
                <Cell label="Zinsen">
                  <span className="flex items-center gap-1">
                    {rate ? <DirDot dir={rate.dir} /> : <span className="text-faint">•</span>}
                    <span className="text-muted truncate">
                      {rate?.dir === 1 ? "steigend" : rate?.dir === -1 ? "fallend" : "stabil"}
                    </span>
                  </span>
                </Cell>

                {/* Retail */}
                <Cell label="Retail">
                  {r.retailLongPct === null ? (
                    <span className="text-faint">–</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <DirDot dir={r.retailDir} />
                      <span className="text-muted">{r.retailLongPct.toFixed(0)}% long</span>
                    </span>
                  )}
                </Cell>

                {/* Saisonalität */}
                <Cell label={`Saison ${r.monthLabel}`}>
                  {r.seasonLong.length === 0 && r.seasonShort.length === 0 ? (
                    <span className="text-faint">neutral</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      {r.seasonLong.length > 0 && <span className="text-up">{r.seasonLong.length}▲</span>}
                      {r.seasonShort.length > 0 && <span className="text-down">{r.seasonShort.length}▼</span>}
                      <span className={seasonNet > 0 ? "text-up" : seasonNet < 0 ? "text-down" : "text-faint"}>
                        {seasonNet > 0 ? "pro" : seasonNet < 0 ? "contra" : "gemischt"}
                      </span>
                    </span>
                  )}
                </Cell>

                {/* News-Flag */}
                <div className="text-right">
                  {r.news.length > 0 ? (
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                        driftNews > 0 ? "bg-warn/15 text-warn border border-warn/40" : "bg-surface text-muted"
                      }`}
                      title={r.news.map((n) => n.title).join(" · ")}
                    >
                      {driftNews > 0 ? "⚡ " : ""}{r.news.length} News
                    </span>
                  ) : (
                    <span className="text-[10px] text-faint font-mono">–</span>
                  )}
                </div>
              </div>
            </summary>

            {/* Aufgeklappt: Faktor-Details + Saison-Pairs + News-Liste */}
            <div className="px-3.5 pb-3.5 pt-1 border-t border-border/50 space-y-3">
              <ul className="space-y-1 mt-2">
                {r.factors.map((f) => (
                  <li key={f.name} className="flex gap-1.5 text-[11px] leading-snug">
                    <DirDot dir={f.dir} />
                    <span className="text-muted">
                      <span className="font-bold text-text">{f.name}:</span> {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              {(r.seasonLong.length > 0 || r.seasonShort.length > 0) && (
                <div className="text-[11px] font-mono">
                  <span className="text-faint uppercase tracking-wider text-[9px] mr-2">
                    Saison {r.monthLabel}
                  </span>
                  {r.seasonLong.length > 0 && (
                    <span className="text-up">pro {r.ccy}: {r.seasonLong.join(", ")}. </span>
                  )}
                  {r.seasonShort.length > 0 && (
                    <span className="text-down">contra {r.ccy}: {r.seasonShort.join(", ")}.</span>
                  )}
                </div>
              )}

              {r.news.length > 0 && (
                <div className="space-y-0.5 text-[11px] font-mono">
                  <div className="text-faint uppercase tracking-wider text-[9px]">
                    High-Impact-News (7 Tage)
                  </div>
                  {r.news.map((n, i) => (
                    <div key={i} className={n.drift ? "text-warn" : "text-muted"}>
                      {n.drift ? "⚡" : "·"}{" "}
                      {new Date(n.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}{" "}
                      {n.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
