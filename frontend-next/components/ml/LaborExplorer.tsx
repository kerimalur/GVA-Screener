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

const D_OFF = 2; // Offset der binären Faktor-Dirs
const Z_OFF = 7; // Offset der kontinuierlichen z-Scores
const R_OFF = 12; // Offset der Returns

type MatchMode = "unanimous" | "majority";
type Sample = "full" | "is" | "oos";
type Weighting = "equal" | "edge";
type LaborTab = "uebersicht" | "heatmap" | "bestenliste" | "pair";
type SortKey = "robust" | "wr" | "avg" | "n";

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
  const [splitPct, setSplitPct] = useState(60); // In-Sample-Anteil (%)
  const [weighting, setWeighting] = useState<Weighting>("edge");
  const [tab, setTab] = useState<LaborTab>("uebersicht");
  const [sortKey, setSortKey] = useState<SortKey>("robust");

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

  // Split-Woche für IS/OOS — Basis für Walk-Forward-Composite UND Robustheits-Scan
  // der Bestenliste (gleicher Regler `splitPct`, ein einziger Schnittpunkt in der Historie).
  const splitWeek = useMemo(() => {
    const weekIdxs = rows.map((r) => r[0] as number);
    if (weekIdxs.length === 0) return null;
    const minW = Math.min(...weekIdxs);
    const maxW = Math.max(...weekIdxs);
    return minW + Math.round((maxW - minW) * (splitPct / 100));
  }, [rows, splitPct]);

  // — Walk-Forward: z-Score-Composite, Gewichte auf In-Sample gelernt,
  //   out-of-sample getestet (verhindert Overfitting) —
  const walkForward = useMemo(() => {
    if (!matrix || selected.size === 0 || splitWeek === null) return null;
    const idx = [...selected];
    const splitW = splitWeek;
    const isRows = rows.filter((r) => (r[0] as number) < splitW);
    const oosRows = rows.filter((r) => (r[0] as number) >= splitW);

    // Kantengewicht je Faktor aus dem In-Sample: 2·(WR−0.5) ∈ [−1,1].
    // Negativ = Faktor ist konträr → wird automatisch invertiert (löst #2).
    const edgeWeights = idx.map((fi) => {
      let n = 0,
        hits = 0;
      for (const r of isRows) {
        const z = r[Z_OFF + fi] as number | null;
        if (z === null || z === 0) continue;
        const ret = r[hIdx];
        if (ret === null) continue;
        if (Math.sign(z) * (ret as number) > 0) hits++;
        n++;
      }
      const wr = n > 0 ? hits / n : 0.5;
      return Number((2 * (wr - 0.5)).toFixed(3));
    });
    const weights = weighting === "equal" ? idx.map(() => 1) : edgeWeights;

    const compositeOf = (r: Array<number | null>): number | null => {
      let comp = 0;
      let any = false;
      for (let k = 0; k < idx.length; k++) {
        const z = r[Z_OFF + idx[k]] as number | null;
        if (z === null) continue;
        comp += weights[k] * z;
        any = true;
      }
      return any ? comp : null;
    };

    const evalOn = (subset: Array<Array<number | null>>) => {
      let n = 0,
        hits = 0,
        sum = 0;
      for (const r of subset) {
        const comp = compositeOf(r);
        if (comp === null || comp === 0) continue;
        const ret = r[hIdx];
        if (ret === null) continue;
        const signed = (comp > 0 ? 1 : -1) * (ret as number);
        n++;
        if (signed > 0) hits++;
        sum += signed;
      }
      return makeStat(n, hits, sum);
    };

    // Konfidenz-Quintile (OOS): steigt die WR mit |Composite|? (löst #6)
    const pts: Array<{ conf: number; signed: number }> = [];
    for (const r of oosRows) {
      const comp = compositeOf(r);
      if (comp === null || comp === 0) continue;
      const ret = r[hIdx];
      if (ret === null) continue;
      pts.push({ conf: Math.abs(comp), signed: (comp > 0 ? 1 : -1) * (ret as number) });
    }
    pts.sort((a, b) => a.conf - b.conf);
    const buckets: Array<{ label: string; stat: Stat }> = [];
    const Q = 5;
    for (let b = 0; b < Q; b++) {
      const lo = Math.floor((b * pts.length) / Q);
      const hi = Math.floor(((b + 1) * pts.length) / Q);
      let n = 0,
        hits = 0,
        sum = 0;
      for (let i = lo; i < hi; i++) {
        n++;
        if (pts[i].signed > 0) hits++;
        sum += pts[i].signed;
      }
      buckets.push({ label: `Q${b + 1}${b === Q - 1 ? " (stärkste)" : b === 0 ? " (schwächste)" : ""}`, stat: makeStat(n, hits, sum) });
    }

    return {
      weights,
      factorNames: idx.map((i) => matrix.factors[i]),
      isStat: evalOn(isRows),
      oosStat: evalOn(oosRows),
      buckets,
      splitWeek: matrix.weeks[splitW] ?? null,
    };
  }, [matrix, rows, selected, hIdx, splitWeek, weighting]);

  // — Kombi-Scan: alle Teilmengen ≥1 der 5 Faktoren, je Kombi auch IS/OOS-Split —
  // "Robust" = hält der gleichen IS→OOS-Prüfung stand wie der Walk-Forward-Composite-
  // Block oben (Signifikanz + kein Einbruch OOS ggü. IS), damit Bestenliste und
  // Labor-Verdict nicht auf reiner (potenziell zufälliger) Gesamt-Winrate beruhen.
  interface ComboEntry {
    label: string;
    size: number;
    stat: Stat;
    isStat: Stat;
    oosStat: Stat;
    robust: boolean;
  }

  const comboStats = useMemo<ComboEntry[]>(() => {
    if (!matrix || splitWeek === null) return [];
    const nf = matrix.factors.length;
    const out: ComboEntry[] = [];
    for (let mask = 1; mask < 1 << nf; mask++) {
      const idx: number[] = [];
      for (let i = 0; i < nf; i++) if (mask & (1 << i)) idx.push(i);

      const acc = { n: 0, hits: 0, sum: 0 };
      const accIs = { n: 0, hits: 0, sum: 0 };
      const accOos = { n: 0, hits: 0, sum: 0 };
      for (const r of rows) {
        const dir = matchDirection(r, idx, matchMode);
        if (dir === 0) continue;
        const ret = r[hIdx];
        if (ret === null) continue;
        const signed = dir * (ret as number);
        const target = (r[0] as number) < splitWeek ? accIs : accOos;
        for (const a of [acc, target]) {
          a.n++;
          if (signed > 0) a.hits++;
          a.sum += signed;
        }
      }
      const stat = makeStat(acc.n, acc.hits, acc.sum);
      if (stat.n < minN) continue;
      const isStat = makeStat(accIs.n, accIs.hits, accIs.sum);
      const oosStat = makeStat(accOos.n, accOos.hits, accOos.sum);
      const robust =
        isStat.n >= minN &&
        oosStat.n >= minN &&
        oosStat.sig &&
        isStat.wr !== null &&
        oosStat.wr !== null &&
        oosStat.wr >= isStat.wr - 2;

      out.push({
        label: idx.map((i) => matrix.factors[i]).join(" + "),
        size: idx.length,
        stat,
        isStat,
        oosStat,
        robust,
      });
    }
    return out;
  }, [matrix, rows, hIdx, minN, matchMode, splitWeek]);

  const leaderboard = useMemo(() => {
    const arr = [...comboStats];
    switch (sortKey) {
      case "wr":
        return arr.sort((a, b) => (b.stat.wr ?? -1) - (a.stat.wr ?? -1));
      case "avg":
        return arr.sort((a, b) => (b.stat.avg ?? -Infinity) - (a.stat.avg ?? -Infinity));
      case "n":
        return arr.sort((a, b) => b.stat.n - a.stat.n);
      case "robust":
      default:
        return arr.sort((a, b) => {
          if (a.robust !== b.robust) return a.robust ? -1 : 1;
          return (b.stat.wr ?? -1) - (a.stat.wr ?? -1);
        });
    }
  }, [comboStats, sortKey]);

  // — Labor-Verdict: robusteste Kombi über den ganzen Scan, unabhängig von der
  //   manuell angehakten Auswahl (das eigentliche "zieht selbst Schlüsse") —
  const verdict = useMemo(() => {
    const robustCombos = comboStats.filter((c) => c.robust);
    if (robustCombos.length === 0) {
      return {
        text: "Keine Kombination hält der IS→OOS-Prüfung stand (aktueller Filter) — Overfit-Gefahr bei jeder Einzelauswahl.",
        cls: "border-border bg-surface2 text-muted",
        best: null as ComboEntry | null,
        count: 0,
      };
    }
    const best = robustCombos.reduce((a, b) => ((b.oosStat.wr ?? -1) > (a.oosStat.wr ?? -1) ? b : a));
    return {
      text: `Robusteste Kombi: ${best.label} — OOS ${fmtWr(best.oosStat)} (n=${best.oosStat.n})${
        robustCombos.length > 1 ? `, ${robustCombos.length} von ${comboStats.length} Kombinationen robust` : ", hält IS→OOS"
      }.`,
      cls: "border-up/30 bg-up/5 text-up",
      best,
      count: robustCombos.length,
    };
  }, [comboStats]);

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
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Walk-Forward-Split</div>
          <div className="flex gap-1.5">
            {[50, 60, 70].map((s) => (
              <button key={s} className={seg(splitPct === s)} onClick={() => setSplitPct(s)}>
                {s}/{100 - s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Gewichtung</div>
          <div className="flex gap-1.5">
            <button className={seg(weighting === "equal")} onClick={() => setWeighting("equal")}>
              Gleich
            </button>
            <button className={seg(weighting === "edge")} onClick={() => setWeighting("edge")}>
              Edge (IS)
            </button>
          </div>
        </div>
      </div>

      {/* ── Sub-Tabs ── */}
      <div className="flex gap-1.5 border-b border-border pb-3">
        {(
          [
            ["uebersicht", "Übersicht"],
            ["heatmap", "Heatmap"],
            ["bestenliste", "Bestenliste"],
            ["pair", "Pair-Tabelle"],
          ] as Array<[LaborTab, string]>
        ).map(([key, label]) => (
          <button key={key} className={seg(tab === key)} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "uebersicht" && (
      <>
      {/* ── Labor-Verdict: automatischer Scan, robusteste Kombi ── */}
      <div className={`rounded border p-3 text-[13px] font-medium ${verdict.cls}`}>
        {verdict.text}
      </div>

      {/* ── Walk-Forward-Validierung (Composite aus z-Scores) ── */}
      {walkForward && (
        <div className="rounded border border-accent/30 bg-accent/5 p-3.5 space-y-3">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div className="text-[12px] font-bold">
              Walk-Forward-Composite ({horizon}W) —{" "}
              <span className="text-muted font-normal">
                {walkForward.factorNames.join(" + ")}, {weighting === "edge" ? "Edge-gewichtet" : "gleich gewichtet"}
              </span>
            </div>
            {walkForward.splitWeek && (
              <div className="text-[10px] text-faint font-mono">
                Split: IS bis {new Date(walkForward.splitWeek).toLocaleDateString("de-CH")}, OOS danach
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-surface border border-border rounded p-3">
              <div className="text-[10px] text-muted font-mono uppercase tracking-wider">In-Sample WR</div>
              <div className={`text-xl font-bold font-mono mt-1 ${wrCls(walkForward.isStat, minN)}`}>
                {fmtWr(walkForward.isStat)}
              </div>
              <div className="text-[10px] text-faint font-mono mt-0.5">n={walkForward.isStat.n}</div>
            </div>
            <div className="bg-surface border border-border rounded p-3">
              <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
                Out-of-Sample WR
              </div>
              <div className={`text-2xl font-black font-mono mt-1 ${wrCls(walkForward.oosStat, minN)}`}>
                {fmtWr(walkForward.oosStat)}
              </div>
              <div className="text-[10px] text-faint font-mono mt-0.5">
                n={walkForward.oosStat.n} · {walkForward.oosStat.sig ? "signifikant" : "n.s."}
              </div>
            </div>
            <div className="bg-surface border border-border rounded p-3">
              <div className="text-[10px] text-muted font-mono uppercase tracking-wider">IS → OOS</div>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  walkForward.isStat.wr !== null &&
                  walkForward.oosStat.wr !== null &&
                  walkForward.oosStat.wr >= walkForward.isStat.wr - 2
                    ? "text-up"
                    : "text-down"
                }`}
              >
                {walkForward.isStat.wr !== null && walkForward.oosStat.wr !== null
                  ? `${(walkForward.oosStat.wr - walkForward.isStat.wr > 0 ? "+" : "")}${(
                      walkForward.oosStat.wr - walkForward.isStat.wr
                    ).toFixed(1)}pp`
                  : "–"}
              </div>
              <div className="text-[10px] text-faint font-mono mt-0.5">
                {walkForward.isStat.wr !== null &&
                walkForward.oosStat.wr !== null &&
                walkForward.oosStat.wr >= walkForward.isStat.wr - 2
                  ? "hält out-of-sample"
                  : "bricht ein → Overfit/Zufall"}
              </div>
            </div>
            <div className="bg-surface border border-border rounded p-3">
              <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Gewichte (IS)</div>
              <div className="text-[10px] font-mono mt-1 space-y-0.5">
                {walkForward.factorNames.map((f, i) => (
                  <div key={f} className="flex justify-between gap-2">
                    <span className="text-muted">{f}</span>
                    <span className={walkForward.weights[i] >= 0 ? "text-up" : "text-down"}>
                      {walkForward.weights[i] >= 0 ? "+" : ""}
                      {walkForward.weights[i].toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Konfidenz-Quintile OOS */}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">
              Konfidenz-Quintile (OOS) — steigt die WR mit der Signalstärke |Composite|?
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {walkForward.buckets.map((b) => (
                <div key={b.label} className="bg-surface border border-border rounded p-2 text-center">
                  <div className={`text-[13px] font-bold font-mono ${wrCls(b.stat, 1)}`}>{fmtWr(b.stat)}</div>
                  <div className="text-[8px] text-faint font-mono mt-0.5">{b.label.split(" ")[0]}</div>
                  <div className="text-[8px] text-faint font-mono">n={b.stat.n}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-faint mt-1.5">
              Monoton steigend von Q1→Q5 = Konfidenz ist echt (stärkere Confluence → höhere Trefferquote).
            </div>
          </div>
        </div>
      )}

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
      </>
      )}

      {/* ── Währung × Faktor-Heatmap ── */}
      {tab === "heatmap" && (
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
      )}

      {/* ── Kombi-Leaderboard ── */}
      {tab === "bestenliste" && (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <div className="text-[11px] text-muted font-mono uppercase tracking-wider">
            Bestenliste — alle Kombinationen ({horizon}W, {periodYears} J, n≥{minN})
          </div>
          <div className="flex gap-1.5 items-center">
            <span className="text-[9px] uppercase tracking-widest text-faint">Sortierung</span>
            {(
              [
                ["robust", "Robustheit"],
                ["wr", "Winrate"],
                ["avg", "Ø Rendite"],
                ["n", "n"],
              ] as Array<[SortKey, string]>
            ).map(([key, label]) => (
              <button key={key} className={seg(sortKey === key)} onClick={() => setSortKey(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-[12px] min-w-[520px]">
            <thead>
              <tr className="text-[9px] text-faint font-mono uppercase tracking-wider sticky top-0 bg-surface">
                <th className="text-left pb-1.5 px-2">Kombination</th>
                <th className="text-right pb-1.5 px-2">n</th>
                <th className="text-right pb-1.5 px-2">Winrate</th>
                <th className="text-right pb-1.5 px-2">Ø Rendite</th>
                <th className="text-right pb-1.5 px-2">Signifikant</th>
                <th className="text-right pb-1.5 px-2">Robust</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((c) => (
                <tr key={c.label} className={`border-t border-border ${c.robust ? "bg-up/5" : ""}`}>
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
                  <td className="py-1.5 px-2 text-right font-mono text-[10px]">
                    {c.robust ? <span className="text-up font-bold">✓</span> : <span className="text-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-faint mt-1.5">
          Robust = signifikant im Out-of-Sample-Teil UND kein Einbruch ggü. In-Sample (Split{" "}
          {splitPct}/{100 - splitPct}, gleicher Regler wie oben in Übersicht) — dieselbe Prüfung wie
          der Walk-Forward-Composite-Block, angewendet auf alle 31 Kombinationen statt nur der Auswahl.
        </div>
      </div>
      )}

      {/* ── Pair-Tabelle der Auswahl ── */}
      {tab === "pair" && selected.size === 0 && (
        <p className="text-muted text-sm">Mindestens einen Faktor in der Filterleiste anhaken.</p>
      )}
      {tab === "pair" && selected.size > 0 && (
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
