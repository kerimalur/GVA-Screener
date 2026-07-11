"use client";

import { useEffect, useMemo, useState } from "react";
import type { FactorMatrix } from "@/lib/ml/factorMatrix";
import { G8_CURRENCIES } from "@/lib/constants/instruments";

/**
 * ML-Labor: interaktiver Explorer über die Faktor-Matrix.
 * Alle Aggregationen laufen im Browser — Filter ohne Server-Roundtrip.
 *
 * Zeilenformat der Matrix: [weekIdx, pairIdx, d1..d5, r1..r4]
 * d* ∈ {-1,0,1} je Faktor, r* = Pair-Rendite % (LONG-Sicht) je Horizont.
 */

const D_OFF = 2; // Offset der Faktor-Dirs in der Zeile
const R_OFF = 7; // Offset der Returns

type MatchMode = "unanimous" | "majority";

/**
 * Richtung einer Faktor-Auswahl für eine Zeile.
 * unanimous: alle gewählten Faktoren müssen exakt gleich zeigen (streng, kleines n).
 * majority: Mehrheit der gewählten Faktoren muss übereinstimmen — mind. die Hälfte
 * (aufgerundet) aller gewählten Faktoren, nicht nur der gefeuerten. Lockert die
 * UND-Verknüpfung kontrolliert, gleiches Prinzip wie im Tool-Verdict selbst
 * (≥2 gleichgerichtete Faktoren + Mehrheit).
 */
function matchDirection(row: Array<number | null>, idx: number[], mode: MatchMode): number {
  if (mode === "unanimous") {
    const first = row[D_OFF + idx[0]] as number;
    if (first === 0) return 0;
    for (const i of idx) if (row[D_OFF + i] !== first) return 0;
    return first;
  }
  let longs = 0;
  let shorts = 0;
  for (const i of idx) {
    const d = row[D_OFF + i] as number;
    if (d === 1) longs++;
    else if (d === -1) shorts++;
  }
  const need = Math.ceil(idx.length / 2);
  if (longs > shorts && longs >= need) return 1;
  if (shorts > longs && shorts >= need) return -1;
  return 0;
}

interface Stat {
  n: number;
  wr: number | null; // Trefferquote %
  avg: number | null; // Ø gerichtete Rendite %
  sig: boolean; // |WR-50| statistisch signifikant (95 %)
}

function makeStat(n: number, hits: number, sumRet: number): Stat {
  if (n === 0) return { n: 0, wr: null, avg: null, sig: false };
  const p = hits / n;
  const se = Math.sqrt(0.25 / n);
  return {
    n,
    wr: p * 100,
    avg: sumRet / n,
    sig: Math.abs(p - 0.5) > 1.96 * se,
  };
}

function wrCls(s: Stat, minN: number): string {
  if (s.n < minN || s.wr === null) return "text-faint";
  if (!s.sig) return "text-muted";
  return s.wr >= 50 ? "text-up" : "text-down";
}

function wrBg(s: Stat, minN: number): string {
  if (s.n < minN || s.wr === null) return "";
  if (s.wr >= 57) return "bg-up/20";
  if (s.wr >= 53) return "bg-up/10";
  if (s.wr <= 43) return "bg-down/20";
  if (s.wr <= 47) return "bg-down/10";
  return "";
}

function fmtWr(s: Stat): string {
  return s.wr === null ? "–" : `${s.wr.toFixed(1)}%`;
}

