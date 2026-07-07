/**
 * Strategie-CRUD — Port von shared/services/strategyService.ts.
 */

import { fetchAll, insertOne, updateOne, deleteOne } from "./supabase-crud";

export interface StrategyRecord {
  id?: string;
  name: string;
  description?: string;
  rules?: { id: string; text: string; type?: string }[];
  pairs?: string[];
  timeframes?: string[];
  sessions?: string[];
  isActive?: boolean;
  stats?: Record<string, unknown>;
  notes?: string;
  direction?: "long" | "short" | "both";
  images?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export async function loadStrategies(): Promise<StrategyRecord[]> {
  return fetchAll<StrategyRecord>({ table: "strategies", orderBy: "created_at" });
}

export async function saveStrategy(data: StrategyRecord): Promise<StrategyRecord> {
  if (data.id) {
    return (await updateOne("strategies", data.id, data)) as unknown as StrategyRecord;
  }
  return (await insertOne("strategies", data)) as unknown as StrategyRecord;
}

export async function removeStrategy(id: string): Promise<boolean> {
  return deleteOne("strategies", id);
}
