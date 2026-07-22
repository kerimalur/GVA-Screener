"use client";

import { useCallback, useEffect, useState } from "react";
import Panel from "@/components/layout/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

import { SkeletonRows } from "@/components/ui/Skeleton";
import { Field, Input, Select } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toaster";
import BacktestRoom from "./BacktestRoom";
import BacktestAnalysis from "./BacktestAnalysis";
import { PAIR_LIST } from "@/lib/journal/types";
import { loadStrategies, type StrategyRecord } from "@/lib/journal/strategies";
import {
  loadBacktests,
  saveBacktest,
  removeBacktest,
  newId,
  computeStats,
  type BacktestSession,
  type BacktestTrade,
} from "@/lib/journal/backtests";

type Mode = "landing" | "room" | "analysis";

// ── Wizard: neue Session ──
function SessionWizard({
  onCreate,
  onClose,
}: {
  onCreate: (s: BacktestSession) => void;
  onClose: () => void;
}) {
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [withFundamentals, setWithFundamentals] = useState<boolean | null>(null);
  const [form, setForm] = useState({
    name: "",
    pair: "EURUSD",
    strategyId: "",
    defaultRR: 2,
    riskPercent: 1,
    accountSize: 0,
    startDate: "",
  });

  useEffect(() => {
    loadStrategies().then(setStrategies).catch(() => {});
  }, []);

  const next = () => {
    if (!form.name.trim()) {
      toast.error("Name fehlt");
      return;
    }
    setStep(2);
  };

  const submit = () => {
    if (withFundamentals === null) {
      toast.error("Mit oder ohne fundamentale Daten wählen");
      return;
    }
    if (withFundamentals && !form.startDate) {
      toast.error("Startdatum wird für die fundamentalen Wochen benötigt");
      return;
    }
    const strategy = strategies.find((s) => s.id === form.strategyId);
    const now = Date.now();
    onCreate({
      id: newId(),
      name: form.name.trim(),
      createdAt: now,
      updatedAt: now,
      trades: [],
      isPaused: false,
      elapsedMs: 0,
      pair: form.pair,
      strategyId: form.strategyId || undefined,
      strategy: strategy?.name,
      defaultRR: form.defaultRR || undefined,
      riskPercent: form.riskPercent || undefined,
      accountSize: form.accountSize || undefined,
      startDate: form.startDate || undefined,
      withFundamentals,
    });
    onClose();
  };

  if (step === 2) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Fundamentale Daten?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              Zurück
            </Button>
            <Button size="sm" icon="ph-play" onClick={submit} disabled={withFundamentals === null}>
              Session starten
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] text-muted">
            Mit Fundamentals werden beim Start alle Wochen-Rankings (Zins+Saison, Q-Stufen)
            zwischen Startdatum und heute geladen — pro Trade siehst du sofort, ob die
            fundamentale Lage die Richtung stützt.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { val: true, icon: "ph-ranking", title: "Mit fundamentalen Daten", desc: "Wochen-Rankings vorab geladen, Ja/Nein je Trade" },
              { val: false, icon: "ph-prohibit", title: "Ohne", desc: "Reiner Technik-Backtest wie bisher" },
            ] as const).map((opt) => (
              <button
                key={String(opt.val)}
                onClick={() => setWithFundamentals(opt.val)}
                className={`rounded-md border p-4 text-left transition-colors ${
                  withFundamentals === opt.val
                    ? "border-accent bg-accent/10"
                    : "border-border2 bg-bg hover:border-accent/50"
                }`}
              >
                <i className={`ph-bold ${opt.icon} text-lg ${withFundamentals === opt.val ? "text-accent" : "text-muted"}`} />
                <div className="text-[13px] font-semibold mt-1">{opt.title}</div>
                <div className="text-[11px] text-muted mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
          {withFundamentals && !form.startDate && (
            <Field label="Startdatum" hint="Pflicht bei Fundamentals">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </Field>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Neue Backtest-Session"
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          <Button size="sm" icon="ph-arrow-right" onClick={next}>
            Weiter
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="z.B. GVA Weekly · EURUSD 2020–2024"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paar">
            <Select value={form.pair} onChange={(e) => setForm((f) => ({ ...f, pair: e.target.value }))}>
              {PAIR_LIST.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Strategie">
            <Select
              value={form.strategyId}
              onChange={(e) => setForm((f) => ({ ...f, strategyId: e.target.value }))}
            >
              <option value="">— keine —</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Standard-RR" hint="Win-Default">
            <Input
              type="number"
              step="0.5"
              min={0}
              value={form.defaultRR}
              onChange={(e) => setForm((f) => ({ ...f, defaultRR: parseFloat(e.target.value) || 0 }))}
            />
          </Field>
          <Field label="Startdatum" hint="optional">
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </Field>
          <Field label="Account-Größe" hint="optional, für €">
            <Input
              type="number"
              min={0}
              value={form.accountSize || ""}
              onChange={(e) => setForm((f) => ({ ...f, accountSize: parseFloat(e.target.value) || 0 }))}
              placeholder="z.B. 100000"
            />
          </Field>
          <Field label="Risiko %" hint="fix, kein Compounding">
            <Input
              type="number"
              step="0.1"
              min={0}
              value={form.riskPercent}
              onChange={(e) => setForm((f) => ({ ...f, riskPercent: parseFloat(e.target.value) || 0 }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export default function BacktestView() {
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("landing");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await loadBacktests());
    } catch {
      toast.error("Fehler beim Laden der Sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten-Fetch beim Mount
    reload();
  }, [reload]);

  const current = sessions.find((s) => s.id === currentId);

  const patchSession = (id: string, patch: Partial<BacktestSession> | ((s: BacktestSession) => BacktestSession)) => {
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id !== id ? s : typeof patch === "function" ? patch(s) : { ...s, ...patch },
      );
      const updated = next.find((s) => s.id === id);
      if (updated) saveBacktest(updated).catch(() => toast.error("Sync fehlgeschlagen"));
      return next;
    });
  };

  const addSession = (s: BacktestSession) => {
    setSessions((prev) => [s, ...prev]);
    saveBacktest(s).catch(() => toast.error("Sync fehlgeschlagen"));
    setCurrentId(s.id);
    setMode("room");
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    removeBacktest(id).catch(() => {});
    if (currentId === id) setCurrentId(null);
  };

  const addTrade = (trade: BacktestTrade) => {
    if (!currentId) return;
    patchSession(currentId, (s) => ({
      ...s,
      trades: [...s.trades, trade],
      updatedAt: Date.now(),
      // laufende Zeit bis jetzt einfrieren, damit updatedAt-Referenz stimmt
      elapsedMs: s.isPaused ? s.elapsedMs : s.elapsedMs + (Date.now() - s.updatedAt),
    }));
  };

  const togglePause = () => {
    if (!currentId) return;
    patchSession(currentId, (s) =>
      s.isPaused
        ? { ...s, isPaused: false, updatedAt: Date.now() }
        : { ...s, isPaused: true, elapsedMs: s.elapsedMs + (Date.now() - s.updatedAt), updatedAt: Date.now() },
    );
  };

  const finishSession = () => {
    if (!currentId) return;
    patchSession(currentId, (s) => ({
      ...s,
      isCompleted: true,
      isPaused: true,
      elapsedMs: s.isPaused ? s.elapsedMs : s.elapsedMs + (Date.now() - s.updatedAt),
      updatedAt: Date.now(),
    }));
    setMode("analysis");
  };

  const deleteTrade = (tradeId: string) => {
    if (!currentId) return;
    patchSession(currentId, (s) => ({
      ...s,
      trades: s.trades.filter((t) => t.id !== tradeId),
      updatedAt: Date.now(),
    }));
  };

  if (mode === "room" && current) {
    return (
      <BacktestRoom
        session={current}
        onAddTrade={addTrade}
        onDeleteTrade={deleteTrade}
        onTogglePause={togglePause}
        onClose={() => {
          if (!current.isPaused) togglePause();
          setMode("landing");
        }}
        onFinish={finishSession}
      />
    );
  }

  if (mode === "analysis" && current) {
    return (
      <BacktestAnalysis
        session={current}
        onContinue={() => setMode("room")}
        onBack={() => setMode("landing")}
        onDeleteTrade={deleteTrade}
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
          <SkeletonRows rows={5} />
        </Panel>
      ) : sessions.length === 0 ? (
        <Panel>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-surface2 rounded-md p-3.5 text-center">
                <div className="font-mono text-xl font-extrabold text-faint">—</div>
                <div className="text-[11px] text-muted mt-1">Ø R-Multiple</div>
              </div>
              <div className="bg-surface2 rounded-md p-3.5 text-center">
                <div className="font-mono text-xl font-extrabold text-faint">—</div>
                <div className="text-[11px] text-muted mt-1">Trefferquote</div>
              </div>
              <div className="bg-surface2 rounded-md p-3.5 text-center">
                <div className="font-mono text-xl font-extrabold text-faint">0</div>
                <div className="text-[11px] text-muted mt-1">Sessions total</div>
              </div>
            </div>
            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2.5">So funktioniert&apos;s</div>
            <div className="space-y-2.5 mb-5">
              {[
                ["1", "Session anlegen", "Paar, Strategie, Startdatum — mit oder ohne Fundamentals."],
                ["2", "Trades im Fokus-Raum erfassen", "Tastatur-first, ein Trade nach dem anderen."],
                ["3", "Auswerten", "Setups und Leaks der Session prüfen."],
              ].map(([n, title, desc]) => (
                <div key={n} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-accent/15 text-accent font-mono font-bold text-[12px] flex items-center justify-center shrink-0">
                    {n}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold">{title}</div>
                    <div className="text-[11.5px] text-muted">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <Button icon="ph-plus" onClick={() => setShowWizard(true)}>
              Erste Session starten
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const stats = computeStats(s.trades, s.accountSize, s.riskPercent);
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface border border-border rounded-md p-4 anim-slide-up"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[14px] truncate">{s.name}</span>
                    {s.isCompleted && <Badge tone="accent">abgeschlossen</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-muted mt-0.5">
                    <span>{s.trades.length} Trades</span>
                    <span className={stats.totalR >= 0 ? "text-up" : "text-down"}>
                      {stats.totalR >= 0 ? "+" : ""}
                      {stats.totalR.toFixed(1)} R
                    </span>
                    {stats.totalTrades > 0 && <span>{stats.winRate.toFixed(0)}% WR</span>}
                    {s.pair && <span>{s.pair}</span>}
                    {s.strategy && <span>{s.strategy}</span>}
                    <span>{new Date(s.createdAt).toLocaleDateString("de-DE")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  {!s.isCompleted && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon="ph-play"
                      onClick={() => {
                        setCurrentId(s.id);
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
                      setCurrentId(s.id);
                      setMode("analysis");
                    }}
                  >
                    Auswertung
                  </Button>
                  <button
                    onClick={() => confirm("Session wirklich löschen?") && deleteSession(s.id)}
                    className="p-1.5 rounded text-faint hover:text-down transition-colors"
                    title="Löschen"
                  >
                    <i className="ph-bold ph-trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showWizard && <SessionWizard onCreate={addSession} onClose={() => setShowWizard(false)} />}
    </div>
  );
}
