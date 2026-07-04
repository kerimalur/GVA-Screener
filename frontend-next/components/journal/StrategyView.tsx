"use client";

import { useCallback, useEffect, useState } from "react";
import Panel from "@/components/layout/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Field, Input, Textarea, Select, Label } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toaster";
import { PAIR_LIST } from "@/lib/journal/types";
import {
  loadStrategies,
  saveStrategy,
  removeStrategy,
  type StrategyRecord,
} from "@/lib/journal/strategies";

type RuleType = "entry" | "exit" | "filter" | "risk";

interface StrategyRule {
  id: string;
  text: string;
  type: RuleType;
  required: boolean;
}

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];

const RULE_TEMPLATES: Record<RuleType, string[]> = {
  entry: [
    "Preis bricht über/unter wichtige Struktur",
    "Bestätigung durch höhere Zeiteinheit",
    "Klar erkennbarer Trend vorhanden",
    "Liquidity Sweep abgeschlossen",
    "Fair Value Gap als Entry-Zone",
    "Order Block Reaktion",
    "Divergenz im RSI/MACD",
    "Volumen bestätigt Bewegung",
  ],
  exit: [
    "Take Profit bei nächstem Widerstand/Unterstützung",
    "Trailing Stop aktivieren nach +1R",
    "Exit bei Gegensignal",
    "Zeit-basierter Exit (z.B. vor News)",
    "Partial Close bei +2R",
  ],
  filter: [
    "Kein Trading vor High-Impact News",
    "Nur während London/NY Session",
    "Mindestens 2 Zeiteinheiten stimmen überein",
    "Kein Trading am Freitag Nachmittag",
    "DXY Richtung bestätigt Trade",
  ],
  risk: [
    "Maximales Risiko: 1% pro Trade",
    "Maximaler Drawdown: 3% täglich",
    "Stop Loss hinter Struktur",
    "Mindest-RR: 1:2",
    "Maximal 2 offene Positionen",
  ],
};

const RULE_META: Record<RuleType, { label: string; cls: string }> = {
  entry: { label: "Entry", cls: "text-up bg-up/10 border-up/30" },
  exit: { label: "Exit", cls: "text-down bg-down/10 border-down/30" },
  filter: { label: "Filter", cls: "text-warn bg-warn/10 border-warn/30" },
  risk: { label: "Risk", cls: "text-accent bg-accent/10 border-accent/30" },
};

/** Bild-DataURL fürs kompakte Speichern verkleinern (wie altes Journal). */
function downscaleImage(src: string, maxPx = 1100, quality = 0.72): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(src);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

const emptyStrategy = (): StrategyRecord => ({
  name: "",
  description: "",
  direction: "both",
  timeframes: [],
  pairs: [],
  rules: [],
  notes: "",
  images: [],
  isActive: true,
});

