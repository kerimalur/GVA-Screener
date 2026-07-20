import Panel from "@/components/layout/Panel";
import WeeklyGrid from "@/components/weekly/WeeklyGrid";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { loadWeeklyData } from "@/lib/data/weekly";
import { tryQuery } from "@/lib/data/util";

export const dynamic = "force-dynamic";

// Globale Daten, ändern sich nur per Cron — 5 min Server-Cache wie Dashboard.
const getWeekly = unstable_cache(
  () => tryQuery(() => loadWeeklyData(createServiceClient())),
  ["weekly-data-v2"],
  { revalidate: 300 },
);

export default async function Page() {
  const data = await getWeekly();

  if (!data) {
    return (
      <Panel title="Weekly Outlook — Setup nötig">
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
        title="Sonntagabend-Cockpit"
        subtitle={`Urteilsfreies Dossier je Pair — faktisch sortiert (Standard: Ereignisse der Woche), KEIN LONG/SHORT-Signal. COT-Quelle: ${
          data.usingTff ? "TFF Leveraged Funds" : "Legacy Non-Commercials (TFF-Backfill ausstehend)"
        }${data.latestCotDate ? ` · Report ${new Date(data.latestCotDate).toLocaleDateString("de-DE")}` : ""}`}
      >
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono text-muted">
          <span><span className="text-up">▲</span>/<span className="text-down">▼</span> Faktor-Richtung (Einzelfakt, kein Gesamturteil)</span>
          <span><span className="text-warn">⚡</span> Drift-Event (CPI/NFP/Zinsentscheid)</span>
          <span>↑3W = Flow seit 3 Wochen gleiches Vorzeichen (Akkumulation)</span>
          <span>&bdquo;Outlook erstellen&ldquo; übergibt die Faktenlage an den Journal-Wizard</span>
        </div>
      </Panel>

      {!data.usingTff && (
        <Panel title="Hinweis">
          <p className="text-warn text-sm font-mono">
            TFF-Daten fehlen noch — <code>npx tsx scripts/backfill.mts cot</code> ausführen
            (Flow basiert bis dahin auf Legacy Non-Commercials).
          </p>
        </Panel>
      )}

      <WeeklyGrid data={data} />
    </div>
  );
}
