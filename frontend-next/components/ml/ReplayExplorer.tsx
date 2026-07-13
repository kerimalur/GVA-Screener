"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FX_INSTRUMENTS } from "@/lib/constants/instruments";
import Panel from "@/components/layout/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Field, Input, Select } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toaster";

/**
 * GVA-Replay mit Session-Struktur (wie Backtest-Lab): Landing mit allen
 * Sessions (weiterfahren / auswerten / umbenennen / löschen), Wizard für
 * neue Sessions (Pair + Zeitraum), danach der Bewertungs-Raum.
 * Rein technisch — nur die GVA-Linien-Logik, keine Fundamentals.
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
  by_year: Record<string, StatBucket>;
}

const evalKey = (hitDate: string, direction: string) => `${hitDate}_${direction}`;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
}

// ── Wizard: neue Replay-Session ──
function ReplayWizard({
  onCreated,
  onClose,
}: {
  onCreated: (s: Session) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    pair: "EUR_USD",
    dateFrom: "",
    dateTo: todayIso(),
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.dateFrom) {
      toast.error("Startdatum fehlt");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/replay/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: form.pair,
          date_from: form.dateFrom,
          date_to: form.dateTo,
          name: form.name.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      onCreated({ ...json.session, evaluated_count: 0 });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Anlegen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Neue Replay-Session"
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          <Button size="sm" icon="ph-play" onClick={submit} disabled={saving}>
            Session starten
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" hint="optional">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="z.B. EURUSD 2023 Durchgang 1"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paar">
            <Select value={form.pair} onChange={(e) => setForm((f) => ({ ...f, pair: e.target.value }))}>
              {FX_INSTRUMENTS.map((i) => (
                <option key={i.instrument} value={i.instrument}>
                  {i.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <div />
          <Field label="Startdatum">
            <Input
              type="date"
              value={form.dateFrom}
              onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </Field>
          <Field label="Enddatum">
            <Input
              type="date"
              value={form.dateTo}
              onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ── Auswertung einer Session ──
function ReplayAnalysis({
  session,
  onBack,
  onContinue,
}: {
  session: Session;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`${API}/replay/stats?session_id=${session.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setStats)
      .catch(() => toast.error("Auswertung konnte nicht geladen werden"));
  }, [session.id]);

  return (
    <div className="space-y-4 anim-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon="ph-arrow-left" onClick={onBack}>
          Sessions
        </Button>
        <h2 className="text-sm font-semibold">{session.name}</h2>
        {session.status === "done" && <Badge tone="accent">abgeschlossen</Badge>}
        <div className="ml-auto">
          {session.status !== "done" && (
            <Button size="sm" icon="ph-play" onClick={onContinue}>
              Weiter bewerten
            </Button>
          )}
        </div>
      </div>

      {!stats ? (
        <Panel>
          <SkeletonRows rows={4} />
        </Panel>
      ) : stats.total.trades === 0 ? (
        <Panel>
          <EmptyState
            icon="ph-chart-bar"
            title="Noch keine simulierten Trades"
            description="Bewerte Hits im Raum als «Trade genommen», dann erscheinen hier Winrate, R:R und Profit Factor."
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="Winrate"
              value={stats.total.winrate != null ? `${stats.total.winrate.toFixed(1)}%` : "–"}
              cls={stats.total.winrate != null && stats.total.winrate >= 50 ? "text-up" : "text-down"}
            />
            <StatTile
              label="Trades"
              value={String(stats.total.trades)}
              sub={`${stats.total.wins}W / ${stats.total.losses}L / ${stats.total.timeouts}T · Skips ${stats.skips}`}
            />
            <StatTile
              label="Ø R:R"
              value={stats.total.avg_rr != null ? stats.total.avg_rr.toFixed(2) : "–"}
              cls={(stats.total.avg_rr ?? 0) > 0 ? "text-up" : "text-down"}
            />
            <StatTile
              label="Profit Factor"
              value={stats.total.profit_factor != null ? stats.total.profit_factor.toFixed(2) : "–"}
              cls={(stats.total.profit_factor ?? 0) >= 1 ? "text-up" : "text-down"}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BreakdownTable title="Nach Richtung" data={stats.by_direction} keyLabel="Richtung" />
            <BreakdownTable title="Nach Pair" data={stats.by_pair} keyLabel="Pair" />
            <BreakdownTable title="Nach Jahr" data={stats.by_year} keyLabel="Jahr" />
          </div>
        </>
      )}
    </div>
  );
}

// ── Bewertungs-Raum ──
function ReplayRoom({
  session,
  onBack,
  onFinish,
  onEvaluated,
}: {
  session: Session;
  onBack: () => void;
  onFinish: () => void;
  onEvaluated: () => void;
}) {
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [evals, setEvals] = useState<Map<string, Evaluation>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [skipReason, setSkipReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [hitsRes, tradesRes] = await Promise.all([
          fetch(`${API}/replay/hits?pair=${session.pair}&from=${session.date_from}&to=${session.date_to}`),
          fetch(`${API}/replay/trades?pair=${session.pair}`),
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
        if (cancelled) return;
        setHits(hitsJson.hits);
        setEvals(map);
        // beim Fortsetzen: zum ersten unbewerteten Hit springen
        const firstOpen = (hitsJson.hits as Hit[]).findIndex(
          (h) => !map.has(evalKey(h.hit_date, h.direction)),
        );
        setIdx(firstOpen >= 0 ? firstOpen : 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Fehler");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const hit = hits && hits.length > 0 ? hits[Math.min(idx, hits.length - 1)] : null;
  const currentEval = hit ? evals.get(evalKey(hit.hit_date, hit.direction)) ?? null : null;

  useEffect(() => {
    setNotes(currentEval?.notes ?? "");
    setSkipReason(currentEval?.skip_reason ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, hits]);

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
            instrument: session.pair,
            hit_date: hit.hit_date,
            hit_direction: hit.direction,
            hit_level: hit.level,
            trade_taken: taken,
            skip_reason: taken ? null : skipReason || null,
            notes: notes || null,
            session_id: session.id,
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
        onEvaluated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler");
      } finally {
        setSaving(false);
      }
    },
    [hit, session, notes, skipReason, onEvaluated],
  );

  const evaluatedCount = useMemo(() => {
    if (!hits) return 0;
    return hits.filter((h) => evals.has(evalKey(h.hit_date, h.direction))).length;
  }, [hits, evals]);

  const seg =
    "px-2.5 py-1 rounded text-[11px] font-mono font-bold border border-border text-muted hover:text-text transition-colors cursor-pointer";
  const tvSymbol = session.pair.replace("_", "");

  return (
    <div className="space-y-6">
      {/* Topbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon="ph-arrow-left" onClick={onBack}>
          Sessions
        </Button>
        <h2 className="text-sm font-semibold">{session.name}</h2>
        <span className="text-[11px] font-mono text-muted">
          {session.pair} · {session.date_from} – {session.date_to}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" icon="ph-flag-checkered" onClick={onFinish}>
            Abschließen
          </Button>
        </div>
      </div>

      {loading && (
        <p className="text-[12px] text-muted font-mono animate-pulse">
          Rekonstruiere GVA-Hits — 3D-Resampling + Muster-Scan, kann 5–15 s dauern (Render-Kaltstart länger) …
        </p>
      )}
      {error && <p className="text-down text-sm font-mono">Fehler: {error}</p>}
      {hits && hits.length === 0 && (
        <p className="text-muted text-sm">Keine GVA-Hits im gewählten Zeitraum.</p>
      )}

      {hits && hits.length > 0 && hit && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-mono border-b border-border pb-3">
            <span>
              GVA-Hits: <b>{hits.length}</b>
            </span>
            <span>
              Bewertet: <b>{evaluatedCount}/{hits.length}</b>
            </span>
          </div>

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

          <div className="flex flex-wrap gap-1">
            {hits.map((h, i) => {
              const ev = evals.get(evalKey(h.hit_date, h.direction));
              let cls = "bg-surface2 border-border text-faint";
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
            {/* GVA-Hit */}
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

            {/* Bewertung */}
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
                    → {currentEval.result}{" "}
                    {currentEval.result_pips != null &&
                      `${currentEval.result_pips > 0 ? "+" : ""}${currentEval.result_pips} Pips`}
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

      <p className="text-[11px] text-faint leading-relaxed border-t border-border/50 pt-3">
        Tastenkürzel: ← → blättern. Ergebnis-Simulation: Entry = Close am Hit-Tag, SL = Signal-Kerzen-Extrem ±5
        Pips, TP = 1:3 R:R, SL+TP am selben Tag → konservativ SL, Timeout nach 20 Handelstagen. Hits werden mit dem
        identischen 3D-Raster wie der Live-Screener rekonstruiert (Anker 21.04.2026). Rein technisch —
        Fundamentals spielen hier bewusst keine Rolle.
      </p>
    </div>
  );
}

