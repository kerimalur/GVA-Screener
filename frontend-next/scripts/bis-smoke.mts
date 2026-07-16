// Wegwerf-Smoke-Test: npx tsx scripts/bis-smoke.mts
import { fetchBisFlow } from "../lib/sources/bis";

const cpi = await fetchBisFlow("WS_LONG_CPI", "M.US+XM+GB+JP+CH+AU+NZ+CA.771", "2026-01");
const pol = await fetchBisFlow("WS_CBPOL", "M.US+XM+GB+JP+CH+AU+NZ+CA", "2026-01");

for (const [name, map] of [["CPI", cpi], ["CBPOL", pol]] as const) {
  if (!map) {
    console.log(`${name}: FEHLER (null)`);
    process.exitCode = 1;
    continue;
  }
  for (const [area, obs] of [...map.entries()].sort()) {
    const last = obs[obs.length - 1];
    console.log(`${name} ${area}: ${obs.length} Punkte, letzter ${last.date} = ${last.value}`);
  }
}
