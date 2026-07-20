/**
 * Setup-Lebenszyklus — das EINZIGE Status-Vokabular der Oberfläche.
 *
 * Vorher gab es vier Vokabulare für denselben Lebenszyklus (Backend-Zustand,
 * `signals.status`, `outlooks.status`, Cockpit-Lanes) und mit „Wartend" sogar
 * ein Wort mit zwei gegensätzlichen Bedeutungen. Dieses Modul legt genau ein
 * Vokabular fest; alle anderen Ebenen werden hier hinein- und herausgemappt.
 *
 * Wichtig: Die technischen Statuswerte in der DB bleiben unverändert.
 * `signals.status` trägt weiterhin 'new'/'watchlist'/'journaled'/'dismissed',
 * weil der Backend-Lebenszyklus (TRIGGERED_STATUSES / CONSUMED_STATUSES in
 * Backend/supabase_signals.py) exakt diese Werte liest. Vereinheitlicht wird
 * eine Ebene darüber — nicht die Speicherung.
 *
 * Bewusst ohne Laufzeit-Imports: nur Typ-Importe (werden wegkompiliert). Damit
 * bleibt das Modul zyklenfrei nutzbar (lib/journal/outlooks.ts importiert es zur
 * Laufzeit) und ohne Browser/Supabase testbar. Der Schreibpfad liegt daneben in
 * `lib/setup/setStatus.ts`.
 */

import type { SignalStatus } from "@/lib/journal/signals";
import type { OutlookStatus } from "@/lib/journal/outlooks";

export type SetupStatus =
  /** abgeleitet, NICHT gespeichert: Preis läuft auf eine Linie zu (Scanner) */
  | "naehert"
  /** GVA-Linie berührt, noch nicht entschieden */
  | "getroffen"
  /** gesehen, wird beobachtet */
  | "beobachtung"
  /** Trigger/Einstieg definiert, Preis noch nicht da */
  | "wartend"
  /** Trade läuft */
  | "aktiv"
  /** abgeschlossen, im Journal */
  | "ausgefuehrt"
  /** abgebrochen */
  | "verworfen";

export type SetupTone = "neutral" | "warn" | "up" | "down" | "accent";

export interface SetupStatusMeta {
  label: string;
  tone: SetupTone;
  /** Kurzhinweis für Lane-Kopf und Tooltips. */
  hint: string;
}

/**
 * Einzige Quelle für Label und Farbton. Keine hartkodierten deutschen
 * Statusnamen mehr in Komponenten — wer einen Status anzeigt, liest hier.
 */
export const SETUP_STATUS_CONFIG: Record<SetupStatus, SetupStatusMeta> = {
  naehert: { label: "Nähert sich", tone: "neutral", hint: "Preis läuft auf die Linie zu" },
  getroffen: { label: "Getroffen", tone: "warn", hint: "GVA-Linie berührt, unentschieden" },
  beobachtung: { label: "Beobachtung", tone: "neutral", hint: "gesehen, wird beobachtet" },
  wartend: { label: "Wartend", tone: "warn", hint: "Trigger definiert, Preis noch nicht da" },
  aktiv: { label: "Aktiv", tone: "up", hint: "Trade läuft" },
  ausgefuehrt: { label: "Ausgeführt", tone: "accent", hint: "abgeschlossen, im Journal" },
  verworfen: { label: "Verworfen", tone: "down", hint: "abgebrochen" },
};

/** Label eines Zustands — Kurzform für die Anzeige. */
export function setupLabel(status: SetupStatus): string {
  return SETUP_STATUS_CONFIG[status].label;
}

/** Zustände, die als „erledigt" gelten und aus der Offen-Ansicht fallen. */
export const CLOSED_SETUP_STATUSES: readonly SetupStatus[] = ["ausgefuehrt", "verworfen"];

export function isClosedSetup(status: SetupStatus): boolean {
  return CLOSED_SETUP_STATUSES.includes(status);
}

/* ---------------------------------------------------------------------------
 * signals.status  ↔  SetupStatus
 * ------------------------------------------------------------------------- */

const FROM_SIGNAL: Record<SignalStatus, SetupStatus> = {
  new: "getroffen",
  watchlist: "beobachtung",
  journaled: "ausgefuehrt",
  dismissed: "verworfen",
};

export function fromSignalStatus(s: SignalStatus): SetupStatus {
  return FROM_SIGNAL[s] ?? "getroffen";
}

