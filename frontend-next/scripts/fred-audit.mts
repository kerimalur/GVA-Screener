/**
 * FRED-Frische-Audit (lokal ausführen, kein Supabase nötig):
 *   npx tsx scripts/fred-audit.mts
 *
 * Prüft jede Katalog-Serie live gegen die keyless FRED-CSV und meldet
 * letztes Datum + Alter. STALE/DEAD-Serien im Katalog ersetzen oder
 * als bekannte Lücke dokumentieren (siehe fredSeries.ts-Kommentare).
 */
import { FRED_CATALOG } from "../lib/constants/fredSeries";

interface AuditResult {
  id: string;
  label: string;
  status: "ok" | string;
  lastDate?: string;
}

async function probe(id: string, label: string): Promise<AuditResult> {
  try {
    const res = await fetch(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (fx-terminal-audit)" } },
    );
    if (!res.ok) return { id, label, status: `HTTP ${res.status}` };
    const lines = (await res.text()).trim().split("\n");
    if (lines.length < 2 || !lines[0].toLowerCase().includes("date"))
      return { id, label, status: "no-csv" };
    for (let i = lines.length - 1; i > 0; i--) {
      const comma = lines[i].indexOf(",");
      const date = lines[i].slice(0, comma);
      const raw = lines[i].slice(comma + 1).trim();
      if (raw !== "." && raw !== "") return { id, label, status: "ok", lastDate: date };
    }
    return { id, label, status: "empty" };
  } catch (e) {
    return { id, label, status: `err: ${e instanceof Error ? e.message : e}` };
  }
}

const results = await Promise.all(FRED_CATALOG.map((s) => probe(s.id, s.label)));
const now = Date.now();
let dead = 0;
let stale = 0;

for (const r of results) {
  if (r.status !== "ok") {
    dead += 1;
    console.log(`DEAD   ${r.id.padEnd(20)} ${r.label} (${r.status})`);
    continue;
  }
  const ageDays = Math.round((now - new Date(r.lastDate!).getTime()) / 86_400_000);
  // >400 Tage deckt auch Quartalsserien mit Publikationsverzug ab
  const flag = ageDays > 400 ? "STALE " : ageDays > 100 ? "OLD   " : "FRESH ";
  if (ageDays > 400) stale += 1;
  console.log(`${flag} ${r.id.padEnd(20)} last=${r.lastDate} (${ageDays}d)  ${r.label}`);
}

console.log(`\n${results.length} Serien: ${dead} tot, ${stale} stale (>400d).`);
if (dead + stale > 0) process.exitCode = 1;
