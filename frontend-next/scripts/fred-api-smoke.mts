// Smoke-Test offizielle FRED-API: npx tsx scripts/fred-api-smoke.mts
// Braucht FRED_API_KEY in der Env oder .env.local (kostenlos:
// https://fred.stlouisfed.org/docs/api/api_key.html — Key NIE committen).
import { config } from "dotenv";
config({ path: ".env.local" });

const { fetchSeries } = await import("../lib/sources/fred");

if (!process.env.FRED_API_KEY) {
  console.log("FRED_API_KEY fehlt (Env oder .env.local) — Abbruch.");
  process.exit(1);
}

// Querschnitt: täglich (US), monatlich mit Publikationslag (NZ 10Y), nie geladen (T10Y2Y)
const IDS = ["DGS10", "VIXCLS", "DFII10", "IRLTLT01NZM156N", "IRLTLT01JPM156N", "T10Y2Y"];

let failed = 0;
for (const id of IDS) {
  const obs = await fetchSeries(id);
  if (!obs) {
    console.log(`${id}: FEHLER (null)`);
    failed++;
    continue;
  }
  const last = obs[obs.length - 1];
  const age = Math.round((Date.now() - new Date(last.date).getTime()) / 86_400_000);
  console.log(`${id}: ${obs.length} Punkte, letzter ${last.date} = ${last.value} (${age} Tage alt)`);
}
process.exit(failed ? 1 : 0);
