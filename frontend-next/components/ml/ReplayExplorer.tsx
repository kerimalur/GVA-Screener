"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";

/**
 * Backtest-Replay: historische GVA-Hits durchblättern, Fundamental-Snapshot
 * der Hit-Woche prüfen, manuell bewerten (Trade genommen / Skip) — das Backend
 * simuliert bei "genommen" das 1:3-Ergebnis gegen price_daily.
 * Ehrliche Winrate: nur über tatsächlich genommene Trades.
 */

const API = (process.env.NEXT_PUBLIC_GVA_API_URL || "https://gva-screener.onrender.com").replace(
  /\/+$/,
  "",
);

interface Hit {
  hit_date: string;
  level: number;
  direction: "SHORT" | "LONG";
  line_formed_date: string;
}

interface Session {
  id: number;
  name: string;
  pair: string;
  date_from: string;
  date_to: string;
  status: "active" | "paused" | "done";
  evaluated_count: number;
}

interface Evaluation {
  instrument: string;
  hit_date: string;
  hit_direction: string;
  trade_taken: boolean | null;
  skip_reason: string | null;
  notes: string | null;
  entry_price: number | null;
  sl_price: number | null;
  tp_price: number | null;
  result: string | null;
  result_pips: number | null;
  result_rr: number | null;
  exit_date: string | null;
}

interface StatBucket {
  trades: number;
  wins: number;
  losses: number;
  timeouts: number;
  winrate: number | null;
  avg_rr: number | null;
  profit_factor: number | null;
}

interface Stats {
  total: StatBucket;
  skips: number;
  by_direction: Record<string, StatBucket>;
  by_pair: Record<string, StatBucket>;
  by_confluence: Record<string, StatBucket>;
  by_year: Record<string, StatBucket>;
}

const evalKey = (hitDate: string, direction: string) => `${hitDate}_${direction}`;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
}

