"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "@/components/layout/Panel";
import { Field, Select } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { BucketTable } from "@/components/ml/BacktestPanel";
import { RateTile } from "@/components/ml/FundamentalTrack";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { FACTOR_SHORT, type SetupFinderData } from "@/lib/ml/backtest";
import { confluenceDir, runConfluenceBacktest, THRESHOLDS } from "@/lib/ml/confluence";
import {
  RANGE_PRESETS,
  trackUrl,
  type RangeKey,
  type Track,
  type TrackSummary,
} from "@/lib/ml/fundamentalTrackApi";

/**
 * Setup-Finder: EIN Tool, zwei Signalquellen (Umschalter):
 *  - RANKING: Q5/Q1-Bias aus dem Fundamental-Track (bestehender Backend-
 *    Endpoint, hier über alle 28 Pairs statt einzeln).
 *  - OUTLOOK: Konfluenz über die Weekly-Outlook-Faktoren (bestehende
 *    Backtest-Rohdaten via /api/ml/setup-finder, Schwelle/Faktoren live).
 * Dieselbe Konfiguration treibt LIVE-Setups und BACKTEST. Rein additiv,
 * kein Eingriff in Q-Score/Baseline.
 */

const PAIRS = FX_INSTRUMENTS.map((i) => i.instrument);
const NAME_BY_INSTRUMENT = new Map(FX_INSTRUMENTS.map((i) => [i.instrument, i.displayName]));

type Mode = "ranking" | "outlook";

/* ── Gemeinsame UI-Bausteine ─────────────────────────────────────────────── */

function ModePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-[12px] font-mono font-bold border transition-colors ${
        active ? "bg-accent/15 text-accent border-accent" : "text-muted border-border hover:border-border2"
      }`}
    >
      {children}
    </button>
  );
}

function DirBadge({ dir }: { dir: "long" | "short" }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
        dir === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down"
      }`}
    >
      {dir.toUpperCase()}
    </span>
  );
}

/* ── Ranking-Modus: 28 Tracks vom bestehenden Endpoint ───────────────────── */

interface RankingState {
  tracks: Map<string, Track>;
  errors: Map<string, string>;
  loaded: number;
}