export default function LaborExplorer() {
  const [matrix, setMatrix] = useState<FactorMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter-State
  const [horizon, setHorizon] = useState(2); // Wochen, Default 2
  const [periodYears, setPeriodYears] = useState(8);
  const [selected, setSelected] = useState<Set<number>>(new Set([0, 3])); // Zins + Saison
  const [minN, setMinN] = useState(30);
  const [matchMode, setMatchMode] = useState<MatchMode>("unanimous");

  useEffect(() => {
    fetch("/api/ml/matrix")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setMatrix)
      .catch((e) => setError(e instanceof Error ? e.message : "Fehler"));
  }, []);

  // Zeilen im gewählten Zeitraum
  const rows = useMemo(() => {
    if (!matrix) return [];
    const cutoffIdx = Math.max(0, matrix.weeks.length - periodYears * 52);
    return matrix.rows.filter((r) => (r[0] as number) >= cutoffIdx);
  }, [matrix, periodYears]);

  const hIdx = R_OFF + matrix?.horizons.indexOf(horizon)!;

  // — Auswahl-Kombination —
  const comboStat = useMemo(() => {
    if (!matrix || selected.size === 0) return makeStat(0, 0, 0);
    const idx = [...selected];
    let n = 0,
      hits = 0,
      sum = 0;
    for (const r of rows) {
      const dir = matchDirection(r, idx, matchMode);
      if (dir === 0) continue;
      const ret = r[hIdx];
      if (ret === null) continue;
      const signed = dir * (ret as number);
      n++;
      if (signed > 0) hits++;
      sum += signed;
    }
    return makeStat(n, hits, sum);
  }, [matrix, rows, selected, hIdx, matchMode]);

  // — Pair-Tabelle für die Auswahl —
  const pairStats = useMemo(() => {
    if (!matrix || selected.size === 0) return [];
    const idx = [...selected];
    const acc = new Map<number, { n: number; hits: number; sum: number }>();
    for (const r of rows) {
      const dir = matchDirection(r, idx, matchMode);
      if (dir === 0) continue;
      const ret = r[hIdx];
      if (ret === null) continue;
      const signed = dir * (ret as number);
      const pi = r[1] as number;
      const a = acc.get(pi) ?? { n: 0, hits: 0, sum: 0 };
      a.n++;
      if (signed > 0) a.hits++;
      a.sum += signed;
      acc.set(pi, a);
    }
    return [...acc.entries()]
      .map(([pi, a]) => ({ pair: matrix.pairs[pi].replace("_", "/"), stat: makeStat(a.n, a.hits, a.sum) }))
      .sort((a, b) => (b.stat.wr ?? -1) - (a.stat.wr ?? -1));
  }, [matrix, rows, selected, hIdx, matchMode]);

  // — Währung × Faktor-Heatmap (Einzelfaktoren) —
  const heatmap = useMemo(() => {
    if (!matrix) return [];
    // ccy -> factor -> acc; Pair-Zuordnung über Namen
    const pairCcys = matrix.pairs.map((p) => p.split("_") as [string, string]);
    const map = new Map<string, Array<{ n: number; hits: number; sum: number }>>();
    for (const ccy of G8_CURRENCIES) {
      map.set(ccy, matrix.factors.map(() => ({ n: 0, hits: 0, sum: 0 })));
    }
    for (const r of rows) {
      const [base, quote] = pairCcys[r[1] as number];
      const ret = r[hIdx];
      if (ret === null) continue;
      for (let fi = 0; fi < matrix.factors.length; fi++) {
        const d = r[D_OFF + fi] as number;
        if (d === 0) continue;
        const signed = d * (ret as number);
        for (const ccy of [base, quote]) {
          const accs = map.get(ccy);
          if (!accs) continue;
          const a = accs[fi];
          a.n++;
          if (signed > 0) a.hits++;
          a.sum += signed;
        }
      }
    }
    return G8_CURRENCIES.map((ccy) => ({
      ccy,
      cells: (map.get(ccy) ?? []).map((a) => makeStat(a.n, a.hits, a.sum)),
    }));
  }, [matrix, rows, hIdx]);

  // — Kombi-Leaderboard: alle Teilmengen ≥1 der 5 Faktoren —
  const leaderboard = useMemo(() => {
    if (!matrix) return [];
    const nf = matrix.factors.length;
    const out: Array<{ label: string; size: number; stat: Stat }> = [];
    for (let mask = 1; mask < 1 << nf; mask++) {
      const idx: number[] = [];
      for (let i = 0; i < nf; i++) if (mask & (1 << i)) idx.push(i);
      let n = 0,
        hits = 0,
        sum = 0;
      for (const r of rows) {
        const dir = matchDirection(r, idx, matchMode);
        if (dir === 0) continue;
        const ret = r[hIdx];
        if (ret === null) continue;
        const signed = dir * (ret as number);
        n++;
        if (signed > 0) hits++;
        sum += signed;
      }
      const stat = makeStat(n, hits, sum);
      if (stat.n >= minN) {
        out.push({ label: idx.map((i) => matrix.factors[i]).join(" + "), size: idx.length, stat });
      }
    }
    return out.sort((a, b) => (b.stat.wr ?? -1) - (a.stat.wr ?? -1));
  }, [matrix, rows, hIdx, minN, matchMode]);

  if (error) {
    return <p className="text-down text-sm font-mono">Matrix-Ladefehler: {error}</p>;
  }
  if (!matrix) {
    return (
      <p className="text-muted text-sm font-mono animate-pulse">
        Lade Faktor-Matrix (~17 Jahre × 28 Pairs — erster Aufruf kann 20–30 s dauern) …
      </p>
    );
  }

  const toggleFactor = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const seg = (active: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
      active ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-text"
    }`;

  return (
    <div className="space-y-6">
      {/* ── Filterleiste ── */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded border border-border bg-surface2 p-3">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Horizont (Kursreaktion)</div>
          <div className="flex gap-1.5">
            {matrix.horizons.map((h) => (
              <button key={h} className={seg(horizon === h)} onClick={() => setHorizon(h)}>
                {h}W
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Zeitraum</div>
          <div className="flex gap-1.5">
            {[2, 4, 8, 17].map((y) => (
              <button key={y} className={seg(periodYears === y)} onClick={() => setPeriodYears(y)}>
                {y} J
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">
            Kombi-Regel — warum n manchmal klein ist
          </div>
          <div className="flex gap-1.5">
            <button className={seg(matchMode === "unanimous")} onClick={() => setMatchMode("unanimous")}>
              Einstimmig
            </button>
            <button className={seg(matchMode === "majority")} onClick={() => setMatchMode("majority")}>
              Mehrheit
            </button>
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Faktoren</div>
          <div className="flex gap-1.5 flex-wrap">
            {matrix.factors.map((f, i) => (
              <button key={f} className={seg(selected.has(i))} onClick={() => toggleFactor(i)}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Min. Stichprobe</div>
          <div className="flex gap-1.5">
            {[10, 30, 100].map((m) => (
              <button key={m} className={seg(minN === m)} onClick={() => setMinN(m)}>
                n≥{m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Auswahl-Ergebnis ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface2 border border-border rounded p-3">
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Auswahl</div>
          <div className="text-[13px] font-bold mt-1 leading-tight">
            {selected.size === 0 ? "— keine Faktoren —" : [...selected].map((i) => matrix.factors[i]).join(" + ")}
          </div>
          <div className="text-[11px] text-muted font-mono mt-0.5">{horizon}W · {periodYears} Jahre</div>
        </div>
        <div className="bg-surface2 border border-border rounded p-3">
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Signale</div>
          <div className="text-xl font-bold font-mono mt-1">{comboStat.n.toLocaleString("de-CH")}</div>
        </div>
        <div className="bg-surface2 border border-border rounded p-3">
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Winrate</div>
          <div className={`text-xl font-bold font-mono mt-1 ${wrCls(comboStat, minN)}`}>{fmtWr(comboStat)}</div>
          <div className="text-[11px] text-muted font-mono mt-0.5">
            {comboStat.sig ? "statistisch signifikant" : "nicht signifikant (Zufall möglich)"}
          </div>
        </div>
        <div className="bg-surface2 border border-border rounded p-3">
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Ø Rendite</div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              comboStat.avg === null ? "text-faint" : comboStat.avg > 0 ? "text-up" : "text-down"
            }`}
          >
            {comboStat.avg === null ? "–" : `${comboStat.avg > 0 ? "+" : ""}${comboStat.avg.toFixed(2)}%`}
          </div>
        </div>
      </div>

      {/* ── Währung × Faktor-Heatmap ── */}
      <div>
        <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
          Währung × Einzelfaktor — Winrate ({horizon}W, {periodYears} J) · grau = n&lt;{minN} oder nicht signifikant
        </div>
        <div className="overflow-x-auto">
          <table className="text-[12px] min-w-[560px]">
            <thead>
              <tr className="text-[9px] text-faint font-mono uppercase tracking-wider">
                <th className="text-left pb-1.5 pr-3">Währung</th>
                {matrix.factors.map((f) => (
                  <th key={f} className="text-right pb-1.5 px-3">{f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.map((row) => (
                <tr key={row.ccy} className="border-t border-border">
                  <td className="py-1.5 pr-3 font-mono font-bold">{row.ccy}</td>
                  {row.cells.map((s, i) => (
                    <td key={i} className={`py-1.5 px-3 text-right font-mono ${wrCls(s, minN)} ${wrBg(s, minN)}`}>
                      {fmtWr(s)}
                      <span className="text-faint text-[9px]"> {s.n}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Kombi-Leaderboard ── */}
      <div>
        <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
          Bestenliste — alle Kombinationen ({horizon}W, {periodYears} J, n≥{minN})
        </div>
        <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
          <table className="w-full text-[12px] min-w-[480px]">
            <thead>
              <tr className="text-[9px] text-faint font-mono uppercase tracking-wider sticky top-0 bg-surface">
                <th className="text-left pb-1.5 px-2">Kombination</th>
                <th className="text-right pb-1.5 px-2">n</th>
                <th className="text-right pb-1.5 px-2">Winrate</th>
                <th className="text-right pb-1.5 px-2">Ø Rendite</th>
                <th className="text-right pb-1.5 px-2">Signifikant</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((c) => (
                <tr key={c.label} className="border-t border-border">
                  <td className="py-1.5 px-2 font-medium">
                    {c.label} <span className="text-faint text-[10px] font-mono">({c.size})</span>
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-muted">{c.stat.n}</td>
                  <td className={`py-1.5 px-2 text-right font-mono font-bold ${wrCls(c.stat, minN)}`}>
                    {fmtWr(c.stat)}
                  </td>
                  <td
                    className={`py-1.5 px-2 text-right font-mono ${
                      c.stat.avg === null ? "text-faint" : c.stat.avg > 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {c.stat.avg === null ? "–" : `${c.stat.avg > 0 ? "+" : ""}${c.stat.avg.toFixed(2)}%`}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-[10px]">
                    {c.stat.sig ? <span className="text-up">✓</span> : <span className="text-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pair-Tabelle der Auswahl ── */}
      {selected.size > 0 && (
        <div>
          <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
            Auswahl nach Pair — wo funktioniert die Kombination? ({horizon}W, {periodYears} J)
          </div>
          <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
            <table className="w-full text-[12px] min-w-[420px]">
              <thead>
                <tr className="text-[9px] text-faint font-mono uppercase tracking-wider sticky top-0 bg-surface">
                  <th className="text-left pb-1.5 px-2">Pair</th>
                  <th className="text-right pb-1.5 px-2">n</th>
                  <th className="text-right pb-1.5 px-2">Winrate</th>
                  <th className="text-right pb-1.5 px-2">Ø Rendite</th>
                </tr>
              </thead>
              <tbody>
                {pairStats.map((p) => (
                  <tr key={p.pair} className="border-t border-border">
                    <td className="py-1.5 px-2 font-mono font-medium">{p.pair}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-muted">{p.stat.n}</td>
                    <td className={`py-1.5 px-2 text-right font-mono font-bold ${wrCls(p.stat, minN)}`}>
                      {fmtWr(p.stat)}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono ${
                        p.stat.avg === null ? "text-faint" : p.stat.avg > 0 ? "text-up" : "text-down"
                      }`}
                    >
                      {p.stat.avg === null ? "–" : `${p.stat.avg > 0 ? "+" : ""}${p.stat.avg.toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-faint leading-relaxed border-t border-border/50 pt-3">
        Kombi-Regel: {matchMode === "unanimous"
          ? "Einstimmig — alle gewählten Faktoren müssen exakt gleich zeigen (streng, kleineres n je Pair)."
          : "Mehrheit — mind. die Hälfte der gewählten Faktoren muss übereinstimmen (lockerer, mehr n)."}{" "}
        Treffer = Pair-Close nach {horizon} Wochen in Signalrichtung. COT-NC = Non-Commercials,
        COT-C = Commercials (Hedger) — gleiche Flow-Logik (4W-Δ in % OI, Schwelle ±4).
        Signifikanz: 95 %-Konfidenz gegen Münzwurf; kleine Stichproben und nicht-signifikante
        Werte sind grau — dort kann das Ergebnis Zufall sein. Ohne Spread/Kosten.
      </p>
    </div>
  );
}
