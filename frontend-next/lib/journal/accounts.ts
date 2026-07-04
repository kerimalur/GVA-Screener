/* eslint-disable @typescript-eslint/no-explicit-any -- 1:1-Port aus dem Journal (dynamische Supabase-Rows) */
/**
 * Account-Verwaltung (accounts + transactions) —
 * Port des Supabase-Zweigs von accountConfigService.ts
 * (Offline-/localStorage-Zweig entfällt: Login ist Pflicht).
 */

import { createBrowserSupabase } from "@/lib/supabase/client";
import { requireSession } from "./supabase-crud";
import type { AccountConfig, AccountConfigs, AccountType, Transaction } from "./types";

function rowToConfig(row: Record<string, any>): AccountConfig {
  return {
    id: row.id,
    name: row.name || "",
    broker: row.broker || "",
    accountNumber: row.account_number || "",
    type: row.type as AccountType,
    currency: row.currency || "USD",
    initialStartBalance: Number(row.initial_balance ?? 0),
    currentBalance: Number(row.current_balance ?? 0),
    defaultRiskPerTrade: Number(row.default_risk_per_trade ?? 1),
    enableGoals: row.enable_goals ?? false,
    profitTargetValue: row.profit_target_value != null ? Number(row.profit_target_value) : undefined,
    profitTargetType: row.profit_target_type ?? undefined,
    profitTarget: row.profit_target != null ? Number(row.profit_target) : undefined,
    maxDrawdownValue: row.max_drawdown_value != null ? Number(row.max_drawdown_value) : undefined,
    maxDrawdownType: row.max_drawdown_type ?? undefined,
    maxDrawdown: row.max_drawdown != null ? Number(row.max_drawdown) : undefined,
    dailyDrawdownValue: row.daily_drawdown_value != null ? Number(row.daily_drawdown_value) : undefined,
    dailyDrawdownType: row.daily_drawdown_type ?? undefined,
    chapters: Array.isArray(row.chapters) ? row.chapters : [],
    activeChapterId: row.active_chapter_id ?? undefined,
    isActive: row.is_active ?? true,
    isDefault: row.is_default ?? false,
  };
}

function configToRow(config: AccountConfig, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    name: config.name || (config.type === "ek" ? "Eigenkapital" : "Funded Account"),
    type: config.type,
    broker: config.broker || "",
    account_number: config.accountNumber || "",
    currency: config.currency || "USD",
    initial_balance: config.initialStartBalance,
    current_balance: config.currentBalance,
    default_risk_per_trade: config.defaultRiskPerTrade ?? 1.0,
    enable_goals: config.enableGoals ?? false,
    profit_target_value: config.profitTargetValue ?? null,
    profit_target_type: config.profitTargetType ?? null,
    profit_target: config.profitTarget ?? null,
    max_drawdown_value: config.maxDrawdownValue ?? null,
    max_drawdown_type: config.maxDrawdownType ?? null,
    max_drawdown: config.maxDrawdown ?? null,
    daily_drawdown_value: config.dailyDrawdownValue ?? null,
    daily_drawdown_type: config.dailyDrawdownType ?? null,
    chapters: config.chapters ?? [],
    active_chapter_id: config.activeChapterId ?? null,
    is_active: config.isActive ?? true,
    is_default: config.isDefault ?? false,
    updated_at: new Date().toISOString(),
  };
}

export async function loadAccountConfigs(): Promise<AccountConfigs> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data || [];
  const ekRows = rows.filter((r) => r.type === "ek");
  const fundedRows = rows.filter((r) => r.type === "funded");
  const pick = (arr: Record<string, any>[]) => arr.find((r) => r.is_default) ?? arr[0] ?? null;

  return {
    ek: pick(ekRows) ? rowToConfig(pick(ekRows)!) : null,
    funded: pick(fundedRows) ? rowToConfig(pick(fundedRows)!) : null,
    ekAccounts: ekRows.map(rowToConfig),
    fundedAccounts: fundedRows.map(rowToConfig),
  };
}

export async function saveAccountConfig(config: AccountConfig): Promise<boolean> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();
  const payload = configToRow(config, user.id);

  if (config.id) {
    const { error } = await supabase
      .from("accounts")
      .update(payload)
      .eq("id", config.id)
      .eq("user_id", user.id);
    if (error) throw error;
  } else {
    const { data: existing } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", config.type)
      .eq("is_active", true);
    payload.is_default = !existing || existing.length === 0;
    const { error } = await supabase.from("accounts").insert([payload]);
    if (error) throw error;
  }
  return true;
}

export async function createAccount(config: Omit<AccountConfig, "id">): Promise<AccountConfig> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();
  const payload = configToRow(config as AccountConfig, user.id);
  delete payload.id;

  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", config.type)
    .eq("is_active", true);
  payload.is_default = !existing || existing.length === 0;

  const { data, error } = await supabase.from("accounts").insert([payload]).select().single();
  if (error) throw error;
  return rowToConfig(data);
}

export async function setDefaultAccount(accountId: string, type: AccountType): Promise<void> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();
  await supabase
    .from("accounts")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("type", type);
  const { error } = await supabase
    .from("accounts")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", accountId)
    .eq("user_id", user.id);
  if (error) throw error;
}

/** Account + zugehörige Trades löschen (Verhalten wie altes Journal). */
export async function deleteAccount(accountId: string, accountType: AccountType): Promise<void> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  await supabase.from("trades").delete().eq("account_id", accountId).eq("user_id", user.id);
  const { data: others } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", accountType)
    .eq("is_active", true)
    .neq("id", accountId);
  if (!others || others.length === 0) {
    await supabase
      .from("trades")
      .delete()
      .is("account_id", null)
      .eq("type", accountType)
      .eq("user_id", user.id);
  }
  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function loadTransactions(): Promise<Transaction[]> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    type: row.type as AccountType,
    transactionType: row.transaction_type,
    amount: Number(row.amount),
    date: row.date,
    note: row.note || "",
    createdAt: row.created_at,
  }));
}

export async function saveTransaction(
  tx: Omit<Transaction, "id"> & { id?: string; accountId?: string },
): Promise<Transaction> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const payload: Record<string, unknown> = {
    type: tx.type,
    transaction_type: tx.transactionType,
    amount: tx.amount,
    date: tx.date,
    note: tx.note || "",
    user_id: user.id,
  };
  if (tx.accountId) payload.account_id = tx.accountId;

  const query = tx.id
    ? supabase.from("transactions").update(payload).eq("id", tx.id).eq("user_id", user.id)
    : supabase.from("transactions").insert([payload]);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return {
    id: data.id,
    type: data.type,
    transactionType: data.transaction_type,
    amount: Number(data.amount),
    date: data.date,
    note: data.note || "",
  };
}

export async function removeTransaction(id: string): Promise<boolean> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return true;
}
