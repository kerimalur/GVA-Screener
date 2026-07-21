/**
 * Outlook-CRUD (Trading-Thesen) — Tabelle `outlooks`.
 * Feldnamen camelCase; generisches CRUD mappt auf snake_case-Spalten.
 */

import { fetchAll, upsertOne, deleteOne, updateOne } from "./supabase-crud";
import { SETUP_STATUS_CONFIG, fromOutlookStatus } from "@/lib/setup/lifecycle";

export type OutlookStatus = "observation" | "waiting" | "active" | "cancelled" | "executed";

/** Herkunft eines Outlooks: automatisch aus einem GVA-Hit oder von Hand angelegt. */
export type OutlookSource = "gva" | "manual";

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
  /** Verknüpftes GVA-Signal (`signals.id`), null bei manuell angelegten Thesen. */
  signalId?: string | null;
  /** 'gva' = vom Backend beim Line-Hit angelegt, 'manual' = von Hand. */
  source?: OutlookSource;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Label und Farbton je Outlook-Status — abgeleitet aus dem gemeinsamen
 * Vokabular in `lib/setup/lifecycle.ts`. Hier stehen bewusst KEINE eigenen
 * deutschen Statusnamen mehr: „Wartend" muss im Outlook dasselbe bedeuten wie
 * im Cockpit.
 */
export const OUTLOOK_STATUS_CONFIG: Record<
  OutlookStatus,
  { label: string; tone: "neutral" | "warn" | "up" | "down" | "accent" }
> = {
  observation: SETUP_STATUS_CONFIG[fromOutlookStatus("observation")],
  waiting: SETUP_STATUS_CONFIG[fromOutlookStatus("waiting")],
  active: SETUP_STATUS_CONFIG[fromOutlookStatus("active")],
  cancelled: SETUP_STATUS_CONFIG[fromOutlookStatus("cancelled")],
  executed: SETUP_STATUS_CONFIG[fromOutlookStatus("executed")],
};

export async function loadOutlooks(): Promise<OutlookRecord[]> {
  return fetchAll<OutlookRecord>({ table: "outlooks", orderBy: "created_at" });
}

/**
 * Nur die automatisch aus GVA-Hits erzeugten Outlooks — das Cockpit reichert
 * damit seine Karten an (Stern, These, Checklisten-Fortschritt) und braucht die
 * manuellen Thesen dafür nicht.
 */
export async function loadGvaOutlooks(): Promise<OutlookRecord[]> {
  return fetchAll<OutlookRecord>({
    table: "outlooks",
    orderBy: "created_at",
    filters: { source: "gva" },
  });
}

/**
 * Von Hand erfasste, noch offene Setups — die zweite Kartenquelle des Cockpits.
 *
 * Ohne sie zeigte das Cockpit nur, was aus einem GVA-Hit stammte; ein Setup
 * nach einer anderen Strategie existierte dort schlicht nicht. `signal_id` ist
 * nullable, es braucht dafür keine Schema-Änderung.
 */
export async function loadOpenManualOutlooks(): Promise<OutlookRecord[]> {
  const rows = await fetchAll<OutlookRecord>({
    table: "outlooks",
    orderBy: "created_at",
    filters: { source: "manual" },
  });
  // `fetchAll` kann nur auf Gleichheit filtern — abgeschlossene Zeilen fallen
  // hier raus, nach derselben Regel wie `isClosedSetup` im Board.
  return rows.filter((o) => o.status !== "executed" && o.status !== "cancelled");
}

/** Index signal_id → Outlook. Zeilen ohne Signal (manuell) fallen raus. */
export function outlooksBySignal(rows: OutlookRecord[]): Record<string, OutlookRecord> {
  const map: Record<string, OutlookRecord> = {};
  for (const o of rows) {
    if (o.signalId) map[o.signalId] = o;
  }
  return map;
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
