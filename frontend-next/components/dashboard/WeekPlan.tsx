"use client";

import { useEffect, useState } from "react";
import { fetchScreener, type MarketData } from "@/lib/gva/api";
import type { WeekPlanPair, WeekPlanGroup } from "@/lib/dashboard/weekPlan";

/** "AUD/USD" | "AUDUSD" → "AUDUSD" für robustes Matching gegen MarketData.pair */
const norm = (s: string) => s.replace(/[^a-z]/gi, "").toUpperCase();

const CONTROL_STYLE: Record<WeekPlanPair["control"]["status"], { icon: string; cls: string }> = {
  confirmed: { icon: "✓", cls: "text-up" },
  divergent: { icon: "⚠", cls: "text-warn" },
  neutral: { icon: "–", cls: "text-muted" },
};

function GvaCell({ md }: { md: MarketData | undefined }) {
  if (!md) return <span className="text-muted">– neutral</span>;
  if (md.status === "HIT") {
    const cls = md.near === "LONG" ? "text-up" : "text-down";
    return (
      <span className={`font-mono ${cls}`}>
        ● HIT {md.near}
      </span>
    );
  }
  if (md.status === "PREPARE" && md.distance != null) {
    return (
      <span className="font-mono text-accent">
        ○ {md.distance.toFixed(0)}p {md.near}
      </span>
    );
  }
  return <span className="text-muted font-mono">– neutral</span>;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "short" });
}

function CurrencyGroups({ groups }: { groups: WeekPlanGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-1">
      {groups.map((g) => (
        <div
          key={g.ccy}
          className="flex items-start gap-3 py-1.5 border-t border-border/40 first:border-t-0"
        >
          <span className="w-36 shrink-0 font-mono font-bold text-xs">{g.label}</span>
          <div className="flex flex-wrap gap-1.5">
            {g.ideas.map((i) => (
              <span
                key={i.pair}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  i.direction === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                }`}
              >
                {i.pair}
                <span className="opacity-70">{i.direction === "long" ? "L" : "S"}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function WeekPlan({
  pairs,
  groups,
}: {
  pairs: WeekPlanPair[];
  groups: WeekPlanGroup[];
}) {
  const [byPair, setByPair] = useState<Record<string, MarketData>>({});
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const rows = await fetchScreener();
        if (!alive) return;
        const map: Record<string, MarketData> = {};
        for (const r of rows) map[norm(r.pair)] = r;
        setByPair(map);
        setLive(true);
      } catch {
        if (alive) setLive(false); // Backend offline → nur GVA-Spalte leer, Rest steht
      }
    };
    queueMicrotask(load);
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (pairs.length === 0 && groups.length === 0) {
    return (
      <p className="text-sm text-muted">
        Diese Woche keine Stärke-Quintil-Extreme (Q5/Q1) — kein fundamentaler Rückenwind, reine GVA-Regeln.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">Nach Währung — Extremwährung × ihre Pairs</div>
          <CurrencyGroups groups={groups} />
        </div>
      )}

      {pairs.length === 0 ? (
        <p className="text-sm text-muted">
          Keine Q5×Q1-Paarung (beide Seiten im Stärke-Quintil-Extrem) diese Woche — nur einseitiger Rückenwind oben.
        </p>
      ) : (
      <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted text-xs">
              <th className="py-1 pr-3">Pair</th>
              <th className="pr-3">Richtung</th>
              <th className="pr-3">Stark × Schwach</th>
              <th className="pr-3">Kontrolle</th>
              <th className="pr-3">GVA {live ? "live" : "(offline)"}</th>
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const c = CONTROL_STYLE[p.control.status];
              return (
                <tr key={p.pair} className="border-t border-border/40 align-top">
                  <td className="py-2 pr-3 font-mono font-bold">{p.pair}</td>
                  <td className="pr-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                        p.direction === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                      }`}
                    >
                      {p.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="pr-3 font-mono text-xs">
                    <span className="text-up">{p.baseLabel}</span>
                    <span className="text-muted"> × </span>
                    <span className="text-down">{p.quoteLabel}</span>
                  </td>
                  <td className={`pr-3 text-xs ${c.cls}`}>
                    <span className="font-bold">{c.icon}</span> {p.control.detail}
                  </td>
                  <td className="pr-3">
                    <GvaCell md={byPair[norm(p.pair)]} />
                  </td>
                  <td className="text-xs">
                    {p.events.length === 0 ? (
                      <span className="text-muted">–</span>
                    ) : (
                      <span className="text-warn font-mono">
                        ⚠ {p.events.map((e) => `${e.ccy} ${dayLabel(e.when)}`).join(" · ")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">
        Kontrolle = Macro-Terminal-Richtung vs. Stärke-Quintil (Q5/Q1). ⚠ Divergenz → im Macro Terminal nachbohren.
        GVA-Nähe live vom Scanner (HIT = Linie berührt, ○ = ≤100 Pips).
      </p>
      </div>
      )}
    </div>
  );
}
