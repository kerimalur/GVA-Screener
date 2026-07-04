/* eslint-disable @typescript-eslint/no-explicit-any -- 1:1-Port aus dem Journal (dynamische Supabase-Rows) */
/**
 * Trade-CRUD — Port von shared/services/tradeService.ts.
 * DB-Spalten: symbol/side (App: pair/direction).
 */

import { createBrowserSupabase } from "@/lib/supabase/client";
import { getSessionUser } from "./supabase-crud";
import type { Trade, AccountType } from "./types";

function mapDbToApp(row: Record<string, any>): Trade {
  return {
    id: row.id,
    type: row.type as AccountType,
    pair: row.symbol || row.pair,
    direction: (row.side || row.direction) as "long" | "short",
    date: row.date || (row.created_at ? row.created_at.split("T")[0] : ""),
    result: row.result as Trade["result"],
    rMultiple: row.r_multiple ?? 0,
    riskPercent: row.risk_percent ?? undefined,
    riskAmount: row.risk_amount ?? undefined,
    profitAmount: row.profit_amount ?? undefined,
    notes: row.notes || "",
    comment: row.comment || "",
    sessionType: (row.session_type || "live") as "live" | "backtest",
    session: row.session || "",
    accountBalanceBefore: row.account_balance_before ?? undefined,
    accountBalanceAfter: row.account_balance_after ?? undefined,
    runningBalance: row.running_balance ?? undefined,
    entryPrice: row.entry_price ?? undefined,
    stopLoss: row.stop_loss ?? undefined,
    takeProfit: row.take_profit ?? undefined,
    exitPrice: row.exit_price ?? undefined,
    lotSize: row.lot_size ?? undefined,
    setup_daily_bos: row.setup_daily_bos ?? false,
    setup_value_area: row.setup_value_area ?? false,
    setup_market_structure: row.setup_market_structure ?? false,
    setup_weekly_gva: row.setup_weekly_gva ?? false,
    setup_3day_gva: row.setup_3day_gva ?? false,
    confluences: Array.isArray(row.confluences) ? row.confluences : [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    chapterId: row.chapter_id ?? undefined,
    strategyId: row.strategy_id ?? undefined,
  } as Trade;
}

function mapAppToDb(trade: Partial<Trade>) {
  return {
    symbol: trade.pair,
    side: trade.direction,
    date: trade.date,
    result: trade.result,
    r_multiple: trade.rMultiple,
    risk_percent: trade.riskPercent,
    risk_amount: trade.riskAmount,
    profit_amount: trade.profitAmount,
    notes: trade.notes || "",
    comment: trade.comment || "",
    session_type: trade.sessionType || "live",
    session: trade.session || "",
    type: trade.type,
    status: "closed",
    entry_price: trade.entryPrice ? Number(trade.entryPrice) : null,
    exit_price: trade.exitPrice ? Number(trade.exitPrice) : null,
    stop_loss: trade.stopLoss ? Number(trade.stopLoss) : null,
    take_profit: trade.takeProfit ? Number(trade.takeProfit) : null,
    quantity: trade.quantity ? Number(trade.quantity) : 0,
    lot_size: trade.lotSize ? Number(trade.lotSize) : null,
    account_balance_before: trade.accountBalanceBefore,
    account_balance_after: trade.accountBalanceAfter,
    running_balance: trade.runningBalance,
    setup_daily_bos: trade.setup_daily_bos ?? false,
    setup_value_area: trade.setup_value_area ?? false,
    setup_market_structure: trade.setup_market_structure ?? false,
    setup_weekly_gva: trade.setup_weekly_gva ?? false,
    setup_3day_gva: trade.setup_3day_gva ?? false,
    confluences: trade.confluences ?? [],
    chapter_id: trade.chapterId,
    strategy_id: trade.strategyId,
  };
}

export async function loadTrades(accountType?: AccountType): Promise<Trade[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = createBrowserSupabase();

  let query = supabase
    .from("trades")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (accountType) query = query.eq("type", accountType);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapDbToApp);
}

export async function saveTrade(
  tradeData: Omit<Trade, "id"> & { id?: string },
): Promise<Trade> {
  const user = await getSessionUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const supabase = createBrowserSupabase();

  const dbPayload: Record<string, unknown> = mapAppToDb(tradeData);
  for (const key of Object.keys(dbPayload)) {
    if (dbPayload[key] === undefined) delete dbPayload[key];
  }

  if (tradeData.id) {
    const { data, error } = await supabase
      .from("trades")
      .update(dbPayload)
      .eq("id", tradeData.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw error;
    return mapDbToApp(data);
  }

  const { data, error } = await supabase
    .from("trades")
    .insert([{ ...dbPayload, user_id: user.id }])
    .select()
    .single();
  if (error) throw error;
  return mapDbToApp(data);
}

export async function deleteTrade(tradeId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const supabase = createBrowserSupabase();

  const { error } = await supabase
    .from("trades")
    .delete()
    .eq("id", tradeId)
    .eq("user_id", user.id);
  if (error) throw error;
  return true;
}