// ── Haupt-Komponente: Landing mit Session-Liste ──
type Mode = "landing" | "room" | "analysis";

export default function ReplayExplorer() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("landing");
  const [current, setCurrent] = useState<Session | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const loadSessions = useCallback(() => {
    fetch(`${API}/replay/sessions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setSessions(j.sessions))
      .catch(() => toast.error("Sessions konnten nicht geladen werden (Backend wach?)"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const patchSession = async (id: number, patch: { status?: string; name?: string }) => {
    try {
      const res = await fetch(`${API}/replay/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadSessions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    }
  };

  const deleteSession = async (id: number) => {
    try {
      const res = await fetch(`${API}/replay/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (current?.id === id) setCurrent(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    }
  };

  if (mode === "room" && current) {
    return (
      <ReplayRoom
        session={current}
        onBack={() => {
          if (current.status === "active") patchSession(current.id, { status: "paused" });
          setMode("landing");
          loadSessions();
        }}
        onFinish={() => {
          patchSession(current.id, { status: "done" });
          setCurrent({ ...current, status: "done" });
          setMode("analysis");
        }}
        onEvaluated={loadSessions}
      />
    );
  }

  if (mode === "analysis" && current) {
    return (
      <ReplayAnalysis
        session={current}
        onBack={() => {
          setMode("landing");
          loadSessions();
        }}
        onContinue={() => setMode("room")}
      />
    );
  }

  // ── Landing ──
  return (
    <div className="space-y-4 anim-fade-in">
      <div className="flex items-center">
        <span className="text-[12px] text-muted">
          {sessions.length} {sessions.length === 1 ? "Session" : "Sessions"}
        </span>
        <Button size="sm" icon="ph-plus" className="ml-auto" onClick={() => setShowWizard(true)}>
          Neue Session
        </Button>
      </div>

      {loading ? (
        <Panel>
          <SkeletonRows rows={4} />
        </Panel>
      ) : sessions.length === 0 ? (
        <Panel>
          <EmptyState
            icon="ph-rewind"
            title="Noch keine Replay-Sessions"
            description="Pair und Zeitraum wählen, dann historische GVA-Hits chronologisch durchgehen und bewerten — rein technisch, ohne Fundamentals."
            action={
              <Button icon="ph-plus" onClick={() => setShowWizard(true)}>
                Erste Session starten
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface border border-border rounded-md p-4 anim-slide-up"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[14px] truncate">{s.name}</span>
                  {s.status === "done" && <Badge tone="accent">abgeschlossen</Badge>}
                  {s.status === "paused" && <Badge>pausiert</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-muted mt-0.5">
                  <span>{s.pair}</span>
                  <span>
                    {s.date_from} – {s.date_to}
                  </span>
                  <span>{s.evaluated_count} bewertet</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                {s.status !== "done" && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon="ph-play"
                    onClick={() => {
                      setCurrent(s);
                      setMode("room");
                    }}
                  >
                    Weiter
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  icon="ph-chart-bar"
                  onClick={() => {
                    setCurrent(s);
                    setMode("analysis");
                  }}
                >
                  Auswertung
                </Button>
                <button
                  onClick={() => {
                    const name = prompt("Neuer Name:", s.name);
                    if (name && name.trim() && name !== s.name) patchSession(s.id, { name });
                  }}
                  className="p-1.5 rounded text-faint hover:text-text transition-colors"
                  title="Umbenennen"
                >
                  <i className="ph-bold ph-pencil-simple" />
                </button>
                <button
                  onClick={() =>
                    confirm("Session inkl. Bewertungen wirklich löschen?") && deleteSession(s.id)
                  }
                  className="p-1.5 rounded text-faint hover:text-down transition-colors"
                  title="Löschen"
                >
                  <i className="ph-bold ph-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showWizard && (
        <ReplayWizard
          onCreated={(s) => {
            setSessions((prev) => [s, ...prev]);
            setCurrent(s);
            setMode("room");
          }}
          onClose={() => setShowWizard(false)}
        />
      )}
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
              <td
                className={`py-1 px-2 text-right font-bold ${
                  b.winrate != null && b.winrate >= 50 ? "text-up" : b.winrate != null ? "text-down" : "text-faint"
                }`}
              >
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
