/**
 * Signals-Inbox — vom GVA-Backend bei jedem Line-HIT befüllt (Tabelle signals).
 */

import { createBrowserSupabase } from "@/lib/supabase/client";
import { requireSession } from "./supabase-crud";
import type { G8Currency } from "./fundamentals";

export type SignalStatus = "new" | "journaled" | "watchlist" | "dismissed";

export interface SignalRecord {
  id: string;
  source: string;
  pair: string;
  lineType: "short" | "long" | null;
  lineLevel: number;
  hitAt: string;
  fundamentalSnapshot: { base?: G8Currency | null; quote?: G8Currency | null } | null;
  status: SignalStatus;
  createdAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- dynamische Supabase-Rows */
function rowToSignal(r: any): SignalRecord {
  return {
    id: r.id,
    source: r.source || "gva",
    pair: r.pair,
    lineType: r.line_type ?? null,
    lineLevel: Number(r.line_level),
    hitAt: r.hit_at,
    fundamentalSnapshot: r.fundamental_snapshot ?? null,
    status: (r.status || "new") as SignalStatus,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadSignals(status?: SignalStatus): Promise<SignalRecord[]> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();
  let query = supabase
    .from("signals")
    .select("*")
    .eq("user_id", user.id)
    .order("hit_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToSignal);
}

export async function countNewSignals(): Promise<number> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();
  const { count, error } = await supabase
    .from("signals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "new");
  if (error) return 0;
  return count ?? 0;
}

export async function setSignalStatus(id: string, status: SignalStatus): Promise<void> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();
  const { error } = await supabase
    .from("signals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}
