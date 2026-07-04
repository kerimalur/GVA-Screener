/**
 * Outlook-CRUD (Trading-Thesen) — Tabelle `outlooks`.
 * Feldnamen camelCase; generisches CRUD mappt auf snake_case-Spalten.
 */

import { fetchAll, upsertOne, deleteOne, updateOne } from "./supabase-crud";

export type OutlookStatus = "observation" | "waiting" | "active" | "cancelled" | "executed";

export interface ChecklistItem {
  ruleId: string;
  text: string;
  type?: string;
  checked: boolean;
}

export interface OutlookRecord {
  id?: string;
  symbol: string;
  direction: "long" | "short";
  thesis: string;
  confidence: number; // 1..5
  status: OutlookStatus;
  cotBias?: Record<string, unknown> | null;
  targetEntry?: number | null;
  targetSl?: number | null;
  targetTp?: number | null;
  interestingZone?: number | null;
  imageData?: string | null;
  confluences?: string[];
  tags?: string[];
  startedAt?: string | null;
  journaledTo?: string[];
  expiresAt?: string | null;
  executedTradeId?: string | null;
  isStarred?: boolean;
  setupId?: string | null;
  strategyChecklist?: ChecklistItem[];
  fundamentalOutlook?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const OUTLOOK_STATUS_CONFIG: Record<
  OutlookStatus,
  { label: string; tone: "neutral" | "warn" | "up" | "down" | "accent" }
> = {
  observation: { label: "Beobachtung", tone: "neutral" },
  waiting: { label: "Wartend", tone: "warn" },
  active: { label: "Aktiv", tone: "up" },
  cancelled: { label: "Abgebrochen", tone: "down" },
  executed: { label: "Ausgeführt", tone: "accent" },
};

export async function loadOutlooks(): Promise<OutlookRecord[]> {
  return fetchAll<OutlookRecord>({ table: "outlooks", orderBy: "created_at" });
}

export async function saveOutlook(data: OutlookRecord): Promise<OutlookRecord> {
  return (await upsertOne("outlooks", data, ["id"])) as unknown as OutlookRecord;
}

export async function updateOutlook(
  id: string,
  updates: Partial<OutlookRecord>,
): Promise<OutlookRecord> {
  return (await updateOne("outlooks", id, updates)) as unknown as OutlookRecord;
}

export async function removeOutlook(id: string): Promise<boolean> {
  return deleteOne("outlooks", id);
}
