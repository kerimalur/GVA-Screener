/**
 * Manuelle Übernahme eines gehitteten Pairs aus dem visuellen Radar
 * („Pending"-Button in der DetailsModal).
 *
 * Der GVA-Hit hat im Backend bereits ein Signal angelegt (status 'new' =
 * getroffen) — dadurch steht das Pair im Cockpit in der Getroffen-Lane wie
 * jeder Hit. Diese Funktion ergänzt die Outlook-Seite: sie hebt den
 * (auto-angelegten) Outlook des Pairs auf Status „Aktiv" bzw. legt ihn an,
 * falls noch keiner existiert.
 *
 * WICHTIG: passiert NUR auf manuellen Klick — keine automatische Übernahme
 * aller Hits. Das Signal bleibt bewusst 'new' (kein markPair): im Cockpit soll
 * das Pair wie ein Getroffen-Pair erscheinen, im Outlook mit Status „Aktiv".
 * Genau diese Trennung fordert die Aufgabe (Cockpit = Getroffen, Outlook = Aktiv).
 *
 * Reuse statt Sonderweg: der Update-Fall läuft über `setSetupStatus`
 * (einziger Schreibpfad), der Anlege-Fall über `saveOutlook`.
 */

import { loadSignals } from "@/lib/journal/signals";
import { loadGvaOutlooks, outlooksBySignal, saveOutlook } from "@/lib/journal/outlooks";
import { setSetupStatus } from "./setStatus";

/** Nur für Tests austauschbar — im Betrieb die echten Implementierungen. */
export interface AdoptDeps {
  loadSignals: typeof loadSignals;
  loadGvaOutlooks: typeof loadGvaOutlooks;
  saveOutlook: typeof saveOutlook;
  setSetupStatus: typeof setSetupStatus;
}

const DEFAULT_DEPS: AdoptDeps = { loadSignals, loadGvaOutlooks, saveOutlook, setSetupStatus };

/** Offene Signalzustände = das Pair hat einen laufenden HIT. */
const OPEN_STATUSES = new Set(["new", "watchlist"]);

export type AdoptResult = "aktiviert" | "angelegt";

/**
 * `near` = welche Linie berührt wurde (aus MarketData): SHORT → Short-Setup,
 * LONG → Long-Setup. `level` = Linien-Level für die Zone (darf null sein).
 */
export async function adoptHitPair(
  pair: string,
  near: "SHORT" | "LONG" | null,
  level: number | null,
  deps: AdoptDeps = DEFAULT_DEPS,
): Promise<AdoptResult> {
  const direction: "long" | "short" = near === "LONG" ? "long" : "short";

  // Offenes Signal des Pairs finden (loadSignals liefert nach hit_at absteigend,
  // also ist das erste Match das jüngste). Der Hit hat es angelegt.
  const signals = await deps.loadSignals();
  const signal = signals.find((s) => s.pair === pair && OPEN_STATUSES.has(s.status));

  if (signal) {
    const bySignal = outlooksBySignal(await deps.loadGvaOutlooks());
    const existing = bySignal[signal.id];
    if (existing?.id) {
      // Signal NICHT anfassen (signalId:null) → bleibt 'new' = getroffen, damit
      // das Cockpit das Pair weiter in der Getroffen-Lane zeigt. Nur der Outlook
      // wird auf „Aktiv" gehoben (setzt zugleich startedAt).
      await deps.setSetupStatus({ signalId: null, outlookId: existing.id, pair, next: "aktiv" });
      return "aktiviert";
    }
  }

  // Kein Outlook vorhanden → einen als „Aktiv" anlegen, ans Signal gekoppelt
  // (falls eins existiert; sonst als eigenständigen GVA-Outlook).
  await deps.saveOutlook({
    symbol: pair,
    direction,
    thesis: `GVA ${direction.toUpperCase()}-Linie getroffen — manuell übernommen`,
    confidence: 3,
    status: "active",
    interestingZone: level,
    startedAt: new Date().toISOString(),
    signalId: signal?.id ?? null,
    source: "gva",
  });
  return "angelegt";
}
