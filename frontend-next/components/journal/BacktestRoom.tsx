"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Field, Input, Select, Textarea, Label } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toaster";
import { PAIR_LIST, SETUP_DEFINITIONS, getProblems, saveProblems, getNoteSnippets, saveNoteSnippets } from "@/lib/journal/types";
import { loadPref, savePref } from "@/lib/journal/prefs";
import {
  computeStats,
  downscaleImage,
  loadWeekRankings,
  mondayOf,
  toTradeFundamental,
  type BacktestSession,
  type BacktestTrade,
  type WeekRanking,
} from "@/lib/journal/backtests";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Props {
  session: BacktestSession;
  onAddTrade: (trade: BacktestTrade) => void;
  onDeleteTrade: (tradeId: string) => void;
  onTogglePause: () => void;
  onClose: () => void;
  onFinish: () => void;
}

/** Fokus-Raum: schnelles Erfassen von Backtest-Trades, Tastatur-first. */
export default function BacktestRoom({ session, onAddTrade, onDeleteTrade, onTogglePause, onClose, onFinish }: Props) {
  const initialDate =
    session.trades.length > 0
      ? session.trades[session.trades.length - 1].date
      : session.startDate || today();

  const [formData, setFormData] = useState({
    pair: session.pair || "EURUSD",
    direction: "long" as "long" | "short",
    result: "win" as "win" | "loss" | "breakeven",
    rMultiple: session.defaultRR || 1,
    date: initialDate,
    setups: [] as string[],
    problems: [] as string[],
    screenshot: "",
    notes: "",
  });
  const [problemOptions, setProblemOptions] = useState<string[]>(() => getProblems());
  const [newProblem, setNewProblem] = useState("");
  const [noteSnippets, setNoteSnippets] = useState<string[]>(() => getNoteSnippets());
  const [elapsed, setElapsed] = useState("00:00");

  // Skip-Erfassung: Setup gesehen, bewusst nicht genommen
  const [skipMode, setSkipMode] = useState(false);
  const [skipReason, setSkipReason] = useState("Kein BOS");

  // Fundamentale Wochen-Rankings (einmal vorab geladen, dann nur Lookups)
  const [rankings, setRankings] = useState<Map<string, WeekRanking> | null>(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  useEffect(() => {
    if (!session.withFundamentals || !session.pair || !session.startDate) return;
    setRankingsLoading(true);
    loadWeekRankings(session.pair, session.startDate, today())
      .then(setRankings)
      .catch(() => toast.error("Fundamentale Wochen konnten nicht geladen werden"))
      .finally(() => setRankingsLoading(false));
  }, [session.withFundamentals, session.pair, session.startDate]);

  // Wiederverwendbare Listen aus dem Backend hydrieren
  useEffect(() => {
    loadPref<string[]>("problems", []).then((p) => {
      if (Array.isArray(p) && p.length > 0) {
        setProblemOptions(p);
        saveProblems(p);
      }
    });
    loadPref<string[]>("noteSnippets", []).then((n) => {
      if (Array.isArray(n) && n.length > 0) {
        setNoteSnippets(n);
        saveNoteSnippets(n);
      }
    });
  }, []);

  const stats = computeStats(session.trades, session.accountSize, session.riskPercent);
  const completed = !!session.isCompleted;

  // Timer
  useEffect(() => {
    const tick = () => {
      const total = session.isPaused
        ? session.elapsedMs
        : session.elapsedMs + (Date.now() - session.updatedAt);
      const m = Math.floor(total / 60000);
      const s = Math.floor((total % 60000) / 1000);
       
      setElapsed(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.isPaused, session.elapsedMs, session.updatedAt]);

  const handleResultChange = (result: "win" | "loss" | "breakeven") => {
    const rr = session.defaultRR || 1;
    const defaultR = result === "win" ? rr : result === "loss" ? -1 : 0;
    setFormData((prev) => ({ ...prev, result, rMultiple: defaultR }));
  };

  // Fundamental-Lage der aktuell gewählten Woche (null solange nicht geladen)
  const weekRanking = rankings?.get(mondayOf(formData.date)) ?? null;

  const handleSubmit = useCallback(() => {
    if (completed) return;
    const fundamental =
      session.withFundamentals && weekRanking
        ? toTradeFundamental(weekRanking, formData.direction)
        : session.withFundamentals
          ? null
          : undefined;
    onAddTrade({
      id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      pair: formData.pair,
      direction: formData.direction,
      result: skipMode ? "breakeven" : formData.result,
      rMultiple: skipMode ? 0 : formData.rMultiple,
      date: formData.date,
      setups: formData.setups,
      problems: formData.problems,
      timestamp: Date.now(),
      screenshot: formData.screenshot || undefined,
      notes: formData.notes || undefined,
      taken: !skipMode,
      skipReason: skipMode ? skipReason : undefined,
      fundamental,
    });
    // Reset — Datum/Pair/Setups bleiben stehen
    setSkipMode(false);
    setFormData((prev) => ({
      ...prev,
      rMultiple: prev.result === "win" ? session.defaultRR || 1 : prev.result === "loss" ? -1 : 0,
      problems: [],
      screenshot: "",
      notes: "",
    }));
  }, [completed, formData, onAddTrade, session.defaultRR, session.withFundamentals, weekRanking, skipMode, skipReason]);

  // Tastaturkürzel: L/S Richtung, W/X/B Ergebnis, 1–9 R, +/− Feinjustage, Enter speichert
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      const signFor = (r: string) => (r === "win" ? 1 : r === "loss" ? -1 : 0);
      if (/^[1-9]$/.test(e.key)) {
        const mag = parseInt(e.key, 10);
        setFormData((prev) => ({ ...prev, rMultiple: mag * (signFor(prev.result) || 1) }));
        return;
      }
      if (e.key === "+" || e.key === "=") {
        setFormData((prev) => ({ ...prev, rMultiple: Math.round((prev.rMultiple + 0.5) * 10) / 10 }));
        return;
      }
      if (e.key === "-") {
        setFormData((prev) => ({ ...prev, rMultiple: Math.round((prev.rMultiple - 0.5) * 10) / 10 }));
        return;
      }
      switch (e.key.toLowerCase()) {
        case "l": setFormData((prev) => ({ ...prev, direction: "long" })); break;
        case "s": setFormData((prev) => ({ ...prev, direction: "short" })); break;
        case "w": setFormData((prev) => ({ ...prev, result: "win", rMultiple: Math.abs(prev.rMultiple) || 1 })); break;
        case "x": setFormData((prev) => ({ ...prev, result: "loss", rMultiple: -(Math.abs(prev.rMultiple) || 1) })); break;
        case "b": setFormData((prev) => ({ ...prev, result: "breakeven", rMultiple: 0 })); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSubmit]);

  // Strg+V: Screenshot
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      for (const item of e.clipboardData?.items ?? []) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onloadend = async () => {
            const small = await downscaleImage(reader.result as string);
            setFormData((prev) => ({ ...prev, screenshot: small }));
            toast.success("Screenshot übernommen");
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const toggle = (field: "setups" | "problems", key: string) =>
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(key)
        ? prev[field].filter((x) => x !== key)
        : [...prev[field], key],
    }));

  const addNewProblem = () => {
    const val = newProblem.trim();
    if (!val) return;
    if (!problemOptions.includes(val)) {
      const updated = [...problemOptions, val];
      setProblemOptions(updated);
      saveProblems(updated);
      savePref("problems", updated).catch(() => {});
    }
    setFormData((prev) => ({
      ...prev,
      problems: prev.problems.includes(val) ? prev.problems : [...prev.problems, val],
    }));
    setNewProblem("");
  };

  const saveNoteAsSnippet = () => {
    const val = formData.notes.trim();
    if (!val || noteSnippets.includes(val)) return;
    const updated = [...noteSnippets, val];
    setNoteSnippets(updated);
    saveNoteSnippets(updated);
    savePref("noteSnippets", updated).catch(() => {});
    toast.success("Notiz als Baustein gespeichert");
  };

  return (
    <div className="fixed inset-0 z-[55] bg-bg overflow-y-auto anim-fade-in">
      <div className="max-w-5xl mx-auto p-6">
        {/* Topbar */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">{session.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted mt-0.5 font-mono">
              <span>
                <i className="ph-bold ph-timer" /> {elapsed}
              </span>
              <span>Eintrag #{session.trades.length + 1}</span>
              {session.pair && <span className="text-text">{session.pair}</span>}
              {session.defaultRR != null && <span>RR 1:{session.defaultRR}</span>}
              {completed && <Badge tone="accent">abgeschlossen</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="subtle" size="sm" icon={session.isPaused ? "ph-play" : "ph-pause"} onClick={onTogglePause}>
              {session.isPaused ? "Weiter" : "Pause"}
            </Button>
            {!completed && (
              <Button variant="ghost" size="sm" icon="ph-flag-checkered" onClick={onFinish}>
                Abschließen
              </Button>
            )}
            <Button variant="ghost" size="sm" icon="ph-x" onClick={onClose}>
              Schließen
            </Button>
          </div>
        </div>

        {/* Live-Stats */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 mb-5 text-[12px] font-mono">
          <span className="text-muted">{stats.totalTrades} Trades</span>
          <span className={stats.totalR >= 0 ? "text-up" : "text-down"}>
            {stats.totalR >= 0 ? "+" : ""}
            {stats.totalR.toFixed(1)} R
          </span>
          <span className="text-muted">{stats.winRate.toFixed(0)}% WR</span>
          {stats.hasEur && (
            <span className={stats.totalEur >= 0 ? "text-up" : "text-down"}>
              {stats.totalEur >= 0 ? "+" : ""}
              {stats.totalEur.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
            </span>
          )}
        </div>

        {/* Fundamentale Lage der gewählten Woche */}
        {session.withFundamentals && (
          <div className="mb-4 rounded-md border border-border bg-surface p-3.5">
            <div className="text-[10px] uppercase tracking-widest text-faint mb-2">
              Fundamentale Lage — Woche {mondayOf(formData.date)}
            </div>
            {rankingsLoading ? (
              <p className="text-[12px] text-muted font-mono animate-pulse">
                Lade alle Wochen-Rankings seit {session.startDate} … (einmalig)
              </p>
            ) : weekRanking ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {[weekRanking.base, weekRanking.quote].map((s, i) => (
                  <div key={s.ccy} className="flex items-center gap-2 text-[13px] font-mono">
                    <b>{s.ccy}</b>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        s.quintile === 5
                          ? "bg-up/15 text-up"
                          : s.quintile === 1
                            ? "bg-down/15 text-down"
                            : "bg-border/40 text-muted"
                      }`}
                    >
                      Q{s.quintile}
                    </span>
                    <span className={s.score >= 0 ? "text-up" : "text-down"}>
                      {s.score >= 0 ? "+" : ""}
                      {s.score.toFixed(2)}
                    </span>
                    {i === 0 && <span className="text-faint">vs.</span>}
                  </div>
                ))}
                <div
                  className={`ml-auto px-3 py-1.5 rounded-md text-[13px] font-black font-mono border ${
                    weekRanking.bias === "neutral"
                      ? "border-border2 text-muted"
                      : (weekRanking.bias === formData.direction)
                        ? "border-up/50 bg-up/15 text-up"
                        : "border-down/50 bg-down/15 text-down"
                  }`}
                >
                  {weekRanking.bias === "neutral"
                    ? "NEUTRAL — kein Q5/Q1-Extrem"
                    : weekRanking.bias === formData.direction
                      ? `JA — Rückenwind für ${formData.direction.toUpperCase()}`
                      : `NEIN — Ranking sagt ${weekRanking.bias.toUpperCase()}`}
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-muted">Keine Fundamental-Daten für diese Woche.</p>
            )}
          </div>
        )}

        {/* Erfassungs-Formular */}
        <div className="bg-surface border border-border rounded-md p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Paar">
              <Select
                value={formData.pair}
                onChange={(e) => setFormData((p) => ({ ...p, pair: e.target.value }))}
              >
                {PAIR_LIST.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Datum" hint="◀ ▶ Tag · ▶▶ Woche">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFormData((p) => ({ ...p, date: shiftDate(p.date, -1) }))}
                  className="px-1.5 py-1.5 rounded border border-border2 text-muted hover:text-text transition-colors"
                  title="1 Tag zurück"
                >
                  <i className="ph-bold ph-caret-left" />
                </button>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                />
                <button
                  onClick={() => setFormData((p) => ({ ...p, date: shiftDate(p.date, 1) }))}
                  className="px-1.5 py-1.5 rounded border border-border2 text-muted hover:text-text transition-colors"
                  title="1 Tag vor"
                >
                  <i className="ph-bold ph-caret-right" />
                </button>
                <button
                  onClick={() => setFormData((p) => ({ ...p, date: shiftDate(p.date, 7) }))}
                  className="px-1.5 py-1.5 rounded border border-border2 text-muted hover:text-text transition-colors"
                  title="1 Woche vor"
                >
                  <i className="ph-bold ph-caret-double-right" />
                </button>
              </div>
            </Field>
            <div>
              <Label hint="L / S">Richtung</Label>
              <div className="flex gap-1.5">
                {(["long", "short"] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setFormData((p) => ({ ...p, direction: dir }))}
                    className={`flex-1 py-1.5 rounded-md text-[12px] font-semibold uppercase border transition-colors ${
                      formData.direction === dir
                        ? dir === "long"
                          ? "bg-up/15 text-up border-up/50"
                          : "bg-down/15 text-down border-down/50"
                        : "bg-bg text-muted border-border2 hover:text-text"
                    }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label hint="W / X / B">Ergebnis</Label>
              <div className="flex gap-1.5">
                {(["win", "loss", "breakeven"] as const).map((res) => (
                  <button
                    key={res}
                    onClick={() => handleResultChange(res)}
                    className={`flex-1 py-1.5 rounded-md text-[12px] font-semibold border transition-colors ${
                      formData.result === res
                        ? res === "win"
                          ? "bg-up/15 text-up border-up/50"
                          : res === "loss"
                            ? "bg-down/15 text-down border-down/50"
                            : "bg-surface2 text-text border-border2"
                        : "bg-bg text-muted border-border2 hover:text-text"
                    }`}
                  >
                    {res === "win" ? "W" : res === "loss" ? "L" : "BE"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Field label="R-Multiple" hint="1–9, +/−">
              <Input
                type="number"
                step="0.1"
                value={formData.rMultiple}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, rMultiple: parseFloat(e.target.value) || 0 }))
                }
              />
            </Field>
            <div className="md:col-span-3">
              <Label>Setups</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SETUP_DEFINITIONS).map(([key, s]) => {
                  const on = formData.setups.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggle("setups", key)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors"
                      style={
                        on
                          ? { backgroundColor: `${s.color}20`, borderColor: s.color, color: s.color }
                          : { borderColor: "var(--color-border2)", color: "var(--color-muted)" }
                      }
                    >
                      {s.short}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <Label>Probleme</Label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {problemOptions.map((p) => {
                const on = formData.problems.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggle("problems", p)}
                    className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                      on
                        ? "bg-down/15 text-down border-down/50"
                        : "bg-bg text-muted border-border2 hover:text-text"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <span className="inline-flex items-center gap-1">
                <Input
                  className="!w-36 !py-1 text-[11px]"
                  value={newProblem}
                  onChange={(e) => setNewProblem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), addNewProblem())}
                  placeholder="Neues Problem…"
                />
                <Button variant="subtle" size="sm" icon="ph-plus" onClick={addNewProblem} />
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Notiz</Label>
                <button
                  onClick={saveNoteAsSnippet}
                  className="text-[10px] text-accent hover:underline"
                >
                  Als Baustein speichern
                </button>
              </div>
              <Textarea
                className="min-h-[70px]"
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Shift+Enter für Zeilenumbruch"
              />
              {noteSnippets.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {noteSnippets.map((n) => (
                    <button
                      key={n}
                      onClick={() => setFormData((p) => ({ ...p, notes: p.notes ? `${p.notes}\n${n}` : n }))}
                      className="px-2 py-0.5 rounded bg-surface2 text-[10px] text-muted hover:text-text transition-colors max-w-56 truncate"
                      title={n}
                    >
                      + {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label hint="Strg+V">Screenshot</Label>
              {formData.screenshot ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.screenshot}
                    alt="Screenshot"
                    className="w-full max-h-40 object-contain rounded-md border border-border2 bg-bg"
                  />
                  <button
                    onClick={() => setFormData((p) => ({ ...p, screenshot: "" }))}
                    className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-down/90 text-white text-[10px]"
                  >
                    <i className="ph-bold ph-trash" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-[70px] border-2 border-dashed border-border2 rounded-md cursor-pointer hover:border-accent/50 transition-colors text-muted">
                  <i className="ph-bold ph-camera text-lg" />
                  <span className="text-[10px]">Klicken oder Strg+V</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = async () => {
                        const small = await downscaleImage(reader.result as string);
                        setFormData((p) => ({ ...p, screenshot: small }));
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
            <button
              onClick={() => setSkipMode((v) => !v)}
              className={`px-2.5 py-1.5 rounded-md text-[12px] font-semibold border transition-colors ${
                skipMode
                  ? "bg-warn/15 text-warn border-warn/50"
                  : "bg-bg text-muted border-border2 hover:text-text"
              }`}
            >
              {skipMode ? "✗ Skip — nicht genommen" : "Als Skip erfassen"}
            </button>
            {skipMode && (
              <div className="flex items-center gap-1.5">
                {["Fundamental dagegen", "Kein BOS"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setSkipReason(r)}
                    className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                      skipReason === r
                        ? "bg-down/15 text-down border-down/50"
                        : "bg-bg text-muted border-border2 hover:text-text"
                    }`}
                  >
                    {r}
                  </button>
                ))}
                <Input
                  className="!w-40 !py-1 text-[11px]"
                  value={skipReason === "Fundamental dagegen" || skipReason === "Kein BOS" ? "" : skipReason}
                  onChange={(e) => setSkipReason(e.target.value || "Kein BOS")}
                  placeholder="anderer Grund…"
                />
              </div>
            )}
            <Button className="ml-auto" icon={skipMode ? "ph-prohibit" : "ph-plus"} onClick={handleSubmit} disabled={completed}>
              {skipMode ? "Skip speichern (Enter)" : "Trade speichern (Enter)"}
            </Button>
          </div>
        </div>

        {/* Letzte Einträge */}
        {session.trades.length > 0 && (
          <div className="mt-4 space-y-1">
            {[...session.trades]
              .slice(-6)
              .reverse()
              .map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 text-[12px] font-mono py-1.5 px-2 rounded bg-surface border border-border"
                >
                  <span className="text-muted">{t.date}</span>
                  <span className="font-semibold">{t.pair}</span>
                  <span className={t.direction === "long" ? "text-up" : "text-down"}>
                    {t.direction === "long" ? "▲" : "▼"}
                  </span>
                  {t.fundamental !== undefined && t.fundamental !== null && (
                    <span
                      className={`text-[10px] font-bold ${
                        t.fundamental.aligned == null
                          ? "text-faint"
                          : t.fundamental.aligned
                            ? "text-up"
                            : "text-down"
                      }`}
                    >
                      {t.fundamental.aligned == null ? "F:–" : t.fundamental.aligned ? "F:JA" : "F:NEIN"}
                    </span>
                  )}
                  {t.taken === false ? (
                    <span className="ml-auto font-semibold text-warn">
                      SKIP{t.skipReason ? ` · ${t.skipReason}` : ""}
                    </span>
                  ) : (
                    <span
                      className={`ml-auto font-semibold ${
                        t.rMultiple > 0 ? "text-up" : t.rMultiple < 0 ? "text-down" : "text-muted"
                      }`}
                    >
                      {t.rMultiple > 0 ? "+" : ""}
                      {t.rMultiple.toFixed(1)} R
                    </span>
                  )}
                  <button
                    onClick={() => confirm("Eintrag löschen?") && onDeleteTrade(t.id)}
                    className="text-faint hover:text-down transition-colors"
                    title="Löschen"
                  >
                    <i className="ph-bold ph-trash" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
