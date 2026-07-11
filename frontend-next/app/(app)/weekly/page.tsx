import Panel from "@/components/layout/Panel";
import WeeklyPairCard from "@/components/weekly/WeeklyPairCard";
import WeeklyBtcCard from "@/components/weekly/WeeklyBtcCard";
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

  const signals = data.cards.filter((c) => c.verdict.direction !== null);
  const rest = data.cards.filter((c) => c.verdict.direction === null);

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <Panel
        title="Sonntagabend-Cockpit"
        subtitle={`Top-Down-Dossier je Pair — sortiert nach Signalstärke (Faktoren-Konfluenz + Smart-Money-Rotation). COT-Quelle: ${
          data.usingTff ? "TFF Leveraged Funds" : "Legacy Non-Commercials (TFF-Backfill ausstehend)"
        }${data.latestCotDate ? ` · Report ${new Date(data.latestCotDate).toLocaleDateString("de-DE")}` : ""}`}
      >
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono text-muted">
          <span><span className="text-up">▲</span>/<span className="text-down">▼</span> Faktor-Richtung (bezogen aufs Pair)</span>
          <span><span className="text-warn">⚡</span> Drift-Event (CPI/NFP/Zinsentscheid)</span>
          <span>↑3W = Flow seit 3 Wochen gleiches Vorzeichen (Akkumulation)</span>
          <span>&bdquo;Outlook erstellen&ldquo; übergibt das Dossier an den Journal-Wizard</span>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <WeeklyBtcCard btc={data.btc} />
        {signals.map((c) => (
          <WeeklyPairCard key={c.instrument} card={c} />
        ))}
      </div>

      {rest.length > 0 && (
        <Panel
          title="Ohne Signal"
          subtitle="Weniger als 2 gleichgerichtete Faktoren — Beobachtungsliste"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {rest.map((c) => (
              <WeeklyPairCard key={c.instrument} card={c} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
