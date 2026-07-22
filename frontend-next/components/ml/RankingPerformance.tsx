"use client";

import { useEffect, useState } from "react";
import Segmented from "@/components/ui/Segmented";
import CandleChart from "@/components/charts/CandleChart";
import { fetchCandles, type Candle } from "@/lib/gva/api";
import type { PairIdea } from "@/lib/ml/ranking";
import { candleKey } from "@/lib/ml/perfCandles";
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
 * Die Kerzen aller Kandidaten (Daily + Weekly) kommen serverseitig vorgeladen
 * (`preloaded`, Quelle OANDA über Renders warme Cache) → Umschalten ohne
 * Ladezeit. Fehlt ein Eintrag (Render-Kaltstart bei SSR), wird er clientseitig
 * nachgeladen. Kerze/Linie sind reine Zeichenmodi derselben Daten.
 */
export default function RankingPerformance({
  pairs,
  startByPair,
  preloaded,
}: {
  pairs: PairIdea[];
  /** Pair-Anzeigename → 'YYYY-MM-DD'; fehlt = Signal ist neu. */
  startByPair: Record<string, string>;
  /** `${SYMBOL}|${D|W}` → Kerzen, serverseitig vorgeladen. */
  preloaded: Record<string, Candle[]>;
}) {
  const [sel, setSel] = useState(0);
  const [gran, setGran] = useState<"D" | "W">("D");
  const [mode, setMode] = useState<"candle" | "line">("candle");
  // Start mit den vorgeladenen Daten; clientseitige Nachladungen füllen Lücken.
  const [cache, setCache] = useState<Record<string, Candle[]>>(preloaded);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const active = pairs[sel];
  const symbol = active ? active.pair.replace("/", "") : "";
  // Startpunkt des aktiven Pairs; "" wenn das Signal neu ist oder der errechnete
  // Lauf in der Zukunft liegt.
  const start = active ? (sinceForPair(startByPair[active.pair]) ?? "") : "";
  const key = candleKey(symbol, gran);
  const hasStart = Boolean(symbol && start);
  const candles = hasStart ? (cache[key] ?? []) : [];
  const need = hasStart && !(key in cache);

  // Fallback: fehlt der Eintrag (Render war beim Vorladen im Kaltstart), einmal
  // nachladen und cachen. Bei vollständig vorgeladenen Daten läuft das nie.
  useEffect(() => {
    if (!need) return;
    let alive = true;
    setLoadingKey(key);
    fetchCandles(symbol, gran, start)
      .then((cs) => alive && setCache((c) => ({ ...c, [key]: cs })))
      .catch(() => alive && setCache((c) => ({ ...c, [key]: [] })))
      .finally(() => alive && setLoadingKey((k) => (k === key ? null : k)));
    return () => {
      alive = false;
    };
  }, [need, key, symbol, gran, start]);

  if (pairs.length === 0) {
    return (
      <p className="text-sm text-muted">
        Diese Woche keine Kandidaten-Pairs — kein Performance-Chart.
      </p>
    );
  }

  const loading = loadingKey === key;

  // %-Bewegung eines Pairs seit Signalstart (aktuelle Granularität) — für die
  // Chart-Anzeige des aktiven Pairs UND die Grün/Rot-Färbung aller Pills.
  const pctFor = (p: PairIdea): number | null => {
    const st = sinceForPair(startByPair[p.pair]) ?? "";
    if (!st) return null;
    const cs = cache[candleKey(p.pair.replace("/", ""), gran)];
    if (!cs || cs.length < 2) return null;
    const f = cs[0].close;
    const l = cs[cs.length - 1].close;
    return f ? ((l - f) / f) * 100 : null;
  };
  // „Günstig" = Bewegung in Signalrichtung (Long → hoch, Short → runter).
  const favorableOf = (p: PairIdea, pct: number | null): boolean | null =>
    pct == null ? null : p.direction === "long" ? pct > 0 : pct < 0;

  const pct = active ? pctFor(active) : null;
  const favorable = active ? favorableOf(active, pct) : null;

  return (
    <div className="space-y-4">
      {/* Pair-Auswahl (wirkt wie Tabs) — Grün/Rot = Bewegung vs. Signal (Übersicht) */}
      <div className="flex flex-wrap gap-1.5">
        {pairs.map((p, i) => {
          const fav = favorableOf(p, pctFor(p));
          const selected = i === sel;
          const tone = selected
            ? "bg-accent/15 text-accent border-accent"
            : fav === true
              ? "bg-up/10 text-up border-up/40 hover:border-up"
              : fav === false
                ? "bg-down/10 text-down border-down/40 hover:border-down"
                : "bg-surface text-muted border-border hover:text-text hover:border-border2";
          return (
            <button
              key={p.pair}
              onClick={() => setSel(i)}
              title={
                fav == null
                  ? "noch kein Verlauf"
                  : fav
                    ? "in Signalrichtung (im Plus)"
                    : "gegen das Signal"
              }
              className={`px-2.5 py-1 rounded text-xs font-bold font-mono border transition-colors ${tone}`}
            >
              {p.pair}
            </button>
          );
        })}
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
            className={`ml-auto font-mono text-sm font-bold ${favorable ? "text-up" : "text-down"}`}
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
      {!hasStart ? (
        <div className="h-[260px] flex items-center justify-center text-faint text-sm text-center px-4">
          Diese Konstellation ist neu (Prognose für die kommende Woche) — es gibt
          noch keinen Kursverlauf seit dem Signal.
        </div>
      ) : loading ? (
        <div className="h-[260px] flex items-center justify-center text-muted text-sm font-mono">
          Lade Kursdaten …
        </div>
      ) : candles.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-down text-sm text-center px-4">
          Kursdaten nicht ladbar — Backend (Render) evtl. im Kaltstart.
        </div>
      ) : (
        <CandleChart candles={candles} mode={mode} />
      )}
    </div>
  );
}
