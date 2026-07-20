// Kontrollwerte für den Setup-Lebenszyklus: npx tsx scripts/setup-lifecycle-check.mts
//
// Deckt ab:
//   - Vokabular-Mapping in BEIDE Richtungen (signals / outlooks / Backend)
//   - setSetupStatus mit und ohne Signal (manueller Outlook)
//   - Outlook-Spiegelung scheitert -> Signal bleibt gesetzt, Backend wird
//     trotzdem freigegeben, Fehler ist sichtbar
import {
  effectiveSetupStatus,
  fromOutlookStatus,
  fromSignalStatus,
  isClosedSetup,
  setupLabel,
  toBackendAction,
  toOutlookStatus,
  toSignalStatus,
  type SetupStatus,
} from "../lib/setup/lifecycle";
import { setSetupStatus, type SetupStatusDeps } from "../lib/setup/setStatus";
import type { SignalStatus } from "../lib/journal/signals";
import type { OutlookStatus, OutlookRecord } from "../lib/journal/outlooks";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

// --- signals.status <-> SetupStatus ------------------------------------------
const SIGNAL_STATUSES: SignalStatus[] = ["new", "watchlist", "journaled", "dismissed"];

check(
  "fromSignalStatus deckt alle vier technischen Werte ab",
  SIGNAL_STATUSES.map(fromSignalStatus),
  ["getroffen", "beobachtung", "ausgefuehrt", "verworfen"],
);
check(
  "Rundreise signals -> Setup -> signals ist verlustfrei",
  SIGNAL_STATUSES.map((s) => toSignalStatus(fromSignalStatus(s))),
  SIGNAL_STATUSES,
);
check(
  "Zustände ohne Signal-Entsprechung liefern null",
  (["naehert", "wartend", "aktiv"] as SetupStatus[]).map(toSignalStatus),
  [null, null, null],
);

// --- outlooks.status <-> SetupStatus -----------------------------------------
const OUTLOOK_STATUSES: OutlookStatus[] = [
  "observation",
  "waiting",
  "active",
  "executed",
  "cancelled",
];

check(
  "fromOutlookStatus deckt alle fünf Werte ab",
  OUTLOOK_STATUSES.map(fromOutlookStatus),
  ["beobachtung", "wartend", "aktiv", "ausgefuehrt", "verworfen"],
);
check(
  "Rundreise outlooks -> Setup -> outlooks ist verlustfrei",
  OUTLOOK_STATUSES.map((s) => toOutlookStatus(fromOutlookStatus(s))),
  OUTLOOK_STATUSES,
);
check(
  "ephemere/unentschiedene Zustände haben keine Outlook-Entsprechung",
  (["naehert", "getroffen"] as SetupStatus[]).map(toOutlookStatus),
  [null, null],
);

// --- Backend-Aktion ----------------------------------------------------------
const ALLE: SetupStatus[] = [
  "naehert", "getroffen", "beobachtung", "wartend", "aktiv", "ausgefuehrt", "verworfen",
];
check(
  "toBackendAction je Zustand",
  ALLE.map(toBackendAction),
  [null, null, "pending", "pending", null, "done", "done"],
);
check(
  "abgeschlossene Zustände fallen aus der Offen-Ansicht",
  ALLE.filter(isClosedSetup),
  ["ausgefuehrt", "verworfen"],
);

// --- Dasselbe Wort bedeutet überall dasselbe ---------------------------------
check("Cockpit-Lane heisst nicht mehr «Wartend»", setupLabel("naehert"), "Nähert sich");
check("«Wartend» ist die bewusste Absicht", setupLabel("wartend"), "Wartend");

// --- Zusammengeführter Zustand ----------------------------------------------
check("frischer Hit ohne Outlook", effectiveSetupStatus("new", null), "getroffen");
check("Signal beobachtet, Outlook auch", effectiveSetupStatus("watchlist", "observation"), "beobachtung");
check("Outlook verfeinert auf wartend", effectiveSetupStatus("watchlist", "waiting"), "wartend");
check("Outlook verfeinert auf aktiv", effectiveSetupStatus("watchlist", "active"), "aktiv");
check(
  "abgeschlossenes Signal gewinnt gegen den Outlook",
  effectiveSetupStatus("journaled", "observation"),
  "ausgefuehrt",
);
check(
  "frischer Hit wird vom Auto-Outlook nicht hochgestuft",
  effectiveSetupStatus("new", "observation"),
  "getroffen",
);
check("Outlook ohne Signal (manuell)", effectiveSetupStatus(null, "waiting"), "wartend");

// --- setSetupStatus ----------------------------------------------------------
interface Aufrufe {
  signal: [string, SignalStatus][];
  outlook: [string, Partial<OutlookRecord>][];
  mark: [string, "pending" | "done"][];
}

