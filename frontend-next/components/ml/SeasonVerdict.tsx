"use client";

import { useEffect, useMemo, useState } from "react";
import type { Season2Matrix, Season2Row } from "@/lib/ml/seasonality2";

/**
 * Saison-Verdict — automatische, ehrliche Prüfung statt Selbst-Interpretation.
 *
 * Scannt jedes (Pair × Monat), behält nur was (a) statistisch signifikant ist
 * UND (b) in der ERSTEN und ZWEITEN Hälfte der Historie gleich funktioniert
 * (Out-of-Sample-Persistenz — der Killer-Filter gegen Zufalls-Muster). Rechnet
 * gegen Mehrfachtestung: bei hunderten geprüften Zellen sind ~5 % „Treffer“
 * reiner Zufall. Nur was das übersteht, ist echte Edge.
 */

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

interface Stat {
  n: number;
  wr: number | null;
  sig: boolean;
}
function stat(n: number, hits: number): Stat {
  if (n === 0) return { n: 0, wr: null, sig: false };
  const p = hits / n;
  return { n, wr: p * 100, sig: Math.abs(p - 0.5) > 1.96 * Math.sqrt(0.25 / n) };
}

function seasonDir(r: Season2Row): number {
  if (r.monthAvgReturn === null) return 0;
  if (r.monthAvgReturn > 0.05) return 1;
  if (r.monthAvgReturn < -0.05) return -1;
  return 0;
}

const retOf = (r: Season2Row, h: number) => r[`ret${h}w` as keyof Season2Row] as number | null;

interface Cell {
  pair: string;
  month: number;
  dir: number;
  full: Stat;
  h1: Stat;
  h2: Stat;
  robust: boolean;
}

