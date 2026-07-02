import Panel from "@/components/layout/Panel";
import StrengthPanel from "@/components/dashboard/StrengthPanel";
import ScreenerPanel from "@/components/dashboard/ScreenerPanel";
import CbSpectrumPanel from "@/components/dashboard/CbSpectrumPanel";
import RiskGaugePanel from "@/components/dashboard/RiskGaugePanel";
import { createServiceClient } from "@/lib/supabase/server";
import { loadDashboardData } from "@/lib/data/dashboard";
import { tryQuery } from "@/lib/data/util";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await tryQuery(() => loadDashboardData(createServiceClient()));

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
          <StrengthPanel strength={data.strength} />
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

      <Panel title="COT-Schnellübersicht" subtitle="Non-Comm-Perzentil je Währung (5J-Fenster) — Details auf der COT-Seite">
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {data.cotPercentiles.map((c) => (
            <div key={c.ccy} className="bg-surface2 border border-border rounded p-2.5 text-center">
              <div className="text-[12px] font-mono font-bold">{c.ccy}</div>
              <div
                className={`text-lg font-black font-mono ${
                  c.percentile >= 90 ? "text-up" : c.percentile <= 10 ? "text-down" : "text-text"
                }`}
              >
                {c.percentile.toFixed(0)}
              </div>
              <div className="text-[9px] text-faint uppercase tracking-wider">
                {c.percentile >= 90 ? "Extrem-Long" : c.percentile <= 10 ? "Extrem-Short" : "Perzentil"}
              </div>
            </div>
          ))}
          {data.cotPercentiles.length === 0 && (
            <p className="col-span-full text-muted text-sm font-mono">
              COT-Daten fehlen — Backfill ausführen.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
