"use client";

import { useState, useEffect, useMemo } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Field, Input, Select, Textarea, Label } from "@/components/ui/Field";
import type { Trade, AccountConfig, AccountType } from "@/lib/journal/types";
import { PAIR_LIST, getConfluences, saveConfluences } from "@/lib/journal/types";
import { loadPref, savePref } from "@/lib/journal/prefs";
import {
  calculateRiskAmount,
  calculateProfitAmount,
  calcRMultipleFromLevels,
} from "@/lib/journal/calculations";
import { loadStrategies, type StrategyRecord } from "@/lib/journal/strategies";
import { loadScreenshot } from "@/lib/journal/screenshots";

export interface TradePrefill {
  pair?: string;
  direction?: "long" | "short";
  date?: string;
  notes?: string;
  confluences?: string[];
  /** Setup-Flags, z.B. ["setup_3day_gva"] aus der Signals-Inbox */
  setups?: string[];
}

interface TradeFormModalProps {
  trade?: Trade;
  accountType: AccountType;
  accountConfig: AccountConfig | null;
  prefill?: TradePrefill | null;
  onSave: (
    trade: Omit<Trade, "id"> & { id?: string },
    screenshot: string | null,
  ) => Promise<void>;
  onClose: () => void;
}

export default function TradeFormModal({
  trade,
  accountType,
  accountConfig,
  prefill,
  onSave,
  onClose,
}: TradeFormModalProps) {
  const isEditing = !!trade;

  const [formData, setFormData] = useState<Partial<Trade>>(() => {
    const defaultRiskPercent = accountType === "funded" ? 0.5 : 1;
    return {
      date: new Date().toISOString().split("T")[0],
      pair: prefill?.pair || "EURUSD",
      direction: prefill?.direction || "long",
      type: accountType,
      sessionType: "live",
      result: "win",
      rMultiple: 0,
      riskPercent: defaultRiskPercent,
      riskAmount:
        trade?.riskAmount ||
        (accountConfig?.currentBalance
          ? calculateRiskAmount(accountConfig.currentBalance, defaultRiskPercent)
          : 0),
      profitAmount: 0,
      notes: prefill?.notes || "",
      confluences: prefill?.confluences || trade?.confluences || [],
      ...Object.fromEntries((prefill?.setups || []).map((key) => [key, true])),
      ...trade,
      ...(prefill?.date ? { date: prefill.date } : {}),
    };
  });

  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [confluenceList, setConfluenceList] = useState<string[]>(() => getConfluences());
  const [addingConfluence, setAddingConfluence] = useState(false);
  const [newConfluence, setNewConfluence] = useState("");

  useEffect(() => {
    loadStrategies().then(setStrategies).catch(() => {});
    // Eigene Confluences aus Supabase syncen (gleiche Quelle wie Journal-Einstellungen)
    loadPref<string[]>("confluences", [])
      .then((v) => {
        if (Array.isArray(v) && v.length) {
          setConfluenceList(v);
          saveConfluences(v);
        }
      })
      .catch(() => {});
  }, []);

  const addCustomConfluence = () => {
    const name = newConfluence.trim();
    if (!name) return;
    const existing = confluenceList.find((c) => c.toLowerCase() === name.toLowerCase());
    const label = existing ?? name;
    if (!existing) {
      const next = [...confluenceList, name];
      setConfluenceList(next);
      saveConfluences(next);
      savePref("confluences", next).catch(() => {});
    }
    // Neue Confluence direkt für diesen Trade auswählen
    const current = formData.confluences || [];
    if (!current.includes(label)) handleChange("confluences", [...current, label]);
    setNewConfluence("");
    setAddingConfluence(false);
  };

  // Screenshot beim Bearbeiten laden
  useEffect(() => {
    if (trade?.id) {
      loadScreenshot(trade.id).then((d) => d && setScreenshot(d));
    }
  }, [trade?.id]);

  const calculatedProfit = useMemo(
    () =>
      calculateProfitAmount(
        formData.rMultiple || 0,
        formData.riskAmount || 0,
        formData.result || "win",
      ),
    [formData.rMultiple, formData.riskAmount, formData.result],
  );

  const plannedR = useMemo(
    () =>
      calcRMultipleFromLevels(
        formData.entryPrice,
        formData.stopLoss,
        formData.takeProfit,
        (formData.direction as "long" | "short") || "long",
      ),
    [formData.entryPrice, formData.stopLoss, formData.takeProfit, formData.direction],
  );

  const handleChange = (field: keyof Trade, value: unknown) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "riskPercent") {
        // Beim Bearbeiten: historischer Kontostand, nicht der heutige
        const base =
          isEditing && trade?.accountBalanceBefore
            ? trade.accountBalanceBefore
            : accountConfig?.currentBalance;
        if (base) updated.riskAmount = calculateRiskAmount(base, value as number);
      }
      if (field === "result" && value === "breakeven") updated.rMultiple = 0;
      // Geplantes R aus Entry/SL/TP übernehmen, solange keins eingegeben ist
      if (["entryPrice", "stopLoss", "takeProfit", "direction"].includes(field)) {
        const r = calcRMultipleFromLevels(
          updated.entryPrice,
          updated.stopLoss,
          updated.takeProfit,
          (updated.direction as "long" | "short") || "long",
        );
        if (r != null && (!updated.rMultiple || updated.rMultiple === 0)) {
          updated.rMultiple = r;
        }
      }
      return updated;
    });
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const readImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshot(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    for (const item of e.clipboardData?.items ?? []) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) readImage(blob);
      }
    }
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!formData.date) next.date = "Datum erforderlich";
    if (!formData.pair) next.pair = "Paar erforderlich";
    if (
      formData.result !== "breakeven" &&
      (formData.rMultiple === undefined || formData.rMultiple === 0)
    )
      next.rMultiple = "R-Multiple erforderlich";
    if (!formData.riskPercent || formData.riskPercent <= 0)
      next.riskPercent = "Risiko % erforderlich";
    if (!formData.riskAmount || formData.riskAmount <= 0)
      next.riskAmount = "Risikobetrag erforderlich";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSaving(true);
    try {
      let rMultiple = formData.rMultiple || 0;
      if (formData.result === "loss" && rMultiple > 0) rMultiple = -Math.abs(rMultiple);
      else if (formData.result === "win" && rMultiple < 0) rMultiple = Math.abs(rMultiple);
      else if (formData.result === "breakeven") rMultiple = 0;

      const finalProfit = (formData.riskAmount || 0) * rMultiple;
      await onSave(
        {
          ...formData,
          id: trade?.id,
          rMultiple,
          profitAmount: Math.round(finalProfit * 100) / 100,
          type: accountType,
          createdAt: trade?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Omit<Trade, "id"> & { id?: string },
        screenshot,
      );
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const currency = accountConfig?.currency || "USD";

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? "Trade bearbeiten" : "Neuer Trade"}
      subtitle={accountType === "funded" ? "Funded Account" : "Eigenkapital"}
      size="lg"
    >
      <form onSubmit={handleSubmit} onPaste={handlePaste} className="space-y-5">
        {/* Basis */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Field label="Datum *">
              <Input
                type="date"
                value={formData.date || ""}
                onChange={(e) => handleChange("date", e.target.value)}
              />
            </Field>
            {errors.date && <p className="text-[11px] text-down mt-1">{errors.date}</p>}
          </div>
          <Field label="Paar *">
            <Select
              value={formData.pair || ""}
              onChange={(e) => handleChange("pair", e.target.value)}
            >
              {PAIR_LIST.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <Label>Richtung *</Label>
            <div className="flex gap-1.5">
              {(["long", "short"] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => handleChange("direction", dir)}
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
          <Field label="Strategie">
            <Select
              value={formData.strategyId || ""}
              onChange={(e) => handleChange("strategyId", e.target.value || undefined)}
            >
              <option value="">— keine —</option>
              {strategies.map((s) => (
                <option key={s.id || s.name} value={s.id || ""}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Ergebnis */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Ergebnis *</Label>
            <div className="flex gap-1.5">
              {(["win", "loss", "breakeven"] as const).map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => handleChange("result", res)}
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
                  {res === "win" ? "Win" : res === "loss" ? "Loss" : "BE"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Field label="R-Multiple *">
              <Input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={formData.rMultiple ?? ""}
                onChange={(e) => handleChange("rMultiple", parseFloat(e.target.value) || 0)}
                placeholder="z.B. 2.5"
              />
            </Field>
            {errors.rMultiple && (
              <p className="text-[11px] text-down mt-1">{errors.rMultiple}</p>
            )}
            {plannedR != null && (
              <button
                type="button"
                onClick={() => handleChange("rMultiple", plannedR)}
                className="mt-1 text-[10px] text-accent hover:underline"
                title="Geplantes R:R aus Entry / Stop-Loss / Take-Profit"
              >
                = {plannedR}R aus Entry/SL/TP
              </button>
            )}
          </div>
          <div>
            <Field label="Risiko % *">
              <Input
                type="number"
                step="any"
                min="0"
                max="100"
                inputMode="decimal"
                value={formData.riskPercent ?? ""}
                onChange={(e) => handleChange("riskPercent", parseFloat(e.target.value) || 0)}
                placeholder="z.B. 0.5"
              />
            </Field>
            {errors.riskPercent && (
              <p className="text-[11px] text-down mt-1">{errors.riskPercent}</p>
            )}
          </div>
          <div>
            <Field label={`Risikobetrag (${currency}) *`}>
              <Input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={formData.riskAmount || ""}
                onChange={(e) => handleChange("riskAmount", parseFloat(e.target.value) || 0)}
                placeholder="z.B. 100"
              />
            </Field>
            {errors.riskAmount && (
              <p className="text-[11px] text-down mt-1">{errors.riskAmount}</p>
            )}
          </div>
        </div>

        {/* Berechnung */}
        <div
          className={`rounded-md border p-3.5 grid grid-cols-3 gap-3 text-center ${
            calculatedProfit > 0
              ? "border-up/40 bg-up/5"
              : calculatedProfit < 0
                ? "border-down/40 bg-down/5"
                : "border-border2 bg-bg"
          }`}
        >
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Kontostand</p>
            <p className="text-sm font-mono font-semibold">
              {accountConfig?.currentBalance?.toLocaleString("de-DE") || "—"} {currency}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide mb-1">
              Risiko ({formData.riskPercent || 0}%)
            </p>
            <p className="text-sm font-mono font-semibold text-warn">
              {(formData.riskAmount || 0).toLocaleString("de-DE")} {currency}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wide mb-1">
              Ergebnis ({formData.rMultiple || 0}R)
            </p>
            <p
              className={`text-sm font-mono font-semibold ${
                calculatedProfit > 0 ? "text-up" : calculatedProfit < 0 ? "text-down" : "text-muted"
              }`}
            >
              {calculatedProfit > 0 ? "+" : ""}
              {calculatedProfit.toLocaleString("de-DE")} {currency}
            </p>
          </div>
        </div>

        {/* Confluences */}
        <div>
          <Label hint="eigene per + hinzufügen">Confluences</Label>
          <div className="flex flex-wrap gap-1.5">
            {confluenceList.map((c) => {
              const selected = (formData.confluences || []).includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const current = formData.confluences || [];
                    handleChange(
                      "confluences",
                      selected ? current.filter((x) => x !== c) : [...current, c],
                    );
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                    selected
                      ? "bg-accent/15 text-accent border-accent/50"
                      : "bg-bg text-muted border-border2 hover:text-text"
                  }`}
                >
                  {c}
                </button>
              );
            })}
            {addingConfluence ? (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={newConfluence}
                  onChange={(e) => setNewConfluence(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomConfluence();
                    }
                    if (e.key === "Escape") {
                      setNewConfluence("");
                      setAddingConfluence(false);
                    }
                  }}
                  placeholder="Eigene Confluence…"
                  className="px-2.5 py-1 rounded-md text-[11px] w-36 bg-bg text-text border border-accent/50 outline-none"
                />
                <button
                  type="button"
                  onClick={addCustomConfluence}
                  disabled={!newConfluence.trim()}
                  className="px-2 py-1 rounded-md text-[11px] font-medium border border-accent/50 text-accent hover:bg-accent/10 disabled:opacity-40"
                >
                  <i className="ph-bold ph-check" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewConfluence("");
                    setAddingConfluence(false);
                  }}
                  className="px-2 py-1 rounded-md text-[11px] font-medium border border-border2 text-muted hover:text-text"
                >
                  <i className="ph-bold ph-x" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAddingConfluence(true)}
                title="Eigene Confluence hinzufügen"
                className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-dashed border-border2 text-muted hover:text-accent hover:border-accent/50 transition-colors"
              >
                <i className="ph-bold ph-plus" /> Eigene
              </button>
            )}
          </div>
        </div>

        {/* Preis-Level */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Entry">
            <Input
              type="number"
              step="0.00001"
              value={formData.entryPrice || ""}
              onChange={(e) => handleChange("entryPrice", parseFloat(e.target.value) || undefined)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Stop Loss">
            <Input
              type="number"
              step="0.00001"
              value={formData.stopLoss || ""}
              onChange={(e) => handleChange("stopLoss", parseFloat(e.target.value) || undefined)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Take Profit">
            <Input
              type="number"
              step="0.00001"
              value={formData.takeProfit || ""}
              onChange={(e) => handleChange("takeProfit", parseFloat(e.target.value) || undefined)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Lot Size">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={formData.lotSize || ""}
              onChange={(e) => handleChange("lotSize", parseFloat(e.target.value) || undefined)}
              placeholder="z.B. 0.10"
            />
          </Field>
        </div>

        {/* Kommentar */}
        <Field label="Kommentar / Notizen">
          <Textarea
            className="min-h-[90px]"
            value={formData.comment || ""}
            onChange={(e) => handleChange("comment", e.target.value)}
            placeholder="Trade-Notizen, Lernpunkte, Emotionen…"
          />
        </Field>

        {/* Notizen aus Signal/Outlook (vorbefüllt) */}
        {formData.notes ? (
          <Field label="Kontext-Notiz" hint="automatisch vorbefüllt">
            <Textarea
              className="min-h-[70px] font-mono text-[12px]"
              value={formData.notes || ""}
              onChange={(e) => handleChange("notes", e.target.value)}
            />
          </Field>
        ) : null}

        {/* Screenshot */}
        <div>
          <Label hint="Strg+V zum Einfügen">Screenshot</Label>
          {screenshot ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshot}
                alt="Trade Screenshot"
                className="w-full max-h-64 object-contain rounded-md border border-border2 bg-bg"
              />
              <button
                type="button"
                onClick={() => setScreenshot(null)}
                className="absolute top-2 right-2 px-2 py-1 rounded bg-down/90 text-white text-[11px] hover:bg-down"
              >
                <i className="ph-bold ph-trash" /> Entfernen
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-border2 rounded-md cursor-pointer hover:border-accent/50 transition-colors bg-bg">
              <i className="ph-bold ph-camera text-2xl text-muted mb-1" />
              <span className="text-muted text-[12px]">Klicken oder Strg+V</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && readImage(e.target.files[0])}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Aktionen */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" icon="ph-floppy-disk" disabled={isSaving}>
            {isSaving ? "Speichern…" : isEditing ? "Aktualisieren" : "Trade speichern"}
          </Button>
        </div>

        {isEditing && (
          <div className="flex justify-end">
            <Badge tone="neutral">ID {trade!.id.slice(0, 8)}</Badge>
          </div>
        )}
      </form>
    </Modal>
  );
}