export default function SeasonVerdict() {
  const [matrix, setMatrix] = useState<Season2Matrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(4);
  const [minN, setMinN] = useState(40);

  useEffect(() => {
    fetch("/api/ml/season")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setMatrix)
      .catch((e) => setError(e instanceof Error ? e.message : "Fehler"));
  }, []);

  const result = useMemo(() => {
    if (!matrix) return null;
    const splitWeek = matrix.weeks.length / 2; // erste vs zweite Hälfte der Historie

    // — Pair × Monat scannen —
    type Acc = { n: number; hits: number; n1: number; h1: number; n2: number; h2: number; dirSum: number };
    const cells = new Map<string, Acc>();
    for (const r of matrix.rows) {
      const dir = seasonDir(r);
      if (dir === 0) continue;
      const ret = retOf(r, horizon);
      if (ret === null) continue;
      const key = `${r.pairIdx}_${r.month}`;
      const a = cells.get(key) ?? { n: 0, hits: 0, n1: 0, h1: 0, n2: 0, h2: 0, dirSum: 0 };
      const win = dir * ret > 0 ? 1 : 0;
      a.n++;
      a.hits += win;
      a.dirSum += dir;
      if (r.weekIdx < splitWeek) {
        a.n1++;
        a.h1 += win;
      } else {
        a.n2++;
        a.h2 += win;
      }
      cells.set(key, a);
    }

    const scored: Cell[] = [];
    let tested = 0;
    for (const [key, a] of cells) {
      if (a.n < minN) continue;
      tested++;
      const [pi, m] = key.split("_").map(Number);
      const full = stat(a.n, a.hits);
      const h1 = stat(a.n1, a.h1);
      const h2 = stat(a.n2, a.h2);
      // Persistenz: beide Hälften dieselbe Seite von 50 und je ≥ 15 Fälle
      const sameSide =
        h1.wr !== null &&
        h2.wr !== null &&
        a.n1 >= 15 &&
        a.n2 >= 15 &&
        ((h1.wr >= 52 && h2.wr >= 52) || (h1.wr <= 48 && h2.wr <= 48));
      const robust = full.sig && sameSide;
      scored.push({
        pair: matrix.pairs[pi].replace("_", "/"),
        month: m,
        dir: a.dirSum >= 0 ? 1 : -1,
        full,
        h1,
        h2,
        robust,
      });
    }
    const survivors = scored.filter((c) => c.robust).sort((a, b) => (b.full.wr ?? 0) - (a.full.wr ?? 0));
    const expectedFalse = tested * 0.05;

    // — Monats-Ebene (über alle Pairs gepoolt) —
    const monthAcc = new Map<number, { n: number; hits: number; n1: number; h1: number; n2: number; h2: number }>();
    for (const r of matrix.rows) {
      const dir = seasonDir(r);
      if (dir === 0) continue;
      const ret = retOf(r, horizon);
      if (ret === null) continue;
      const a = monthAcc.get(r.month) ?? { n: 0, hits: 0, n1: 0, h1: 0, n2: 0, h2: 0 };
      const win = dir * ret > 0 ? 1 : 0;
      a.n++;
      a.hits += win;
      if (r.weekIdx < splitWeek) {
        a.n1++;
        a.h1 += win;
      } else {
        a.n2++;
        a.h2 += win;
      }
      monthAcc.set(r.month, a);
    }
    const months = [...monthAcc.entries()]
      .map(([m, a]) => {
        const full = stat(a.n, a.hits);
        const h1 = stat(a.n1, a.h1);
        const h2 = stat(a.n2, a.h2);
        const stable =
          h1.wr !== null &&
          h2.wr !== null &&
          full.sig &&
          ((h1.wr >= 51 && h2.wr >= 51) || (h1.wr <= 49 && h2.wr <= 49));
        // Verdict: Bias folgen (LONG-Edge), Bias faden (invertieren), oder ignorieren
        let verdict: "follow" | "fade" | "none" = "none";
        if (stable && full.wr !== null) {
          if (full.wr >= 54) verdict = "follow";
          else if (full.wr <= 46) verdict = "fade";
        }
        // effektive WR der handelbaren Regel (faden = 100−WR)
        const edgeWr = full.wr === null ? null : verdict === "fade" ? 100 - full.wr : full.wr;
        return { month: m, full, h1, h2, stable, verdict, edgeWr };
      })
      .sort((a, b) => a.month - b.month);

    const actionable = months
      .filter((m) => m.verdict !== "none")
      .sort((a, b) => (b.edgeWr ?? 0) - (a.edgeWr ?? 0));

    return { survivors, tested, expectedFalse, months, actionable };
  }, [matrix, horizon, minN]);

  if (error) return <p className="text-down text-sm font-mono">Verdict-Ladefehler: {error}</p>;
  if (!matrix || !result)
    return <p className="text-muted text-sm font-mono animate-pulse">Prüfe Saison-Muster…</p>;

  const { survivors, tested, expectedFalse, months, actionable } = result;
  const realEdge = actionable.length > 0;

  const seg = (a: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
      a ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-text"
    }`;
  const wrCls = (s: Stat) =>
    s.wr === null ? "text-faint" : !s.sig ? "text-muted" : s.wr >= 50 ? "text-up" : "text-down";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((h) => (
            <button key={h} className={seg(horizon === h)} onClick={() => setHorizon(h)}>
              {h}W
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[30, 40, 60].map((m) => (
            <button key={m} className={seg(minN === m)} onClick={() => setMinN(m)}>
              n≥{m}
            </button>
          ))}
        </div>
      </div>

      {/* Headline-Verdict — Klartext-Empfehlung */}
      <div
        className={`rounded border p-3.5 ${
          realEdge ? "border-up/40 bg-up/5" : "border-warn/40 bg-warn/5"
        }`}
      >
        <div className="text-[9px] uppercase tracking-widest text-faint mb-2">
          Automatisches Urteil ({horizon}W · über alle 28 Pairs gepoolt)
        </div>
        {realEdge ? (
          <div className="space-y-1.5">
            {actionable.map((m) => (
              <div key={m.month} className="flex items-baseline gap-2 text-[13px]">
                <span
                  className={`font-mono font-black w-14 ${m.verdict === "follow" ? "text-up" : "text-down"}`}
                >
                  {MONTHS[m.month - 1]}
                </span>
                <span className="text-text font-bold">
                  {m.verdict === "follow" ? "Saison-Bias FOLGEN" : "Saison-Bias FADEN (invertieren)"}
                </span>
                <span className={`font-mono ${m.verdict === "follow" ? "text-up" : "text-down"}`}>
                  ~{m.edgeWr!.toFixed(0)}% Trefferquote
                </span>
                <span className="text-faint font-mono text-[11px]">
                  (roh {m.full.wr!.toFixed(1)} %, beide Zeithälften stabil)
                </span>
              </div>
            ))}
            <div className="text-[11.5px] text-muted leading-relaxed pt-1.5">
              Alle anderen Monate: <span className="text-text">keine verlässliche Edge</span> — ignorieren.
              Diese Urteile halten in erster UND zweiter Hälfte der Historie (kein Zufall).
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-warn font-bold">
            Kein verlässliches Saison-Muster ({horizon}W) über alle Pairs. Ignorieren.
          </div>
        )}
      </div>

      {/* Überlebende Muster */}
      {survivors.length > 0 && (
        <div>
          <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
            Einzelne Pair×Monat-Muster ({survivors.length} von {tested}, Zufall ~{expectedFalse.toFixed(0)})
          </div>
          <div className="text-[11px] text-faint mb-2 leading-relaxed">
            Achtung: Pairs sind korreliert (z. B. alle USD-Paare im Oktober) — das sind NICHT{" "}
            {survivors.length} unabhängige Edges, sondern wenige Monats-Effekte über viele Paare. Das
            belastbare Urteil steht oben (gepoolt). Diese Tabelle nur zur Feinauswahl der Pairs.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[520px]">
              <thead>
                <tr className="text-[9px] text-faint font-mono uppercase tracking-wider text-left">
                  <th className="pb-1.5 px-2">Pair</th>
                  <th className="pb-1.5 px-2">Monat</th>
                  <th className="pb-1.5 px-2">Richtung</th>
                  <th className="pb-1.5 px-2 text-right">WR gesamt</th>
                  <th className="pb-1.5 px-2 text-right">1. Hälfte</th>
                  <th className="pb-1.5 px-2 text-right">2. Hälfte</th>
                </tr>
              </thead>
              <tbody>
                {survivors.map((c) => (
                  <tr key={`${c.pair}${c.month}`} className="border-t border-border">
                    <td className="py-1.5 px-2 font-mono font-medium">{c.pair}</td>
                    <td className="py-1.5 px-2 font-mono">{MONTHS[c.month - 1]}</td>
                    <td className={`py-1.5 px-2 font-mono font-bold ${c.dir === 1 ? "text-up" : "text-down"}`}>
                      {c.dir === 1 ? "LONG" : "SHORT"}
                    </td>
                    <td className={`py-1.5 px-2 text-right font-mono font-bold ${wrCls(c.full)}`}>
                      {c.full.wr!.toFixed(1)}% <span className="text-faint text-[9px]">n{c.full.n}</span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-muted">{c.h1.wr!.toFixed(0)}%</td>
                    <td className="py-1.5 px-2 text-right font-mono text-muted">{c.h2.wr!.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monats-Ebene (über alle Pairs) — zeigt Stabilität statt Einzelzelle */}
      <div>
        <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
          Monat über ALLE Pairs gepoolt — hält der Monat in beiden Zeithälften? ({horizon}W)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[520px]">
            <thead>
              <tr className="text-[9px] text-faint font-mono uppercase tracking-wider text-left">
                <th className="pb-1.5 px-2">Monat</th>
                <th className="pb-1.5 px-2 text-right">WR gesamt</th>
                <th className="pb-1.5 px-2 text-right">1. Hälfte</th>
                <th className="pb-1.5 px-2 text-right">2. Hälfte</th>
                <th className="pb-1.5 px-2">Urteil</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="py-1.5 px-2 font-mono font-medium">{MONTHS[m.month - 1]}</td>
                  <td className={`py-1.5 px-2 text-right font-mono font-bold ${wrCls(m.full)}`}>
                    {m.full.wr!.toFixed(1)}%
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-muted">{m.h1.wr?.toFixed(0)}%</td>
                  <td className="py-1.5 px-2 text-right font-mono text-muted">{m.h2.wr?.toFixed(0)}%</td>
                  <td className="py-1.5 px-2 font-mono text-[11px]">
                    {m.verdict === "follow" ? (
                      <span className="text-up font-bold">FOLGEN ~{m.edgeWr!.toFixed(0)}%</span>
                    ) : m.verdict === "fade" ? (
                      <span className="text-down font-bold">FADEN ~{m.edgeWr!.toFixed(0)}%</span>
                    ) : (
                      <span className="text-faint">— ignorieren</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-faint leading-relaxed border-t border-border/50 pt-3">
        Richtung = as-of Saison-Bias (nur Jahre vor dem Stichtag, kein Lookahead). „Stabil“ = signifikant
        und beide Zeithälften auf derselben Seite von 50 %. Das ist der Unterschied zwischen echter
        Saisonalität und einem Muster, das nur zufällig in einem Zeitraum gut aussah. Ohne Spread/Kosten.
      </p>
    </div>
  );
}