export default function ReplayExplorer() {
  const [pair, setPair] = useState("EUR_USD");
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(365));
  const [dateTo, setDateTo] = useState(isoDaysAgo(0));

  const [hits, setHits] = useState<Hit[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [evals, setEvals] = useState<Map<string, Evaluation>>(new Map());
  const [stats, setStats] = useState<Stats | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [skipReason, setSkipReason] = useState("");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null);

  const loadStats = useCallback((sessionId?: number | null) => {
    const qs = sessionId != null ? `?session_id=${sessionId}` : "";
    fetch(`${API}/replay/stats${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setStats)
      .catch(() => {});
  }, []);

  const loadSessions = useCallback(() => {
    fetch(`${API}/replay/sessions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setSessions(j.sessions))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
    loadSessions();
  }, [loadStats, loadSessions]);

  const load = useCallback(async (p?: string, from?: string, to?: string) => {
    const usePair = p ?? pair, useFrom = from ?? dateFrom, useTo = to ?? dateTo;
    setLoading(true);
    setError(null);
    setHits(null);
    try {
      const [hitsRes, tradesRes] = await Promise.all([
        fetch(`${API}/replay/hits?pair=${usePair}&from=${useFrom}&to=${useTo}`),
        fetch(`${API}/replay/trades?pair=${usePair}`),
      ]);
      if (!hitsRes.ok) throw new Error(`Hits HTTP ${hitsRes.status}`);
      const hitsJson = await hitsRes.json();
      const map = new Map<string, Evaluation>();
      if (tradesRes.ok) {
        const tradesJson = await tradesRes.json();
        for (const t of tradesJson.trades as Evaluation[]) {
          map.set(evalKey(t.hit_date, t.hit_direction), t);
        }
      }
      setHits(hitsJson.hits);
      setEvals(map);
      setIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [pair, dateFrom, dateTo]);

  // ── Sessions: starten (aus aktueller Auswahl), fortsetzen, Status ändern ──
  const startSession = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API}/replay/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair, date_from: dateFrom, date_to: dateTo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setSession({ ...j.session, evaluated_count: 0 });
      loadSessions();
      loadStats(j.session.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }, [pair, dateFrom, dateTo, load, loadSessions, loadStats]);

  const resumeSession = useCallback(
    async (s: Session) => {
      setSession(s);
      setPair(s.pair);
      setDateFrom(s.date_from);
      setDateTo(s.date_to);
      loadStats(s.id);
      await load(s.pair, s.date_from, s.date_to);
    },
    [load, loadStats],
  );

  const patchSession = useCallback(
    async (status: "paused" | "done" | "active") => {
      if (!session) return;
      try {
        const res = await fetch(`${API}/replay/sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        setSession(status === "paused" ? null : { ...j.session, evaluated_count: session.evaluated_count });
        if (status === "paused") loadStats(null);
        loadSessions();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler");
      }
    },
    [session, loadSessions, loadStats],
  );

  const hit = hits && hits.length > 0 ? hits[Math.min(idx, hits.length - 1)] : null;
  const currentEval = hit ? evals.get(evalKey(hit.hit_date, hit.direction)) ?? null : null;

  // Notizen des aktuellen Hits in die Eingabe spiegeln
  useEffect(() => {
    setNotes(currentEval?.notes ?? "");
    setSkipReason(currentEval?.skip_reason ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, hits]);

  // Pfeiltasten: ← → blättern
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!hits || hits.length === 0) return;
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(hits.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hits]);

  const evaluate = useCallback(
    async (taken: boolean) => {
      if (!hit) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`${API}/replay/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instrument: pair,
            hit_date: hit.hit_date,
            hit_direction: hit.direction,
            hit_level: hit.level,
            trade_taken: taken,
            skip_reason: taken ? null : skipReason || null,
            notes: notes || null,
            session_id: session?.id ?? null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        setEvals((prev) => {
          const next = new Map(prev);
          next.set(evalKey(hit.hit_date, hit.direction), json.evaluation);
          return next;
        });
        loadStats(session?.id ?? null);
        if (session) loadSessions();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler");
      } finally {
        setSaving(false);
      }
    },
    [hit, pair, notes, skipReason, loadStats, session, loadSessions],
  );

  const evaluatedCount = useMemo(() => {
    if (!hits) return 0;
    return hits.filter((h) => evals.has(evalKey(h.hit_date, h.direction))).length;
  }, [hits, evals]);

  const seg =
    "px-2.5 py-1 rounded text-[11px] font-mono font-bold border border-border text-muted hover:text-text transition-colors cursor-pointer";

  const tvSymbol = pair.replace("_", "");

  return (
    <div className="space-y-6">
      {/* ── Session ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-border bg-surface2 p-3">
        <div className="text-[9px] uppercase tracking-widest text-faint">Session</div>
        {session ? (
          <>
            <span className="text-[12px] font-mono font-bold">{session.name}</span>
            <span className="text-[11px] font-mono text-muted">
              {session.evaluated_count} bewertet · {session.status}
            </span>
            <button className={seg} onClick={() => patchSession("paused")}>
              ⏸ Pausieren
            </button>
            <button className={seg} onClick={() => patchSession("done")}>
              ✓ Abschliessen
            </button>
            {session.status === "done" && (
              <span className="text-[11px] font-mono text-up">
                Abgeschlossen — Auswertung unten (Statistik zeigt nur diese Session).
              </span>
            )}
          </>
        ) : (
          <>
            <button className={seg} onClick={startSession}>
              ▶ Neue Session (aktuelle Auswahl)
            </button>
            {sessions.filter((s) => s.status !== "done").map((s) => (
              <button key={s.id} className={seg} onClick={() => resumeSession(s)} title={`${s.evaluated_count} bewertet`}>
                ⏵ {s.name} ({s.status === "paused" ? "pausiert" : "aktiv"})
              </button>
            ))}
            {sessions.filter((s) => s.status === "done").slice(0, 3).map((s) => (
              <button
                key={s.id}
                className={`${seg} opacity-60`}
                onClick={() => {
                  setSession(s);
                  loadStats(s.id);
                }}
                title="Nur Auswertung laden"
              >
                ✓ {s.name}
              </button>
            ))}
            {sessions.length === 0 && (
              <span className="text-[11px] text-faint font-mono">
                Ohne Session wird trotzdem gespeichert — Sessions bündeln Durchgänge für die Auswertung.
              </span>
            )}
          </>
        )}
      </div>

      {/* ── Auswahl ── */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded border border-border bg-surface2 p-3">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Pair</div>
          <select
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1 text-[12px] font-mono"
          >
            {FX_INSTRUMENTS.map((i) => (
              <option key={i.instrument} value={i.instrument}>
                {i.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Von</div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1 text-[12px] font-mono"
          />
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-faint mb-1.5">Bis</div>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1 text-[12px] font-mono"
          />
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="px-3 py-1.5 rounded text-[12px] font-mono font-bold border border-accent text-accent bg-accent/10 hover:bg-accent/20 disabled:opacity-50 transition-colors"
        >
          {loading ? "Rekonstruiere GVA-Hits …" : "Laden"}
        </button>
        {loading && (
          <span className="text-[11px] text-muted font-mono animate-pulse">
            3D-Resampling + Muster-Scan — kann 5–15 s dauern (Render-Kaltstart länger)
          </span>
        )}
      </div>

      {error && <p className="text-down text-sm font-mono">Fehler: {error}</p>}

      {hits && hits.length === 0 && (
        <p className="text-muted text-sm">Keine GVA-Hits im gewählten Zeitraum.</p>
      )}

      {hits && hits.length > 0 && hit && (
        <>
          {/* ── Statuszeile ── */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-mono border-b border-border pb-3">
            <span>
              GVA-Hits: <b>{hits.length}</b>
            </span>
            <span>
              Bewertet: <b>{evaluatedCount}/{hits.length}</b>
            </span>
            {stats?.total.winrate != null && (
              <span>
                WR (alle bewerteten): <b className={stats.total.winrate >= 50 ? "text-up" : "text-down"}>{stats.total.winrate.toFixed(1)}%</b>
              </span>
            )}
          </div>

          {/* ── Hit-Navigation ── */}
          <div className="flex items-center justify-between">
            <button className={seg} onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
              ◀ Zurück
            </button>
            <div className="text-center">
              <div className="text-[13px] font-bold font-mono">
                Hit {idx + 1} von {hits.length}
              </div>
              <div className="text-[12px] text-muted font-mono">{fmtDateLong(hit.hit_date)}</div>
            </div>
            <button
              className={seg}
              onClick={() => setIdx((i) => Math.min(hits.length - 1, i + 1))}
              disabled={idx === hits.length - 1}
            >
              Weiter ▶
            </button>
          </div>

          {/* Hit-Punkte-Leiste */}
          <div className="flex flex-wrap gap-1">
            {hits.map((h, i) => {
              const ev = evals.get(evalKey(h.hit_date, h.direction));
              let cls = "bg-surface2 border-border text-faint"; // unbewertet
              let deco = "";
              if (ev) {
                if (ev.trade_taken === false) {
                  cls = "bg-surface2 border-border text-faint";
                  deco = "line-through";
                } else if (ev.result === "WIN") cls = "bg-up/20 border-up/40 text-up";
                else if (ev.result === "LOSS") cls = "bg-down/20 border-down/40 text-down";
                else cls = "bg-warn/20 border-warn/40 text-warn";
              }
              return (
                <button
                  key={`${h.hit_date}_${h.direction}_${h.level}`}
                  onClick={() => setIdx(i)}
                  title={`${h.hit_date} ${h.direction}`}
                  className={`w-7 h-7 rounded border text-[10px] font-mono font-bold transition-colors ${cls} ${deco} ${
                    i === idx ? "ring-1 ring-accent" : ""
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* ── GVA-Hit ── */}
            <div className="rounded border border-border bg-surface2 p-3.5 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-faint">GVA-Hit</div>
              <div className={`text-[15px] font-black font-mono ${hit.direction === "SHORT" ? "text-down" : "text-up"}`}>
                {hit.direction} Line @ {hit.level.toFixed(5)}
              </div>
              <div className="text-[12px] font-mono text-muted">
                Gebildet am: {fmtDateLong(hit.line_formed_date)}
              </div>
              <div className="text-[12px] font-mono text-muted">Hit am: {fmtDateLong(hit.hit_date)}</div>
              <a
                href={`https://www.tradingview.com/chart/?symbol=FX:${tvSymbol}&interval=D`}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-1 px-2.5 py-1 rounded text-[11px] font-mono font-bold border border-accent text-accent bg-accent/10 hover:bg-accent/20 transition-colors"
              >
                In TradingView öffnen ↗
              </a>
              <p className="text-[10px] text-faint leading-relaxed">
                Daily-Chart öffnet ohne Datums-Sprung — Datum <b className="font-mono">{hit.hit_date}</b> manuell
                ansteuern, dann BOS / Fib / Volumen prüfen.
              </p>
            </div>

            {/* ── Bewertung ── */}
            <div className="rounded border border-border bg-surface2 p-3.5 space-y-3">
              <div className="text-[10px] uppercase tracking-widest text-faint">Deine Bewertung</div>
              <div className="flex gap-2">
                <button
                  onClick={() => evaluate(true)}
                  disabled={saving}
                  className={`flex-1 px-2 py-1.5 rounded text-[12px] font-mono font-bold border transition-colors disabled:opacity-50 ${
                    currentEval?.trade_taken === true
                      ? "border-up text-up bg-up/15"
                      : "border-border text-muted hover:border-up hover:text-up"
                  }`}
                >
                  ✓ Trade genommen
                </button>
                <button
                  onClick={() => evaluate(false)}
                  disabled={saving}
                  className={`flex-1 px-2 py-1.5 rounded text-[12px] font-mono font-bold border transition-colors disabled:opacity-50 ${
                    currentEval?.trade_taken === false
                      ? "border-down text-down bg-down/15"
                      : "border-border text-muted hover:border-down hover:text-down"
                  }`}
                >
                  ✗ Skip
                </button>
              </div>
              <input
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                placeholder="Skip-Grund (optional, z.B. kein BOS)"
                className="w-full bg-surface border border-border rounded px-2 py-1 text-[12px]"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notizen zum Trade …"
                rows={2}
                className="w-full bg-surface border border-border rounded px-2 py-1 text-[12px] resize-y"
              />
              {saving && <p className="text-[11px] text-muted font-mono animate-pulse">Speichere + simuliere …</p>}
              {currentEval?.trade_taken && currentEval.result && (
                <div
                  className={`rounded border p-2.5 text-[12px] font-mono ${
                    currentEval.result === "WIN"
                      ? "border-up/40 bg-up/10 text-up"
                      : currentEval.result === "LOSS"
                        ? "border-down/40 bg-down/10 text-down"
                        : "border-warn/40 bg-warn/10 text-warn"
                  }`}
                >
                  <b>
                    → {currentEval.result} {currentEval.result_pips != null && `${currentEval.result_pips > 0 ? "+" : ""}${currentEval.result_pips} Pips`}
                    {currentEval.result_rr != null && ` (1:${currentEval.result_rr.toFixed(1)})`}
                  </b>
                  <div className="text-[10px] mt-1 opacity-80">
                    Entry {currentEval.entry_price} · SL {currentEval.sl_price} · TP {currentEval.tp_price}
                    {currentEval.exit_date && ` · Exit ${currentEval.exit_date}`}
                  </div>
                </div>
              )}
              {currentEval && currentEval.trade_taken === false && (
                <p className="text-[11px] text-faint font-mono">
                  Übersprungen{currentEval.skip_reason ? ` — ${currentEval.skip_reason}` : ""}.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Statistik ── */}
      {stats && stats.total.trades > 0 && (
        <div className="border-t border-border pt-4 space-y-4">
          <div className="text-[11px] text-muted font-mono uppercase tracking-wider">
            Statistik — {session ? `Session «${session.name}»` : "alle bewerteten Trades"} (Skips: {stats.skips}, zählen nicht)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Winrate" value={stats.total.winrate != null ? `${stats.total.winrate.toFixed(1)}%` : "–"} cls={stats.total.winrate != null && stats.total.winrate >= 50 ? "text-up" : "text-down"} />
            <StatTile label="Trades" value={String(stats.total.trades)} sub={`${stats.total.wins}W / ${stats.total.losses}L / ${stats.total.timeouts}T`} />
            <StatTile label="Ø R:R" value={stats.total.avg_rr != null ? stats.total.avg_rr.toFixed(2) : "–"} cls={(stats.total.avg_rr ?? 0) > 0 ? "text-up" : "text-down"} />
            <StatTile label="Profit Factor" value={stats.total.profit_factor != null ? stats.total.profit_factor.toFixed(2) : "–"} cls={(stats.total.profit_factor ?? 0) >= 1 ? "text-up" : "text-down"} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <BreakdownTable title="Nach Confluence" data={stats.by_confluence} keyLabel="Faktoren" />
            <BreakdownTable title="Nach Richtung" data={stats.by_direction} keyLabel="Richtung" />
            <BreakdownTable title="Nach Pair" data={stats.by_pair} keyLabel="Pair" />
            <BreakdownTable title="Nach Jahr" data={stats.by_year} keyLabel="Jahr" />
          </div>
        </div>
      )}

      <p className="text-[11px] text-faint leading-relaxed border-t border-border/50 pt-3">
        Tastenkürzel: ← → blättern. Ergebnis-Simulation: Entry = Close am Hit-Tag, SL = Signal-Kerzen-Extrem ±5
        Pips, TP = 1:3 R:R, SL+TP am selben Tag → konservativ SL, Timeout nach 20 Handelstagen. Hits werden mit dem
        identischen 3D-Raster wie der Live-Screener rekonstruiert (Anker 21.04.2026). Rein technisch —
        Fundamentals spielen hier bewusst keine Rolle.
      </p>
    </div>
  );
}

function StatTile({ label, value, sub, cls = "" }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="bg-surface2 border border-border rounded p-3">
      <div className="text-[10px] text-muted font-mono uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold font-mono mt-1 ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-faint font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function BreakdownTable({
  title,
  data,
  keyLabel,
}: {
  title: string;
  data: Record<string, StatBucket>;
  keyLabel: string;
}) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-faint mb-1.5">{title}</div>
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="text-[9px] text-faint uppercase tracking-wider">
            <th className="text-left pb-1">{keyLabel}</th>
            <th className="text-right pb-1 px-2">n</th>
            <th className="text-right pb-1 px-2">WR</th>
            <th className="text-right pb-1">PF</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([k, b]) => (
            <tr key={k} className="border-t border-border/50">
              <td className="py-1">{k}</td>
              <td className="py-1 px-2 text-right text-muted">{b.trades}</td>
              <td className={`py-1 px-2 text-right font-bold ${b.winrate != null && b.winrate >= 50 ? "text-up" : b.winrate != null ? "text-down" : "text-faint"}`}>
                {b.winrate != null ? `${b.winrate.toFixed(0)}%` : "–"}
              </td>
              <td className="py-1 text-right text-muted">{b.profit_factor != null ? b.profit_factor.toFixed(1) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
