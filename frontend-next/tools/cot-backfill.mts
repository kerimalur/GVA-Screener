/**
 * Einmaliger COT-Vollabzug.
 *
 * Aufruf aus frontend-next heraus:
 *   npx tsx --env-file=.env.local tools/cot-backfill.mts
 *
 * Warum es das gibt: `updateCot` holt je Contract nur die Berichte NACH dem
 * letzten gespeicherten Datum. Fehlen dem Bestand ZEILEN, reicht das. Fehlt
 * ihm eine SPALTE — `comm_long` und `nonrept_long` kamen erst spaeter in das
 * Mapping — hilft es nie, weil die alten Zeilen nie wieder angefasst werden.
 * Dieser Lauf ignoriert das letzte Datum und holt die Historie ab 2006 neu.
 *
 * Es ist ein Upsert auf (contract_code, report_date): gefahrlos wiederholbar,
 * nichts wird geloescht. Er dauert einige Minuten — deshalb hier und nicht
 * im normalen Cron.
 */
import { createClient } from "@supabase/supabase-js";
import { updateCot } from "@/lib/jobs/updateCot";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  const fehlt = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !key && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean).join(", ");
  console.error(
    `\nFehlt in .env.local: ${fehlt}\n\n`
    + "Der Service-Role-Key steht nicht in .env.local, weil `vercel env pull`\n"
    + "nur die DEVELOPMENT-Variablen zieht — gesetzt ist er aber unter\n"
    + "Production. Zwei Wege:\n\n"
    + "  a) Supabase-Dashboard -> Project Settings -> API Keys -> service_role\n"
    + "     kopieren und als Zeile in .env.local eintragen:\n"
    + "     SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\n"
    + "  b) npx vercel link  und danach\n"
    + "     npx vercel env pull .env.local --environment=production\n\n"
    + "Der Key ist ein Vollzugriff auf die Datenbank — nicht committen.\n"
    + ".env.local steht bereits in .gitignore.\n",
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const vorher = await db
  .from("cot_reports")
  .select("*", { count: "exact", head: true })
  .not("comm_long", "is", null);

console.log("Zeilen mit comm_long vorher :", vorher.count ?? "?");
console.log("Vollabzug laeuft ... (mehrere Minuten)");

const start = Date.now();
const ergebnis = await updateCot(db, { voll: true });
const dauer = Math.round((Date.now() - start) / 1000);

const nachher = await db
  .from("cot_reports")
  .select("*", { count: "exact", head: true })
  .not("comm_long", "is", null);

console.log("\nJob-Ergebnis  :", JSON.stringify(ergebnis));
console.log("Dauer         :", dauer, "s");
console.log("Zeilen mit comm_long nachher:", nachher.count ?? "?");

if ((nachher.count ?? 0) > (vorher.count ?? 0)) {
  console.log("\nGefuellt. Monty neu laden — die Tabelle sollte stehen.");
} else {
  console.log(
    "\nKeine Aenderung. Dann liegt es NICHT am inkrementellen Abzug:"
    + "\n  - hat cot_reports die Spalten comm_long/nonrept_long ueberhaupt?"
    + "\n  - liefert die CFTC-Antwort comm_positions_long_all?"
    + "\n  - stehen im Job-Ergebnis oben Fehler?",
  );
}
