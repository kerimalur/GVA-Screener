"use client";

import { useEffect, useState } from "react";
import Segmented from "@/components/ui/Segmented";
import CandleChart from "@/components/charts/CandleChart";
import { fetchCandles, type Candle } from "@/lib/gva/api";
import type { PairIdea } from "@/lib/ml/ranking";
import { sinceForPair, wochenSeit } from "@/lib/ml/signalStart";

/**
 * „Performance seit Signal" — vereinfachter Kursverlauf der Top-Pairs, ab dem
 * Zeitpunkt, seit dem die Konstellation für DIESES Pair unverändert steht.
 *
 * Bewusst nicht `weekStart` des Rankings: das ist die Zielwoche der Prognose
 * (kommender Montag) und liegt in der Zukunft — es gäbe dafür weder Kursdaten
 * noch eine sinnvolle Aussage. Der Startpunkt kommt je Pair aus dem tatsächlichen
 * Lauf; ein brandneues Signal hat keinen Verlauf und wird als solches gezeigt.
 *
 * Pair-Pills wählen das Paar, Segmente schalten Daily/Weekly und Kerze/Linie
 * um. Quelle OANDA (`/api/candles`).
 */
export default function RankingPerformance({
  pairs,
  startByPair,
}: {
  pairs: PairIdea[];
  /** Pair-Anzeigename → 'YYYY-MM-DD'; fehlt = Signal ist neu. */
  startByPair: Record<string, string>;
}) {
  const [sel, setSel] = useState(0);
  const [gran, setGran] = useState<"D" | "W">("D");
  const [mode, setMode] = useState<"candle" | "line">("candle");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const active = pairs[sel];
  const symbol = active ? active.pair.replace("/", "") : "";
  // Startpunkt des aktiven Pairs; null (→ "") wenn das Signal neu ist oder der
  // errechnete Lauf in der Zukunft liegt.
  const start = active ? (sinceForPair(startByPair[active.pair]) ?? "") : "";

  useEffect(() => {
    let alive = true;
    // queueMicrotask hält alle setState-Aufrufe aus dem synchronen Effect-Body
    // (gleiche Deferral wie im ScannerShell) — inkl. des Falls „kein Start".
    const run = async () => {
      // Neues Signal ohne Startpunkt: nicht laden, sondern den Ladezustand
      // beenden und alte Kerzen des vorher gewählten Pairs verwerfen.
      if (!symbol || !start) {
        if (alive) {
          setCandles([]);
          setError(null);
          setLoading(false);
        }
        return;
      }
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

  const first = candles[0]?.close;
  const last = candles[candles.length - 1]?.close;
  const pct = first != null && last != null && first !== 0 ? ((last - first) / first) * 100 : null;
  // „Günstig" = Bewegung in Signalrichtung (Long → hoch, Short → runter).
  const favorable =
    pct != null && active ? (active.direction === "long" ? pct > 0 : pct < 0) : null;

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
        {start ? (
          <span className="text-xs text-faint">
            seit {start.slice(8, 10)}.{start.slice(5, 7)}.
            {(() => {
              const w = wochenSeit(start);
              return w > 0 ? ` · ${w} ${w === 1 ? "Woche" : "Wochen"}` : " · diese Woche";
            })()}
          </span>
        ) : (
          <span className="text-xs text-faint">neu — noch kein Verlauf</span>
        )}
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
      {!start ? (
        <div className="h-[260px] flex items-center justify-center text-faint text-sm text-center px-4">
          Diese Konstellation ist neu (Prognose für die kommende Woche) — es gibt
          noch keinen Kursverlauf seit dem Signal.
        </div>
      ) : loading ? (
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
