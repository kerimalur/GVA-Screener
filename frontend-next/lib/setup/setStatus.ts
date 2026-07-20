/**
 * Der EINZIGE Schreibpfad für Setup-Statusänderungen.
 *
 * Vorher gab es zwei: Das Cockpit schrieb `signals.status` + `markPair`, der
 * Outlook schrieb `outlooks.status` — ohne voneinander zu wissen. Wer ein Setup
 * im Outlook abschloss, liess das Paar im Backend sticky auf TRIGGERED stehen:
 * kein neuer Alert, keine nächste Linie. Genau dieser Fehler hat die Software
 * verstummen lassen.
 *
 * Seit dem Umbau ändert NUR `setSetupStatus` einen Setup-Status. Cockpit und
 * Outlook rufen ausschliesslich diese Funktion; direkte `setSignalStatus`- oder
 * `updateOutlook`-Aufrufe für Statuswechsel gibt es nicht mehr.
 */

import { markPair } from "@/lib/gva/api";
import { setSignalStatus } from "@/lib/journal/signals";
import { updateOutlook } from "@/lib/journal/outlooks";
import {
  toBackendAction,
  toOutlookStatus,
  toSignalStatus,
  type SetupStatus,
} from "./lifecycle";

export interface SetSetupStatusInput {
  /** ID in `signals` — fehlt bei manuell angelegten Outlooks. */
  signalId?: string | null;
  /** ID in `outlooks` — fehlt bei Altbestand oder fehlgeschlagenem Insert. */
  outlookId?: string | null;
  /** Pair für den Backend-Lebenszyklus, z.B. "EURUSD". */
  pair?: string | null;
  next: SetupStatus;
}

/** Nur für Tests austauschbar — im Betrieb immer die echten Implementierungen. */
export interface SetupStatusDeps {
  setSignalStatus: typeof setSignalStatus;
  updateOutlook: typeof updateOutlook;
  markPair: typeof markPair;
}

const DEFAULT_DEPS: SetupStatusDeps = { setSignalStatus, updateOutlook, markPair };

export interface SetSetupStatusResult {
  /** true = `signals.status` wurde geschrieben */
  signalGeschrieben: boolean;
  /** true = der verknüpfte Outlook wurde gespiegelt */
  outlookGespiegelt: boolean;
  /** ausgelöste Backend-Aktion, null = keine */
  backendAktion: "pending" | "done" | null;
}

/**
 * Setzt einen Setup-Status über alle Ebenen hinweg.
 *
 * Reihenfolge und Fehlertoleranz:
 *  1. `signals.status` (Wahrheit des Lebenszyklus) — darf werfen.
 *  2. verknüpfter Outlook auf den gespiegelten Status — Fehler wird gemerkt,
 *     aber NICHT sofort geworfen: sonst bliebe Schritt 3 aus und das Paar
 *     stünde wieder sticky auf HIT. Schritt 1 wird nie zurückgerollt.
 *  3. `markPair` — idempotent, wirft nie, wird bei Fehlschlag nur geloggt.
 *
 * Ein in Schritt 2 aufgetretener Fehler wird ganz am Schluss geworfen, damit
 * der Aufrufer ihn sichtbar machen kann (Toast) — nachdem der Lebenszyklus
 * vollständig geschlossen wurde.
 */
export async function setSetupStatus(
  { signalId, outlookId, pair, next }: SetSetupStatusInput,
  deps: SetupStatusDeps = DEFAULT_DEPS,
): Promise<SetSetupStatusResult> {
  const signalStatus = toSignalStatus(next);
  const outlookStatus = toOutlookStatus(next);
  const backendAktion = toBackendAction(next);

  // 1. Signal — die Wahrheit. Fehler hier bricht die Aktion ab.
  let signalGeschrieben = false;
  if (signalId && signalStatus) {
    await deps.setSignalStatus(signalId, signalStatus);
    signalGeschrieben = true;
  }

  // 2. Outlook spiegeln. `startedAt` wird beim Übergang nach 'aktiv' gesetzt —
  //    der Zeitpunkt, ab dem der Trade läuft.
  let outlookGespiegelt = false;
  let outlookFehler: unknown = null;
  if (outlookId && outlookStatus) {
    try {
      await deps.updateOutlook(outlookId, {
        status: outlookStatus,
        ...(outlookStatus === "active" ? { startedAt: new Date().toISOString() } : {}),
      });
      outlookGespiegelt = true;
    } catch (e) {
      outlookFehler = e;
      console.warn(`setSetupStatus: Outlook ${outlookId} nicht gespiegelt (${next}):`, e);
    }
  }

  // 3. Backend-Lebenszyklus schliessen. Ohne diesen Aufruf bleibt das Paar für
  //    immer sticky auf HIT. Läuft auch dann, wenn Schritt 2 gescheitert ist.
  //    Nur mit Signal: ein rein manuell angelegter Outlook hat im Screener nie
  //    eine Linie belegt — `markPair` hätte dort nichts zu schliessen und würde
  //    im schlimmsten Fall einen fremden offenen HIT desselben Paars verbrauchen.
  if (backendAktion && pair && signalId) {
    const ok = await deps.markPair(pair, backendAktion);
    if (!ok) {
      console.warn(
        `setSetupStatus: Backend-Lebenszyklus für ${pair} nicht bestätigt (${backendAktion})`,
      );
    }
  }

  if (outlookFehler) throw outlookFehler;
  return { signalGeschrieben, outlookGespiegelt, backendAktion };
}
