import Panel from "@/components/layout/Panel";
import TerminalOverview from "@/components/terminal/TerminalOverview";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { loadTerminalData } from "@/lib/data/terminal";
import { tryQuery } from "@/lib/data/util";

export const dynamic = "force-dynamic";

// Globale Daten (Service-Client, Cron-Updates) — 5 min Server-Cache.
// Gleicher Key wie die Vergleichsseite → ein gemeinsamer Cache-Eintrag.
const getTerminal = unstable_cache(
  () => tryQuery(() => loadTerminalData(createServiceClient())),
  ["terminal-data-v1"],
  { revalidate: 300 },
);

export default async function Page() {
  const data = await getTerminal();

  if (!data || data.currencies.length === 0) {
    return (
      <Panel title="Macro Terminal — Setup nötig">
        <p className="text-muted text-sm">
          Supabase leer oder nicht konfiguriert. Setup:{" "}
          <code className="font-mono text-accent">supabase/schema.sql</code> +{" "}
          <code className="font-mono text-accent">seed.sql</code> im SQL-Editor ausführen,{" "}
          <code className="font-mono text-accent">.env.local</code> füllen, dann{" "}
          <code className="font-mono text-accent">npx tsx scripts/backfill.mts all</code>.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <Panel
        title="Macro Terminal — G8 Currency Bias"
        subtitle={`Die eine Bias-Wahrheit: COT · Zinsen · Saisonalität · Retail je Währung${
          data.latestCotDate
            ? ` · COT-Report ${new Date(data.latestCotDate).toLocaleDateString("de-DE")}`
            : ""
        }${
          data.sentimentAge
            ? ` · Sentiment ${new Date(data.sentimentAge).toLocaleDateString("de-DE")}`
            : ""
        }`}
      >
        <TerminalOverview currencies={data.currencies} />
      </Panel>
    </div>
  );
}
