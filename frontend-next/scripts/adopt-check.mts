// Kontrollwerte für die manuelle Radar-Übernahme: npx tsx scripts/adopt-check.mts
//
// Deckt ab:
//   - vorhandener Outlook -> auf „Aktiv" gehoben, Signal NICHT angefasst
//     (bleibt getroffen im Cockpit), kein neuer Outlook
//   - kein Outlook -> neuer „Aktiv"-Outlook, ans offene Signal gekoppelt
//   - kein Signal -> eigenständiger „Aktiv"-Outlook (signalId null)
//   - Richtungs-Ableitung aus `near`
import { adoptHitPair, type AdoptDeps } from "../lib/setup/adopt";
import type { SignalRecord } from "../lib/journal/signals";
import type { OutlookRecord } from "../lib/journal/outlooks";

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (erwartet ${JSON.stringify(expected)})`}`,
  );
}

function sig(pair: string, status: string, id = "sig-1"): SignalRecord {
  return {
    id,
    source: "gva",
    pair,
    lineType: "short",
    lineLevel: 1.1,
    hitAt: "2026-07-21T00:00:00Z",
    fundamentalSnapshot: null,
    status: status as SignalRecord["status"],
    createdAt: "2026-07-21T00:00:00Z",
    detectedLate: false,
    lineFormedDate: null,
  };
}

interface Log {
  setStatus: unknown[];
  saved: OutlookRecord[];
}

function stubs(signals: SignalRecord[], gvaOutlooks: OutlookRecord[]): { deps: AdoptDeps; log: Log } {
  const log: Log = { setStatus: [], saved: [] };
  const deps: AdoptDeps = {
    loadSignals: async () => signals,
    loadGvaOutlooks: async () => gvaOutlooks,
    saveOutlook: async (o) => {
      log.saved.push(o);
      return { ...o, id: "new-out" };
    },
    setSetupStatus: async (input) => {
      log.setStatus.push(input);
      return { signalGeschrieben: false, outlookGespiegelt: true, backendAktion: null };
    },
  };
  return { deps, log };
}

// A: Signal + vorhandener Outlook -> Update auf „Aktiv", Signal NICHT angefasst.
{
  const outlook: OutlookRecord = {
    id: "out-1",
    signalId: "sig-1",
    symbol: "EURUSD",
    direction: "short",
    thesis: "",
    confidence: 3,
    status: "observation",
    source: "gva",
  };
  const { deps, log } = stubs([sig("EURUSD", "new")], [outlook]);
  const res = await adoptHitPair("EURUSD", "SHORT", 1.1, deps);
  check("A: meldet aktiviert", res, "aktiviert");
  check("A: kein neuer Outlook", log.saved.length, 0);
  check("A: hebt Outlook auf Aktiv, Signal null (bleibt getroffen)", log.setStatus, [
    { signalId: null, outlookId: "out-1", pair: "EURUSD", next: "aktiv" },
  ]);
}

// B: Signal ohne Outlook -> neuer „Aktiv"-Outlook, ans Signal gekoppelt.
{
  const { deps, log } = stubs([sig("GBPUSD", "new", "sig-9")], []);
  const res = await adoptHitPair("GBPUSD", "LONG", 1.27, deps);
  check("B: meldet angelegt", res, "angelegt");
  check("B: kein setSetupStatus", log.setStatus.length, 0);
  check("B: Outlook aktiv angelegt", log.saved[0].status, "active");
  check("B: Richtung aus near=LONG", log.saved[0].direction, "long");
  check("B: ans Signal gekoppelt", log.saved[0].signalId, "sig-9");
  check("B: Zone gesetzt", log.saved[0].interestingZone, 1.27);
}

// C: kein offenes Signal -> eigenständiger „Aktiv"-Outlook.
{
  const { deps, log } = stubs([sig("AUDUSD", "journaled")], []); // nur ein verbrauchtes
  const res = await adoptHitPair("AUDUSD", "SHORT", null, deps);
  check("C: meldet angelegt", res, "angelegt");
  check("C: Outlook ohne Signal", log.saved[0].signalId, null);
  check("C: Richtung aus near=SHORT", log.saved[0].direction, "short");
}

console.log(fails === 0 ? "\nAlle Kontrollwerte grün." : `\n${fails} Kontrollwert(e) FAIL.`);
process.exitCode = fails === 0 ? 0 : 1;