function stubs(outlookWirft = false): { deps: SetupStatusDeps; log: Aufrufe } {
  const log: Aufrufe = { signal: [], outlook: [], mark: [] };
  const deps: SetupStatusDeps = {
    setSignalStatus: async (id, status) => {
      log.signal.push([id, status]);
    },
    updateOutlook: async (id, updates) => {
      log.outlook.push([id, updates]);
      if (outlookWirft) throw new Error("Supabase down");
      return { ...updates, id } as OutlookRecord;
    },
    markPair: async (pair, action) => {
      log.mark.push([pair, action]);
      return true;
    },
  };
  return { deps, log };
}

// Cockpit „Beobachten"
{
  const { deps, log } = stubs();
  await setSetupStatus(
    { signalId: "sig-1", outlookId: "out-1", pair: "EURUSD", next: "beobachtung" },
    deps,
  );
  check("Beobachten schreibt signals.status", log.signal, [["sig-1", "watchlist"]]);
  check("Beobachten spiegelt den Outlook", log.outlook, [["out-1", { status: "observation" }]]);
  check("Beobachten meldet dem Backend 'pending'", log.mark, [["EURUSD", "pending"]]);
}

// Cockpit „Genommen"
{
  const { deps, log } = stubs();
  await setSetupStatus(
    { signalId: "sig-1", outlookId: "out-1", pair: "EURUSD", next: "ausgefuehrt" },
    deps,
  );
  check("Genommen: Signal journaled", log.signal, [["sig-1", "journaled"]]);
  check("Genommen: Outlook executed", log.outlook, [["out-1", { status: "executed" }]]);
  check("Genommen: Linie verbraucht", log.mark, [["EURUSD", "done"]]);
}

// Outlook „Verworfen" — dieselbe Backend-Freigabe wie im Cockpit.
// Genau diese Kette hat vorher gefehlt und das Paar sticky auf HIT gelassen.
{
  const { deps, log } = stubs();
  await setSetupStatus(
    { signalId: "sig-9", outlookId: "out-9", pair: "GBPJPY", next: "verworfen" },
    deps,
  );
  check("Verworfen: Signal dismissed", log.signal, [["sig-9", "dismissed"]]);
  check("Verworfen: Outlook cancelled", log.outlook, [["out-9", { status: "cancelled" }]]);
  check("Verworfen: Backend gibt das Pair frei", log.mark, [["GBPJPY", "done"]]);
}

// Manueller Outlook ohne Signal: vollständig bewegbar, aber KEIN markPair
{
  const { deps, log } = stubs();
  for (const next of ["wartend", "aktiv", "verworfen"] as SetupStatus[]) {
    await setSetupStatus({ outlookId: "out-m", pair: "AUDUSD", next }, deps);
  }
  check("manueller Outlook schreibt nie signals", log.signal, []);
  check(
    "manueller Outlook durchläuft alle Zustände",
    log.outlook.map(([, u]) => u.status),
    ["waiting", "active", "cancelled"],
  );
  check("manueller Outlook ruft kein markPair", log.mark, []);
  check(
    "Übergang nach aktiv setzt startedAt",
    typeof log.outlook[1][1].startedAt === "string",
    true,
  );
}

// Signal ohne Outlook (Altbestand): funktioniert unverändert
{
  const { deps, log } = stubs();
  const res = await setSetupStatus({ signalId: "sig-alt", pair: "USDCHF", next: "verworfen" }, deps);
  check("Altbestand: Signal wird gesetzt", log.signal, [["sig-alt", "dismissed"]]);
  check("Altbestand: nichts zu spiegeln", log.outlook, []);
  check("Altbestand: Backend wird trotzdem freigegeben", log.mark, [["USDCHF", "done"]]);
  check("Ergebnis meldet fehlende Spiegelung", res.outlookGespiegelt, false);
}

// Outlook-Spiegelung scheitert: Signal bleibt gesetzt, Backend wird freigegeben,
// der Fehler ist trotzdem sichtbar (wirft am Ende).
{
  const { deps, log } = stubs(true);
  let geworfen = false;
  try {
    await setSetupStatus(
      { signalId: "sig-2", outlookId: "out-2", pair: "NZDUSD", next: "verworfen" },
      deps,
    );
  } catch {
    geworfen = true;
  }
  check("Spiegel-Fehler rollt das Signal NICHT zurück", log.signal, [["sig-2", "dismissed"]]);
  check("Spiegel-Fehler blockiert die Backend-Freigabe nicht", log.mark, [["NZDUSD", "done"]]);
  check("Spiegel-Fehler ist sichtbar", geworfen, true);
}

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
