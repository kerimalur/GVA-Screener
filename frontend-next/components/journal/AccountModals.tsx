"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Field";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import type { AccountConfig, AccountType } from "@/lib/journal/types";
import { createAccount, deleteAccount, setDefaultAccount } from "@/lib/journal/accounts";

// ============================================================
// Account-Setup (neues Konto anlegen)
// ============================================================

interface AccountSetupModalProps {
  accountType: AccountType;
  onCreated: () => void;
  onClose: () => void;
}

export function AccountSetupModal({ accountType, onCreated, onClose }: AccountSetupModalProps) {
  const isFunded = accountType === "funded";
  const [form, setForm] = useState({
    name: isFunded ? "Funded Account" : "Eigenkapital",
    broker: "",
    initialBalance: isFunded ? 100000 : 10000,
    currency: "USD",
    goalTarget: 0,
    profitTarget: 8,
    maxDrawdown: 5,
    dailyDrawdown: 2,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const profitTargetAbs = isFunded
        ? form.initialBalance * (1 + form.profitTarget / 100)
        : form.goalTarget > 0
          ? form.goalTarget
          : undefined;
      const maxDrawdownAbs = isFunded
        ? form.initialBalance * (1 - form.maxDrawdown / 100)
        : undefined;

      await createAccount({
        name: form.name,
        broker: form.broker,
        type: accountType,
        currency: form.currency,
        initialStartBalance: form.initialBalance,
        currentBalance: form.initialBalance,
        defaultRiskPerTrade: isFunded ? 0.5 : 1,
        enableGoals: isFunded || form.goalTarget > 0,
        profitTargetValue: isFunded ? form.profitTarget : form.goalTarget > 0 ? form.goalTarget : undefined,
        profitTargetType: isFunded ? "percent" : form.goalTarget > 0 ? "absolute" : undefined,
        profitTarget: profitTargetAbs,
        maxDrawdownValue: isFunded ? form.maxDrawdown : undefined,
        maxDrawdownType: isFunded ? "percent" : undefined,
        maxDrawdown: maxDrawdownAbs,
        dailyDrawdownValue: isFunded ? form.dailyDrawdown : undefined,
        dailyDrawdownType: isFunded ? "percent" : undefined,
        isActive: true,
        isDefault: true,
      });
      toast.success("Konto eingerichtet");
      onCreated();
      onClose();
    } catch {
      toast.error("Fehler beim Einrichten");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isFunded ? "Funded Account einrichten" : "Eigenkapital-Konto einrichten"}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </Field>
        {isFunded && (
          <Field label="Broker">
            <Input
              placeholder="z.B. FTMO"
              value={form.broker}
              onChange={(e) => setForm((f) => ({ ...f, broker: e.target.value }))}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Startkapital">
            <Input
              type="number"
              min={0}
              value={form.initialBalance}
              onChange={(e) => setForm((f) => ({ ...f, initialBalance: Number(e.target.value) }))}
              required
            />
          </Field>
          <Field label="Währung">
            <Select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
              <option>CHF</option>
            </Select>
          </Field>
        </div>
        {!isFunded && (
          <Field label="Ziel-Balance (optional)" hint={`absolut in ${form.currency}`}>
            <Input
              type="number"
              min={0}
              placeholder="z.B. 15000"
              value={form.goalTarget || ""}
              onChange={(e) => setForm((f) => ({ ...f, goalTarget: Number(e.target.value) }))}
            />
          </Field>
        )}
        {isFunded && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Profit-Target %">
              <Input
                type="number"
                step="0.5"
                min={0}
                value={form.profitTarget}
                onChange={(e) => setForm((f) => ({ ...f, profitTarget: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Max. DD %">
              <Input
                type="number"
                step="0.5"
                min={0}
                value={form.maxDrawdown}
                onChange={(e) => setForm((f) => ({ ...f, maxDrawdown: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Tages-DD %">
              <Input
                type="number"
                step="0.5"
                min={0}
                value={form.dailyDrawdown}
                onChange={(e) => setForm((f) => ({ ...f, dailyDrawdown: Number(e.target.value) }))}
              />
            </Field>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" icon="ph-check" disabled={saving}>
            {saving ? "Wird gespeichert…" : "Konto anlegen"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Konten verwalten (Liste, Standard setzen, löschen)
// ============================================================

interface AccountManageModalProps {
  accounts: AccountConfig[];
  accountType: AccountType;
  onChanged: () => void;
  onAddAccount: () => void;
  onClose: () => void;
}

export function AccountManageModal({
  accounts,
  accountType,
  onChanged,
  onAddAccount,
  onClose,
}: AccountManageModalProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const typeLabel = accountType === "ek" ? "Eigenkapital" : "Funded";

  const handleDelete = async (acc: AccountConfig) => {
    if (!acc.id) return;
    setBusyId(acc.id);
    try {
      await deleteAccount(acc.id, accountType);
      toast.success("Konto und alle Trades gelöscht");
      setConfirmId(null);
      onChanged();
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (acc: AccountConfig) => {
    if (!acc.id || acc.isDefault) return;
    setBusyId(acc.id);
    try {
      await setDefaultAccount(acc.id, accountType);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${typeLabel} — Konten verwalten`} size="md">
      {accounts.length === 0 ? (
        <EmptyState
          icon="ph-bank"
          title="Keine Konten vorhanden"
          action={
            <Button size="sm" icon="ph-plus" onClick={() => { onClose(); onAddAccount(); }}>
              Konto anlegen
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between gap-3 p-3 rounded-md bg-bg border border-border2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{acc.name || typeLabel}</span>
                  {acc.isDefault && <Badge tone="accent">Standard</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted font-mono">
                  {acc.broker && <span>{acc.broker} ·</span>}
                  <span className="text-accent">
                    {acc.currentBalance.toLocaleString("de-DE", { minimumFractionDigits: 2 })}{" "}
                    {acc.currency}
                  </span>
                  {acc.maxDrawdownValue != null && <span>· DD {acc.maxDrawdownValue}%</span>}
                  {acc.dailyDrawdownValue != null && <span>· Tages-DD {acc.dailyDrawdownValue}%</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!acc.isDefault && (
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={busyId === acc.id}
                    onClick={() => handleSetDefault(acc)}
                  >
                    Standard
                  </Button>
                )}
                {confirmId === acc.id ? (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyId === acc.id}
                      onClick={() => handleDelete(acc)}
                    >
                      {busyId === acc.id ? "…" : "Ja, löschen"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(acc.id!)}
                    className="p-1.5 rounded text-faint hover:text-down hover:bg-down/10 transition-colors"
                    title="Konto löschen (inkl. Trades)"
                  >
                    <i className="ph-bold ph-trash text-sm" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              onClose();
              onAddAccount();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border border-dashed border-accent/40 text-accent text-[12px] font-semibold hover:bg-accent/5 transition-colors"
          >
            <i className="ph-bold ph-plus" />
            Neuen {typeLabel}-Account hinzufügen
          </button>
        </div>
      )}
    </Modal>
  );
}
