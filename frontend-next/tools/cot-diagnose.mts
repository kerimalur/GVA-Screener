/**
 * Warum sind Commercials und Nicht-Meldepflichtige leer?
 *
 * Aufruf aus frontend-next heraus:
 *   node --env-file=.env.local --experimental-strip-types tools/cot-diagnose.mts
 *
 * Die Vermutung, die hier geprueft wird: `updateCot` holt je Contract nur die
 * Berichte NACH dem letzten gespeicherten Datum. Wurden `comm_long` und
 * `nonrept_long` erst spaeter in `lib/sources/cftc.ts` aufgenommen, stehen sie
 * in allen aelteren Zeilen als NULL — und werden nie wieder angefasst, weil
 * genau diese Zeilen nie erneut geholt werden.
 *
 * Das Skript aendert nichts. Es zaehlt nur.
 */
import { createClient } from "@supabase/supabase-js";

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

const zahl = async (
  bau: (q: ReturnType<typeof db.from>) => unknown,
): Promise<number | null> => {
  const q = db.from("cot_reports").select("*", { count: "exact", head: true });
  const { count, error } = await (bau(q as never) as never as Promise<{
    count: number | null; error: unknown;
  }>);
  if (error) { console.error("  Fehler:", error); return null; }
  return count;
};

const gesamt = await zahl((q) => q);
const mitKomm = await zahl((q) => (q as never as { not: Function }).not("comm_long", "is", null));
const mitRetail = await zahl((q) => (q as never as { not: Function }).not("nonrept_long", "is", null));

console.log("\ncot_reports gesamt          :", gesamt);
console.log("davon mit comm_long        :", mitKomm);
console.log("davon mit nonrept_long     :", mitRetail);

// Wo verlaeuft die Grenze? Der aelteste Bericht MIT comm_long sagt, ab wann
// die Spalte mitgeschrieben wurde.
const { data: aeltestesMit } = await db.from("cot_reports")
  .select("report_date").not("comm_long", "is", null)
  .order("report_date", { ascending: true }).limit(1).maybeSingle();
const { data: juengstesOhne } = await db.from("cot_reports")
  .select("report_date").is("comm_long", null)
  .order("report_date", { ascending: false }).limit(1).maybeSingle();

console.log("aeltester Bericht MIT comm :", aeltestesMit?.report_date ?? "keiner");
console.log("juengster Bericht OHNE     :", juengstesOhne?.report_date ?? "keiner");

console.log("\nBefund:");
if (mitKomm === 0) {
  console.log("  comm_long ist UEBERALL null. Die Spalte wurde nie geschrieben —");
  console.log("  ein voller Backfill ist noetig (updateCot mit voll = true).");
} else if (gesamt !== null && mitKomm !== null && mitKomm < gesamt) {
  console.log(`  ${gesamt - mitKomm} von ${gesamt} Zeilen ohne comm_long.`);
  console.log("  Passt zur Vermutung: die Spalte kam spaeter dazu, und");
  console.log("  updateCot holt nur Berichte NACH dem letzten Datum.");
  console.log("  Voller Backfill noetig (updateCot mit voll = true).");
} else {
  console.log("  Die Spalten sind gefuellt. Dann liegt es NICHT an den Rohdaten —");
  console.log("  dann als Naechstes COT_CONTRACT in Kompass/src/lib/confluence/daten.ts");
  console.log("  gegen die contract_code-Werte in cot_reports halten.");
}