function useAllTracks(enabled: boolean, range: RangeKey, from: string, to: string) {
  const [state, setState] = useState<RankingState>({ tracks: new Map(), errors: new Map(), loaded: 0 });
  const [running, setRunning] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const urls = PAIRS.map((p) => ({ pair: p, url: trackUrl(p, range, from, to) }));
    if (urls.some((u) => u.url === null)) return; // Custom-Range unvollständig

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setState({ tracks: new Map(), errors: new Map(), loaded: 0 });
    setRunning(true);

    let cancelled = false;
    (async () => {
      const queue = [...urls];
      // Concurrency 4 — 28 Requests, Backend cacht 1h pro (pair, range)
      const workers = Array.from({ length: 4 }, async () => {
        for (;;) {
          const next = queue.shift();
          if (!next || cancelled) return;
          try {
            const res = await fetch(next.url!, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const track = (await res.json()) as Track;
            if (cancelled) return;
            setState((s) => {
              const tracks = new Map(s.tracks).set(next.pair, track);
              return { ...s, tracks, loaded: s.loaded + 1 };
            });
          } catch (e) {
            if (cancelled || controller.signal.aborted) return;
            setState((s) => {
              const errors = new Map(s.errors).set(
                next.pair,
                e instanceof Error ? e.message : "Fehler",
              );
              return { ...s, errors, loaded: s.loaded + 1 };
            });
          }
        }
      });
      await Promise.all(workers);
      if (!cancelled) setRunning(false);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, range, from, to, reloadKey]);

  return { ...state, running, reload: () => setReloadKey((k) => k + 1) };
}

function RankingView({ range, from, to }: { range: RangeKey; from: string; to: string }) {
  const { tracks, errors, loaded, running, reload } = useAllTracks(true, range, from, to);

  const agg = useMemo(() => {
    const sum = (pick: (t: Track) => TrackSummary | undefined): TrackSummary => {
      let n = 0;
      let hits = 0;
      for (const t of tracks.values()) {
        const s = pick(t);
        if (s) {
          n += s.n;
          hits += s.hits;
        }
      }
      return { n, hits, rate: n > 0 ? (hits / n) * 100 : null };
    };
    return { h1: sum((t) => t.summary.h1), h4: sum((t) => t.summary.h4) };
  }, [tracks]);

  const live = useMemo(() => {
    const out: Array<{ pair: string; bias: "long" | "short"; detail: string; week: string }> = [];
    for (const [pair, t] of tracks) {
      const last = t.weeks[t.weeks.length - 1];
      if (!last || last.bias === "neutral") continue;
      out.push({
        pair,
        bias: last.bias,
        week: last.week_start,
        detail: `${t.base_ccy} Q${last.base_q} / ${t.quote_ccy} Q${last.quote_q}`,
      });
    }
    return out.sort((a, b) => a.pair.localeCompare(b.pair));
  }, [tracks]);

  const pairRows = useMemo(
    () =>
      PAIRS.map((pair) => ({ pair, track: tracks.get(pair), error: errors.get(pair) })).sort((a, b) => {
        const ra = a.track?.summary.h4?.rate ?? -1;
        const rb = b.track?.summary.h4?.rate ?? -1;
        return rb - ra;
      }),
    [tracks, errors],
  );

  if (range === "custom" && (!from || !to)) {
    return <p className="text-sm text-muted">Von- und Bis-Datum wählen.</p>;
  }

  return (
    <div className="space-y-5">
      {(running || errors.size > 0) && (
        <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
          {running && <span>Lade Tracks… {loaded}/{PAIRS.length}</span>}
          {!running && errors.size > 0 && (
            <>
              <span className="text-down">{errors.size} Pairs mit Fehler</span>
              <button onClick={reload} className="px-2 py-0.5 rounded border border-border hover:border-border2">
                Neu laden
              </button>
            </>
          )}
        </div>
      )}

      <Panel
        title="Live — aktuell qualifizierende Setups (Q5/Q1)"
        subtitle="Letzte Woche im gewählten Zeitraum. Bias = Basis Q5 gegen Quote Q1 (long) bzw. umgekehrt (short); Q2–Q4 neutral."
      >
        {running && tracks.size === 0 ? (
          <SkeletonRows rows={4} />
        ) : live.length === 0 ? (
          <p className="text-sm text-muted">
            Kein Pair mit Q5/Q1-Extrem in der letzten Woche des Zeitraums.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {live.map((s) => (
              <div key={s.pair} className="flex items-center gap-2 bg-surface2 border border-border rounded px-3 py-2">
                <span className="font-mono font-bold text-sm">{NAME_BY_INSTRUMENT.get(s.pair) ?? s.pair}</span>
                <DirBadge dir={s.bias} />
                <span className="text-[11px] text-muted font-mono ml-auto">{s.detail}</span>
              </div>
            ))}
          </div>
        )}
        {live.length > 0 && (
          <p className="mt-2 text-[10px] text-faint font-mono">Stand: Woche {live[0].week}</p>
        )}
      </Panel>

      <Panel
        title="Backtest — Q5/Q1-Bias vs. Forward-Move"
        subtitle="Bestehende Fundamental-Track-Logik (Baseline Zins+Saison, as-of, kein Lookahead) über alle 28 Pairs."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <RateTile label="Trefferquote 1W (alle Pairs)" s={agg.h1} />
          <RateTile label="Trefferquote 4W (alle Pairs)" s={agg.h4} />
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Pairs geladen</div>
            <div className="text-xl font-bold font-mono mt-1">
              {tracks.size}/{PAIRS.length}
            </div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">Signal-Wochen 1W</div>
            <div className="text-xl font-bold font-mono mt-1">{agg.h1.n}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-border/50">
          <table className="w-full text-[11px] font-mono min-w-[520px]">
            <thead className="bg-surface2">
              <tr className="text-[9px] text-faint uppercase tracking-wider">
                <th className="text-left px-2 py-1.5">Pair</th>
                <th className="text-right px-2 py-1.5">Signale</th>
                <th className="text-right px-2 py-1.5">Treffer 1W</th>
                <th className="text-right px-2 py-1.5">Treffer 4W</th>
                <th className="text-left px-2 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {pairRows.map(({ pair, track, error }) => {
                const h1 = track?.summary.h1;
                const h4 = track?.summary.h4;
                const cls = (r: number | null | undefined) =>
                  r == null ? "text-faint" : r >= 50 ? "text-up" : "text-down";
                return (
                  <tr key={pair} className="border-t border-border/40">
                    <td className="px-2 py-1.5 font-bold">{NAME_BY_INSTRUMENT.get(pair) ?? pair}</td>
                    <td className="px-2 py-1.5 text-right text-muted">{h1 ? h1.n : "–"}</td>
                    <td className={`px-2 py-1.5 text-right ${cls(h1?.rate)}`}>
                      {h1?.rate != null ? `${h1.rate.toFixed(1)}%` : "–"}
                    </td>
                    <td className={`px-2 py-1.5 text-right ${cls(h4?.rate)}`}>
                      {h4?.rate != null ? `${h4.rate.toFixed(1)}%` : "–"}
                    </td>
                    <td className="px-2 py-1.5">
                      {error ? (
                        <span className="text-down">Fehler: {error}</span>
                      ) : track ? (
                        <span className="text-faint">{track.weeks.length} Wochen</span>
                      ) : (
                        <span className="text-muted">lädt…</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-faint leading-relaxed">
          Nur Q5/Q1-Extreme zählen (Q2–Q4 = neutral, keine Signal-Woche). Treffer = Close nach 1W/4W
          in Bias-Richtung. Quelle: Backend-Endpoint /replay/fundamental-track (identische Logik wie
          die Einzel-Pair-Ansicht «Fundamental-Track»).
        </p>
      </Panel>
    </div>
  );
}

/* ── Outlook-Modus: Konfluenz über Weekly-Outlook-Faktoren ───────────────── */

function OutlookView({ range, from, to }: { range: RangeKey; from: string; to: string }) {
  const [data, setData] = useState<SetupFinderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(3);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ml/setup-finder");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as SetupFinderData;
        if (cancelled) return;
        setData(d);
        setSelected(d.factors); // Default: alle Faktoren an
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Fehler");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedIdx = useMemo(
    () => (data ? selected.map((f) => data.factors.indexOf(f)).filter((i) => i >= 0) : []),
    [data, selected],
  );

  // Zeitraum-Filter (Backtest); Datenehrlichkeit: effektiver Zeitraum wird unten angezeigt.
  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (range === "custom") {
      if (!from || !to) return [];
      return data.rows.filter((r) => r.w >= from && r.w <= to);
    }
    const weeks = RANGE_PRESETS.find((r) => r.key === range)?.weeks ?? 52;
    const cutoff = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
    return data.rows.filter((r) => r.w >= cutoff);
  }, [data, range, from, to]);

  const backtest = useMemo(
    () =>
      data && selectedIdx.length > 0
        ? runConfluenceBacktest(filteredRows, selectedIdx, data.horizons, threshold)
        : null,
    [data, filteredRows, selectedIdx, threshold],
  );

  // LIVE: neueste Snapshot-Woche (unabhängig vom Backtest-Zeitraum)
  const live = useMemo(() => {
    if (!data || selectedIdx.length === 0) return { week: null as string | null, setups: [] as Array<{ pair: string; dir: "long" | "short"; factors: string }> };
    let week: string | null = null;
    for (const r of data.rows) if (week === null || r.w > week) week = r.w;
    if (!week) return { week: null, setups: [] };
    const setups: Array<{ pair: string; dir: "long" | "short"; factors: string }> = [];
    for (const r of data.rows) {
      if (r.w !== week) continue;
      const dir = confluenceDir(r.d, selectedIdx, threshold);
      if (dir === 0) continue;
      const names = selectedIdx
        .filter((i) => r.d[i] === dir)
        .map((i) => FACTOR_SHORT[data.factors[i]] ?? data.factors[i]);
      setups.push({ pair: r.i, dir: dir === 1 ? "long" : "short", factors: names.join("+") });
    }
    return { week, setups: setups.sort((a, b) => a.pair.localeCompare(b.pair)) };
  }, [data, selectedIdx, threshold]);

  const toggleFactor = (f: string) =>
    setSelected((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));

  if (error) {
    return (
      <p className="text-sm text-down font-mono">
        Outlook-Daten konnten nicht geladen werden ({error}).
      </p>
    );
  }
  if (!data) {
    return (
      <Panel>
        <p className="px-5 pt-4 text-[11px] text-muted font-mono">
          Lade Snapshots + Kurse (~8 Jahre × 28 Pairs, einmalig)…
        </p>
        <SkeletonRows rows={6} />
      </Panel>
    );
  }

  const shortHistory = (f: string): string | null => {
    const first = data.factorFirstWeek[f];
    if (!first || !data.priceFrom) return null;
    // "kurz" = Faktor startet deutlich später als die Snapshot-Historie
    return first > (data.rows[0]?.w ?? first) ? first : null;
  };

  return (
    <div className="space-y-5">
      <Panel title="Konfluenz-Einstellung" subtitle="Gilt für Live-Setups UND Backtest (je Pair). Die Schwellen-Tabelle unten zeigt bewusst ALLE Schwellen.">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider mb-1.5">Faktoren</div>
            <div className="flex flex-wrap gap-1.5">
              {data.factors.map((f) => {
                const first = shortHistory(f);
                return (
                  <button
                    key={f}
                    onClick={() => toggleFactor(f)}
                    className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${
                      selected.includes(f)
                        ? "bg-accent/15 text-accent border-accent"
                        : "text-muted border-border hover:border-border2"
                    }`}
                    title={first ? `Historie erst ab ${first} — kurze Datenbasis` : undefined}
                  >
                    {FACTOR_SHORT[f] ?? f}
                    {first && <span className="text-warn"> · ab {first.slice(0, 7)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Schwelle (Live + Pair-Tabelle)">
            <Select value={String(threshold)} onChange={(e) => setThreshold(Number(e.target.value))}>
              {[3, 4, 5].map((t) => (
                <option key={t} value={t} disabled={t > selected.length}>
                  ≥ {t} Faktoren{t > selected.length ? " (mehr Faktoren wählen)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {selected.length === 0 && (
          <p className="mt-3 text-sm text-warn">Mindestens einen Faktor wählen.</p>
        )}
      </Panel>

      <Panel
        title="Live — aktuell qualifizierende Setups (Outlook-Konfluenz)"
        subtitle={`Neueste Snapshot-Woche${live.week ? ` (${live.week})` : ""} · Signal = ≥ ${threshold} gewählte Faktoren gleichgerichtet.`}
      >
        {live.setups.length === 0 ? (
          <p className="text-sm text-muted">
            Kein Pair erreicht aktuell die Schwelle mit den gewählten Faktoren.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {live.setups.map((s) => (
              <div key={s.pair} className="flex items-center gap-2 bg-surface2 border border-border rounded px-3 py-2">
                <span className="font-mono font-bold text-sm">{NAME_BY_INSTRUMENT.get(s.pair) ?? s.pair}</span>
                <DirBadge dir={s.dir} />
                <span className="text-[11px] text-muted font-mono ml-auto">{s.factors}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Backtest — Konfluenz vs. Forward-Move"
        subtitle="Bestehende Outlook-Backtest-Daten (as-of Snapshots, Forward-Fenster ab Wochen-Start, kein Lookahead). Alle Schwellen sichtbar — keine nachträgliche Bestenauswahl."
      >
        {!backtest ? (
          <p className="text-sm text-muted">Faktoren wählen.</p>
        ) : (
          <div className="space-y-5">
            <p className="text-[11px] text-muted font-mono">
              Effektiver Zeitraum: {backtest.effectiveFrom ?? "–"} … {backtest.effectiveTo ?? "–"} ·{" "}
              {backtest.weeksCovered} Wochen ·{" "}
              {selected
                .map((f) => {
                  const first = data.factorFirstWeek[f];
                  return `${FACTOR_SHORT[f] ?? f} ab ${first ?? "–"}`;
                })
                .join(" · ")}
            </p>

            <BucketTable
              label="Trefferquote je Schwelle (aggregiert über alle 28 Pairs)"
              firstCol="Schwelle"
              rows={backtest.byThreshold.map((t) => ({
                key: `≥ ${t.threshold} Faktoren${t.threshold > selected.length ? " (nicht erreichbar)" : ""}`,
                signals: t.signals,
                horizons: t.horizons,
              }))}
            />

            <details open>
              <summary className="cursor-pointer text-[11px] text-muted font-mono uppercase tracking-wider hover:text-text transition-colors select-none">
                Je Pair (Schwelle ≥ {threshold}) — aufklappen
              </summary>
              <div className="mt-2">
                <BucketTable
                  label="Sortiert nach 4W-Trefferquote"
                  firstCol="Pair"
                  rows={backtest.byPair.map((p) => ({
                    key: NAME_BY_INSTRUMENT.get(p.instrument) ?? p.instrument,
                    signals: p.signals,
                    horizons: p.horizons,
                  }))}
                />
              </div>
            </details>

            <p className="text-[11px] text-faint leading-relaxed">
              Signal feuert, wenn ≥ Schwelle der gewählten Faktoren in dieselbe Richtung zeigen
              (Gegenrichtung unter der Schwelle). Faktoren ohne Daten in einer Woche zählen nicht
              mit — fehlende Historie wird nicht hochgerechnet. Treffer = Close nach N Wochen in
              Signalrichtung, ohne Kosten/Spread.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ── Hauptkomponente ─────────────────────────────────────────────────────── */

export default function SetupFinder() {
  const [mode, setMode] = useState<Mode>("ranking");
  const [range, setRange] = useState<RangeKey>("52");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider mb-1.5">Signalquelle</div>
          <div className="flex gap-1.5">
            <ModePill active={mode === "ranking"} onClick={() => setMode("ranking")}>
              WÄHRUNGSRANKING (Q5/Q1)
            </ModePill>
            <ModePill active={mode === "outlook"} onClick={() => setMode("outlook")}>
              WEEKLY-OUTLOOK (Konfluenz)
            </ModePill>
          </div>
        </div>
        <Field label="Zeitraum">
          <Select value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
            {RANGE_PRESETS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        {range === "custom" && (
          <>
            <Field label="Von">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-surface2 border border-border rounded px-2 py-1.5 text-sm font-mono"
              />
            </Field>
            <Field label="Bis">
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-surface2 border border-border rounded px-2 py-1.5 text-sm font-mono"
              />
            </Field>
          </>
        )}
        <span className="text-[11px] text-muted pb-2">
          Alle 28 Pairs · gleiche Konfiguration für Live + Backtest · Anzeige-Tool, kein Eingriff in
          Q-Score/Baseline
        </span>
      </div>

      {mode === "ranking" ? (
        <RankingView range={range} from={from} to={to} />
      ) : (
        <OutlookView range={range} from={from} to={to} />
      )}
    </div>
  );
}
