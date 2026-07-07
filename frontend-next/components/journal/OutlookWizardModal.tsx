"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Field, Input, Select, Textarea, Label } from "@/components/ui/Field";
import type { ChecklistItem, OutlookRecord } from "@/lib/journal/outlooks";
import { PAIR_LIST, getConfluences } from "@/lib/journal/types";
import { loadStrategies, type StrategyRecord } from "@/lib/journal/strategies";

const STEPS = ["Basis", "Level", "Confluences", "Fundamental", "Checkliste"];

interface OutlookWizardModalProps {
  outlook?: OutlookRecord;
  onSave: (data: OutlookRecord) => Promise<void>;
  onClose: () => void;
}

export default function OutlookWizardModal({
  outlook,
  onSave,
  onClose,
}: OutlookWizardModalProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [data, setData] = useState<OutlookRecord>(() => ({
    symbol: "EURUSD",
    direction: "long",
    thesis: "",
    confidence: 3,
    status: "observation",
    confluences: [],
    tags: [],
    strategyChecklist: [],
    fundamentalOutlook: "",
    ...outlook,
  }));

  useEffect(() => {
    loadStrategies().then(setStrategies).catch(() => {});
  }, []);

  const set = (patch: Partial<OutlookRecord>) => setData((d) => ({ ...d, ...patch }));

  // Strategie wählen → Regeln als Checkliste übernehmen
  const applyStrategy = (id: string) => {
    const s = strategies.find((x) => x.id === id);
    set({
      setupId: id || null,
      strategyChecklist: s
        ? (s.rules || []).map((r) => ({
            ruleId: r.id,
            text: r.text,
            type: r.type,
            checked: false,
          }))
        : [],
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(data);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const confluences = getConfluences();

  return (
    <Modal
      open
      onClose={onClose}
      title={outlook?.id ? "Outlook bearbeiten" : "Neuer Outlook"}
      subtitle={`${step + 1}/${STEPS.length} · ${STEPS[step]}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          {step > 0 && (
            <Button variant="subtle" size="sm" icon="ph-arrow-left" onClick={() => setStep(step - 1)}>
              Zurück
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button size="sm" icon="ph-arrow-right" onClick={() => setStep(step + 1)}>
              Weiter
            </Button>
          ) : (
            <Button size="sm" icon="ph-check" onClick={submit} disabled={saving}>
              {saving ? "Speichern…" : "Outlook speichern"}
            </Button>
          )}
        </>
      }
    >
      {/* Step-Indikator */}
      <div className="flex items-center gap-1.5 mb-5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <button
              onClick={() => setStep(i)}
              className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors ${
                i < step
                  ? "bg-up text-black"
                  : i === step
                    ? "bg-accent text-black"
                    : "bg-surface2 text-muted"
              }`}
            >
              {i < step ? <i className="ph-bold ph-check" /> : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-px ${i < step ? "bg-up" : "bg-border2"}`} />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Symbol">
              <Select value={data.symbol} onChange={(e) => set({ symbol: e.target.value })}>
                {PAIR_LIST.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Setup / Strategie">
              <Select value={data.setupId || ""} onChange={(e) => applyStrategy(e.target.value)}>
                <option value="">— frei —</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="These">
            <Textarea
              className="min-h-[100px]"
              value={data.thesis}
              onChange={(e) => set({ thesis: e.target.value })}
              placeholder="Warum dieser Trade? Was muss passieren?"
            />
          </Field>
          <div>
            <Label>Confidence</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => set({ confidence: n })}
                  className={`text-xl transition-colors ${
                    n <= data.confidence ? "text-warn" : "text-faint hover:text-muted"
                  }`}
                  aria-label={`${n} Sterne`}
                >
                  <i className={`ph-bold ph-star${n <= data.confidence ? "" : ""}`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label>Richtung</Label>
            <div className="flex gap-1.5">
              {(["long", "short"] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => set({ direction: dir })}
                  className={`flex-1 py-2 rounded-md text-[12px] font-semibold uppercase border transition-colors ${
                    data.direction === dir
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interessante Zone">
              <Input
                type="number"
                step="0.00001"
                value={data.interestingZone ?? ""}
                onChange={(e) => set({ interestingZone: parseFloat(e.target.value) || null })}
                placeholder="Level"
              />
            </Field>
            <Field label="Entry">
              <Input
                type="number"
                step="0.00001"
                value={data.targetEntry ?? ""}
                onChange={(e) => set({ targetEntry: parseFloat(e.target.value) || null })}
                placeholder="Optional"
              />
            </Field>
            <Field label="Stop Loss">
              <Input
                type="number"
                step="0.00001"
                value={data.targetSl ?? ""}
                onChange={(e) => set({ targetSl: parseFloat(e.target.value) || null })}
                placeholder="Optional"
              />
            </Field>
            <Field label="Take Profit">
              <Input
                type="number"
                step="0.00001"
                value={data.targetTp ?? ""}
                onChange={(e) => set({ targetTp: parseFloat(e.target.value) || null })}
                placeholder="Optional"
              />
            </Field>
          </div>
          <Field label="Gültig bis" hint="optional">
            <Input
              type="date"
              value={data.expiresAt ?? ""}
              onChange={(e) => set({ expiresAt: e.target.value || null })}
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <Label>Confluences</Label>
          <div className="flex flex-wrap gap-1.5">
            {confluences.map((c) => {
              const selected = (data.confluences || []).includes(c);
              return (
                <button
                  key={c}
                  onClick={() =>
                    set({
                      confluences: selected
                        ? (data.confluences || []).filter((x) => x !== c)
                        : [...(data.confluences || []), c],
                    })
                  }
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors ${
                    selected
                      ? "bg-accent/15 text-accent border-accent/50"
                      : "bg-bg text-muted border-border2 hover:text-text"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <Field
          label="Fundamentale Einschätzung"
          hint="Daten: Makro-Seiten des Terminals + GVA /api/fundamentals"
        >
          <Textarea
            className="min-h-[140px]"
            value={data.fundamentalOutlook || ""}
            onChange={(e) => set({ fundamentalOutlook: e.target.value })}
            placeholder="Zins-Differenzial, COT-Lage, Risk-Sentiment…"
          />
        </Field>
      )}

      {step === 4 && (
        <div className="space-y-2">
          <Label>Strategie-Checkliste</Label>
          {(data.strategyChecklist || []).length === 0 ? (
            <p className="text-[12px] text-muted">
              Keine Checkliste — wähle in Schritt 1 eine Strategie, um ihre Regeln zu übernehmen.
            </p>
          ) : (
            (data.strategyChecklist || []).map((item: ChecklistItem, i) => (
              <label
                key={item.ruleId || i}
                className="flex items-center gap-2.5 p-2.5 rounded-md bg-bg border border-border2 cursor-pointer hover:border-faint transition-colors"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => {
                    const list = [...(data.strategyChecklist || [])];
                    list[i] = { ...item, checked: e.target.checked };
                    set({ strategyChecklist: list });
                  }}
                  className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                />
                <span className={`text-[12px] ${item.checked ? "text-text" : "text-muted"}`}>
                  {item.text}
                </span>
              </label>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}