/**
 * Gegenrichtung. `null` für Zustände ohne Signal-Entsprechung:
 *  - `naehert` existiert nur im Scanner, es gibt gar kein Signal.
 *  - `wartend` / `aktiv` sind reine Outlook-Verfeinerungen von „beobachtet".
 *    Das Signal bleibt in diesen Zuständen bewusst auf 'watchlist' — für den
 *    Backend-Lebenszyklus ist die Linie damit weiter TRIGGERED (offen), was
 *    genau richtig ist, solange der Trade nicht abgeschlossen oder verworfen ist.
 */
const TO_SIGNAL: Record<SetupStatus, SignalStatus | null> = {
  naehert: null,
  getroffen: "new",
  beobachtung: "watchlist",
  wartend: null,
  aktiv: null,
  ausgefuehrt: "journaled",
  verworfen: "dismissed",
};

export function toSignalStatus(s: SetupStatus): SignalStatus | null {
  return TO_SIGNAL[s] ?? null;
}

/* ---------------------------------------------------------------------------
 * outlooks.status  ↔  SetupStatus
 * ------------------------------------------------------------------------- */

const FROM_OUTLOOK: Record<OutlookStatus, SetupStatus> = {
  observation: "beobachtung",
  waiting: "wartend",
  active: "aktiv",
  executed: "ausgefuehrt",
  cancelled: "verworfen",
};

export function fromOutlookStatus(s: OutlookStatus): SetupStatus {
  return FROM_OUTLOOK[s] ?? "beobachtung";
}

/**
 * Gegenrichtung. `null` für Zustände ohne Outlook-Entsprechung:
 * `naehert` ist ephemer (Scanner), `getroffen` ist der Moment vor jeder
 * Entscheidung — beides wird nicht in den Outlook gespiegelt.
 */
const TO_OUTLOOK: Record<SetupStatus, OutlookStatus | null> = {
  naehert: null,
  getroffen: null,
  beobachtung: "observation",
  wartend: "waiting",
  aktiv: "active",
  ausgefuehrt: "executed",
  verworfen: "cancelled",
};

export function toOutlookStatus(s: SetupStatus): OutlookStatus | null {
  return TO_OUTLOOK[s] ?? null;
}

/* ---------------------------------------------------------------------------
 * Backend-Lebenszyklus (POST /api/mark)
 * ------------------------------------------------------------------------- */

/**
 * Welche `markPair`-Aktion dieser Zustand im Backend auslöst.
 *
 * 'pending' = Linie bleibt offen, ist aber angefasst.
 * 'done'    = Linie ist verbraucht; das Paar ist danach nicht mehr sticky
 *             TRIGGERED und der nächste Hit auf die NÄCHSTE Linie alarmiert
 *             wieder. Genau dieser Aufruf hat vorher gefehlt, wenn ein Setup
 *             nur im Outlook abgeschlossen wurde — die Software verstummte.
 * null      = kein Backend-Aufruf ('naehert' hat kein Signal, 'getroffen' ist
 *             der Zustand, den das Backend gerade selbst gesetzt hat, 'aktiv'
 *             ändert nichts an der Offenheit der Linie).
 */
const TO_BACKEND: Record<SetupStatus, "pending" | "done" | null> = {
  naehert: null,
  getroffen: null,
  beobachtung: "pending",
  wartend: "pending",
  aktiv: null,
  ausgefuehrt: "done",
  verworfen: "done",
};

export function toBackendAction(s: SetupStatus): "pending" | "done" | null {
  return TO_BACKEND[s] ?? null;
}

/* ---------------------------------------------------------------------------
 * Zusammengeführter Zustand
 * ------------------------------------------------------------------------- */

/**
 * Effektiver Zustand eines Setups aus Signal + verknüpftem Outlook.
 *
 * Das Signal trägt den groben Lebenszyklus (offen / verbraucht), der Outlook
 * die Verfeinerung darin. Solange das Signal 'watchlist' ist (= `beobachtung`),
 * darf der Outlook auf `wartend` oder `aktiv` hochstufen — beides bleibt im
 * Backend eine offene Linie. Abgeschlossene Signalzustände (`ausgefuehrt`,
 * `verworfen`) gewinnen dagegen immer: sie sind der Lebenszyklus selbst.
 */
export function effectiveSetupStatus(
  signalStatus: SignalStatus | null | undefined,
  outlookStatus: OutlookStatus | null | undefined,
): SetupStatus {
  if (!signalStatus) {
    return outlookStatus ? fromOutlookStatus(outlookStatus) : "getroffen";
  }
  const base = fromSignalStatus(signalStatus);
  if (base === "beobachtung" && outlookStatus) {
    const fein = fromOutlookStatus(outlookStatus);
    if (fein === "wartend" || fein === "aktiv") return fein;
  }
  return base;
}