export default function StrategyView() {
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StrategyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRuleType, setNewRuleType] = useState<RuleType>("entry");
  const [newRuleText, setNewRuleText] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setStrategies(await loadStrategies());
    } catch {
      toast.error("Fehler beim Laden der Strategien");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten-Fetch beim Mount
    reload();
  }, [reload]);

  const set = (patch: Partial<StrategyRecord>) =>
    setSelected((s) => (s ? { ...s, ...patch } : s));

  const rules = (selected?.rules || []) as StrategyRule[];

  const addRule = (text: string) => {
    if (!text.trim() || !selected) return;
    set({
      rules: [
        ...rules,
        { id: crypto.randomUUID(), text: text.trim(), type: newRuleType, required: false },
      ],
    });
    setNewRuleText("");
  };

  const handleSave = async () => {
    if (!selected || !selected.name.trim()) {
      toast.error("Name fehlt");
      return;
    }
    setSaving(true);
    try {
      await saveStrategy(selected);
      toast.success("Strategie gespeichert");
      await reload();
      setSelected(null);
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: StrategyRecord) => {
    if (!s.id || !confirm(`Strategie „${s.name}" löschen?`)) return;
    await removeStrategy(s.id);
    toast.success("Strategie gelöscht");
    setSelected(null);
    await reload();
  };

  const addImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const small = await downscaleImage(ev.target?.result as string);
      set({ images: [...(selected?.images || []), small] });
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <Panel>
        <SkeletonRows rows={6} />
      </Panel>
    );
  }

  // ── Editor ──
  if (selected) {
    return (
      <div className="space-y-4 anim-fade-in">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon="ph-arrow-left" onClick={() => setSelected(null)}>
            Zurück
          </Button>
          <h2 className="text-sm font-semibold">
            {selected.id ? `Strategie: ${selected.name}` : "Neue Strategie"}
          </h2>
          <div className="ml-auto flex gap-2">
            {selected.id && (
              <Button variant="danger" size="sm" icon="ph-trash" onClick={() => handleDelete(selected)}>
                Löschen
              </Button>
            )}
            <Button size="sm" icon="ph-floppy-disk" onClick={handleSave} disabled={saving}>
              {saving ? "Speichern…" : "Speichern"}
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Basis">
            <div className="space-y-4">
              <Field label="Name">
                <Input
                  value={selected.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="z.B. GVA Weekly Reversal"
                />
              </Field>
              <Field label="Beschreibung">
                <Textarea
                  className="min-h-[70px]"
                  value={selected.description || ""}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
              <div>
                <Label>Richtung</Label>
                <div className="flex gap-1.5">
                  {(["long", "short", "both"] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => set({ direction: dir })}
                      className={`flex-1 py-1.5 rounded-md text-[12px] font-semibold uppercase border transition-colors ${
                        selected.direction === dir
                          ? dir === "long"
                            ? "bg-up/15 text-up border-up/50"
                            : dir === "short"
                              ? "bg-down/15 text-down border-down/50"
                              : "bg-accent/15 text-accent border-accent/50"
                          : "bg-bg text-muted border-border2 hover:text-text"
                      }`}
                    >
                      {dir === "both" ? "Beide" : dir}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Zeiteinheiten</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TIMEFRAMES.map((tf) => {
                    const on = (selected.timeframes || []).includes(tf);
                    return (
                      <button
                        key={tf}
                        onClick={() =>
                          set({
                            timeframes: on
                              ? (selected.timeframes || []).filter((x) => x !== tf)
                              : [...(selected.timeframes || []), tf],
                          })
                        }
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-colors ${
                          on
                            ? "bg-accent/15 text-accent border-accent/50"
                            : "bg-bg text-muted border-border2 hover:text-text"
                        }`}
                      >
                        {tf}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label hint={`${(selected.pairs || []).length} gewählt`}>Paare</Label>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {PAIR_LIST.map((p) => {
                    const on = (selected.pairs || []).includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() =>
                          set({
                            pairs: on
                              ? (selected.pairs || []).filter((x) => x !== p)
                              : [...(selected.pairs || []), p],
                          })
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          on
                            ? "bg-accent/15 text-accent border-accent/50"
                            : "bg-bg text-muted border-border2 hover:text-text"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.isActive ?? true}
                  onChange={(e) => set({ isActive: e.target.checked })}
                  className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                />
                Strategie aktiv
              </label>
            </div>
          </Panel>

          <Panel title="Regeln" subtitle="werden im Outlook-Wizard zur Checkliste">
            <div className="space-y-2 mb-3">
              {rules.length === 0 && (
                <p className="text-[12px] text-muted">Noch keine Regeln.</p>
              )}
              {rules.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 p-2 rounded-md bg-bg border border-border2"
                >
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${RULE_META[r.type].cls}`}
                  >
                    {RULE_META[r.type].label}
                  </span>
                  <span className="text-[12px] flex-1">{r.text}</span>
                  <label
                    className="flex items-center gap-1 text-[10px] text-muted cursor-pointer"
                    title="Pflichtregel"
                  >
                    <input
                      type="checkbox"
                      checked={r.required}
                      onChange={(e) => {
                        const next = [...rules];
                        next[i] = { ...r, required: e.target.checked };
                        set({ rules: next });
                      }}
                      className="w-3 h-3 accent-[var(--color-accent)]"
                    />
                    Pflicht
                  </label>
                  <button
                    onClick={() => set({ rules: rules.filter((x) => x.id !== r.id) })}
                    className="text-faint hover:text-down transition-colors"
                    aria-label="Regel entfernen"
                  >
                    <i className="ph-bold ph-x text-xs" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-1.5 mb-2">
              <Select
                className="!w-24"
                value={newRuleType}
                onChange={(e) => setNewRuleType(e.target.value as RuleType)}
              >
                {Object.entries(RULE_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
              <Input
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRule(newRuleText)}
                placeholder="Eigene Regel…"
              />
              <Button size="sm" icon="ph-plus" onClick={() => addRule(newRuleText)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {RULE_TEMPLATES[newRuleType].map((t) => (
                <button
                  key={t}
                  onClick={() => addRule(t)}
                  className="px-2 py-0.5 rounded bg-surface2 text-[10px] text-muted hover:text-text transition-colors"
                >
                  + {t}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Notizen" className="lg:col-span-2">
            <Textarea
              className="min-h-[90px]"
              value={selected.notes || ""}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Playbook-Notizen, Beispiele, Marktbedingungen…"
            />
          </Panel>

          <Panel title="Chart-Beispiele" subtitle="Bilder werden komprimiert gespeichert" className="lg:col-span-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
              {(selected.images || []).map((img, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img}
                    alt={`Beispiel ${i + 1}`}
                    className="w-full h-28 object-cover rounded-md border border-border2"
                  />
                  <button
                    onClick={() =>
                      set({ images: (selected.images || []).filter((_, x) => x !== i) })
                    }
                    className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-down/90 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <i className="ph-bold ph-trash" />
                  </button>
                </div>
              ))}
              <label className="h-28 flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border2 cursor-pointer hover:border-accent/50 transition-colors text-muted">
                <i className="ph-bold ph-image text-xl mb-1" />
                <span className="text-[10px]">Bild hinzufügen</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])}
                />
              </label>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  // ── Liste ──
  return (
    <div className="space-y-4 anim-fade-in">
      <div className="flex items-center">
        <span className="text-[12px] text-muted">
          {strategies.length} {strategies.length === 1 ? "Strategie" : "Strategien"}
        </span>
        <Button size="sm" icon="ph-plus" className="ml-auto" onClick={() => setSelected(emptyStrategy())}>
          Neue Strategie
        </Button>
      </div>

      {strategies.length === 0 ? (
        <Panel>
          <EmptyState
            icon="ph-strategy"
            title="Noch keine Strategien"
            description="Definiere Regeln für Entry, Exit, Filter und Risk — sie tauchen als Checkliste im Outlook-Wizard und als Tag im TradeForm auf."
            action={
              <Button icon="ph-plus" onClick={() => setSelected(emptyStrategy())}>
                Erste Strategie anlegen
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {strategies.map((s) => {
            const ruleCount = (s.rules || []).length;
            return (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className="text-left bg-surface border border-border rounded-md p-4 hover:border-border2 transition-colors anim-slide-up"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-semibold text-[14px]">{s.name}</span>
                  <Badge
                    tone={s.direction === "long" ? "up" : s.direction === "short" ? "down" : "accent"}
                  >
                    {s.direction === "both" ? "Long+Short" : s.direction}
                  </Badge>
                  {s.isActive === false && <Badge tone="neutral">inaktiv</Badge>}
                </div>
                {s.description && (
                  <p className="text-[12px] text-muted line-clamp-2 mb-2">{s.description}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted">
                  <span>{ruleCount} Regeln</span>
                  {(s.timeframes || []).length > 0 && <span>{s.timeframes!.join(" ")}</span>}
                  {(s.pairs || []).length > 0 && <span>{s.pairs!.length} Paare</span>}
                  {(s.images || []).length > 0 && (
                    <span>
                      <i className="ph-bold ph-image" /> {s.images!.length}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
