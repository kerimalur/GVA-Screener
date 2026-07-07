import Panel from "@/components/layout/Panel";
import StrengthPanel from "@/components/dashboard/StrengthPanel";
import ScreenerPanel from "@/components/dashboard/ScreenerPanel";
import CbSpectrumPanel from "@/components/dashboard/CbSpectrumPanel";
import RiskGaugePanel from "@/components/dashboard/RiskGaugePanel";
import CurrencyBiasPanel from "@/components/dashboard/CurrencyBiasPanel";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { loadDashboardData } from "@/lib/data/dashboard";
import { tryQuery } from "@/lib/data/util";
import { getServerSettings } from "@/lib/settings/server";

export const dynamic = "force-dynamic";

// Daten sind global (Service-Client) und ändern sich nur per Cron —
// 5 min Server-Cache statt Dutzender Supabase-Roundtrips pro Aufruf.
const getDashboard = unstable_cache(
  () => tryQuery(() => loadDashboardData(createServiceClient())),
  ["dashboard-data"],
  { revalidate: 300 },
);

export default async function Page() {
  const [data, settings] = await Promise.all([getDashboard(), getServerSettings()]);
  const hi = settings.terminal.cotExtremePct;
  const lo = 100 - hi;

  if (!data) {
    return (
      <Panel title="Dashboard — Setup nötig">
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

  const hasPrices = Object.values(data.strength.scores["1M"]).some((v) => v !== 0);

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      {!hasPrices && (
        <Panel title="Hinweis">
          <p className="text-warn text-sm font-mono">
            Preisdaten fehlen — <code>npx tsx scripts/backfill.mts prices</code> ausführen.
          </p>
        </Panel>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel
          title="Currency Strength Index"
          subtitle="Relative Stärke aus 28 Paaren (Ø signierter Return)"
          className="xl:col-span-2"
        >
          <StrengthPanel
            strength={data.strength}
            initialLookback={settings.terminal.strengthLookback}
          />
        </Panel>

        <Panel
          title="Risk-On / Risk-Off"
          subtitle="VIX · Gold · JPY/CHF-Flows · S&P-Trend"
        >
          <RiskGaugePanel risk={data.risk} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel
          title="Pair-Screener"
          subtitle="Long/Short-Einschätzung — nur Signale mit ≥2 gleichgerichteten Faktoren (Zinsdifferenz, COT, Saisonalität, Yield-Spread, Sentiment)"
          className="xl:col-span-2"
        >
          <ScreenerPanel verdicts={data.verdicts} />
        </Panel>

        <Panel
          title="Zentralbank-Spektrum"
          subtitle="Hawkish/Dovish je Notenbank"
        >
          <CbSpectrumPanel stances={data.stances} />
        </Panel>
      </div>

      <Panel
        title="Währungs-Kompass"
        subtitle="Long/Short-Bias je Währung aus 4 Faktoren (COT-Flow, Leitzins-Trend, CB-Stance, Stärke) — Details per Klick"
      >
        <CurrencyBiasPanel biases={data.currencyBias} extremeHi={hi} extremeLo={lo} />
      </Panel>
    </div>
  );
}
