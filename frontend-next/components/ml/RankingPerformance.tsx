"use client";

import { useEffect, useState } from "react";
import Segmented from "@/components/ui/Segmented";
import CandleChart from "@/components/charts/CandleChart";
import { fetchCandles, type Candle } from "@/lib/gva/api";
import type { PairIdea } from "@/lib/ml/ranking";

/**
 * „Performance seit Signal" — vereinfachter Kursverlauf der Top-Pairs, ab dem
 * Zeitpunkt, seit dem die Konstellation aktiv ist (`since` = Wochenstart des
 * aktuellen Rankings). Pair-Pills wählen das Paar, Segmente schalten
 * Daily/Weekly und Kerze/Linie um. Quelle OANDA (`/api/candles`).
 */
export default function RankingPerformance({
  pairs,
  since,
}: {
  pairs: PairIdea[];
  since: string | null;
}) {
  const [sel, setSel] = useState(0);
  const [gran, setGran] = useState<"D" | "W">("D");
  const [mode, setMode] = useState<"candle" | "line">("candle");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const active = pairs[sel];
  const symbol = active ? active.pair.replace("/", "") : "";
  const start = since ?? "";

  useEffect(() => {
    if (!symbol || !start) return;
    let alive = true;
    // queueMicrotask hält die setState-Aufrufe aus dem synchronen Effect-Body
    // (gleiche Deferral wie im ScannerShell).
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const cs = await fetchCandles(symbol, gran, start);
        if (alive) {
          setCandles(cs);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setError("Kursdaten nicht ladbar — Backend (Render) evtl. im Kaltstart.");
          setLoading(false);
        }
      }
    };
    queueMicrotask(run);
    return () => {
      alive = false;
    };
  }, [symbol, gran, start]);

  if (pairs.length === 0) {
    return (
      <p className="text-sm text-muted">
        Diese Woche keine Kandidaten-Pairs — kein Performance-Chart.
      </p>
    );
  }
  if (!start) {
    return <p className="text-sm text-muted">Kein Signal-Startdatum (Wochenstart) vorhanden.</p>;
  }

  const first = candles[0]?.close;
  const last = candles[candles.length - 1]?.close;
  const pct = first != null && last != null && first !== 0 ? ((last - first) / first) * 100 : null;
  // „Günstig" = Bewegung in Signalrichtung (Long → hoch, Short → runter).
  const favorable =
    pct != null && active ? (active.direction === "long" ? pct > 0 : pct < 0) : null;

  const startLabel = new Date(start).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Pair-Auswahl (wirkt wie Tabs) */}
      <div className="flex flex-wrap gap-1.5">
        {pairs.map((p, i) => (
          <button
            key={p.pair}
            onClick={() => setSel(i)}
            className={`px-2.5 py-1 rounded text-xs font-bold font-mono border transition-colors ${
              i === sel
                ? "bg-accent/15 text-accent border-accent"
                : "bg-surface text-muted border-border hover:text-text hover:border-border2"
            }`}
          >
            {p.pair}
          </button>
        ))}
      </div>

      {/* Kopf: Richtung, Grund, Performance seit Signal */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono font-bold text-[15px]">{active.pair}</span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
            active.direction === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down"
          }`}
        >
          {active.direction.toUpperCase()}
        </span>
        <span className="text-xs text-muted font-mono">{active.reason}</span>
        <span className="text-xs text-faint">seit {startLabel}</span>
        {pct != null && (
          <span
            className={`ml-auto font-mono text-sm font-bold ${
              favorable ? "text-up" : "text-down"
            }`}
            title="Kursänderung seit Signalstart (grün = in Signalrichtung)"
          >
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(2)} %
            <span className="text-faint font-normal ml-1">
              {favorable ? "(im Plus zum Signal)" : "(gegen das Signal)"}
            </span>
          </span>
        )}
      </div>

      {/* Umschalter */}
      <div className="flex flex-wrap gap-2">
        <Segmented
          options={[
            { value: "D" as const, label: "Daily" },
            { value: "W" as const, label: "Weekly" },
          ]}
          value={gran}
          onChange={setGran}
        />
        <Segmented
          options={[
            { value: "candle" as const, label: "Kerze" },
            { value: "line" as const, label: "Linie" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-[260px] flex items-center justify-center text-muted text-sm font-mono">
          Lade Kursdaten …
        </div>
      ) : error ? (
        <div className="h-[260px] flex items-center justify-center text-down text-sm">{error}</div>
      ) : (
        <CandleChart candles={candles} mode={mode} />
      )}
    </div>
  );
}
