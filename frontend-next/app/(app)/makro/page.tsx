import Panel from "@/components/layout/Panel";
import RegionCompare, { type RegionData } from "@/components/makro/RegionCompare";
import SpreadChart from "@/components/makro/SpreadChart";
import ExpectationsPanel from "@/components/makro/ExpectationsPanel";
import OverlayChart from "@/components/intermarket/OverlayChart";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCategoryValue, getStaleFlags, getFredSeries } from "@/lib/data/fred";
import { tryQuery } from "@/lib/data/util";
import { G8_CURRENCIES, FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { seriesFor, type FredCategory } from "@/lib/constants/fredSeries";
import { getServerSettings } from "@/lib/settings/server";
import type { CbMeetingRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const CATEGORIES: FredCategory[] = [
  "policy_rate",
  "yield_10y",
  "cpi",
  "unemployment",
  "gdp",
  "cli",
  "trade",
];

async function loadRegion(
  db: ReturnType<typeof createServiceClient>,
  ccy: string,
  staleFlags: Map<string, boolean>,
): Promise<RegionData> {
  const values = await Promise.all(
    CATEGORIES.map(async (category) => ({
      category,
      label: seriesFor(ccy, category)?.label ?? category,
      data: await getCategoryValue(db, ccy, category, staleFlags),
    })),
  );
  return { ccy, values };
}

// Globale Daten (Service-Client, Cron-Updates) — 5 min Server-Cache je Regionen-Paar.
const getMakroData = (ccyA: string, ccyB: string) =>
  unstable_cache(
    () =>
      tryQuery(async () => {
        const db = createServiceClient();
        const staleFlags = await getStaleFlags(db);
        const recentSince = new Date();
        recentSince.setFullYear(recentSince.getFullYear() - 2);
        const recentStr = recentSince.toISOString().slice(0, 10);

        // Regionen, Zins-Tabelle, Erwartungen, Meetings — alles parallel
        const [regionA, regionB, latestRows, dgs2, fedfunds, meetingsRes] = await Promise.all([
          loadRegion(db, ccyA, staleFlags),
          loadRegion(db, ccyB, staleFlags),
          Promise.all(
            G8_CURRENCIES.map(async (ccy) => {
              const [rate, y10] = await Promise.all([
                getCategoryValue(db, ccy, "policy_rate", staleFlags, recentStr),
                getCategoryValue(db, ccy, "yield_10y", staleFlags, recentStr),
              ]);
              return [ccy, { rate: rate?.latest ?? null, y10: y10?.latest ?? null }] as const;
            }),
          ),
          getFredSeries(db, "DGS2", recentStr),
          getFredSeries(db, "FEDFUNDS", recentStr),
          db.from("cb_meetings").select("*").order("meeting_date", { ascending: true }),
        ]);

        return {
          regionA,
          regionB,
          latestRows,
          dgs2: dgs2[dgs2.length - 1]?.value ?? null,
          fedfunds: fedfunds[fedfunds.length - 1]?.value ?? null,
          meetings: (meetingsRes.data ?? []) as CbMeetingRow[],
        };
      }),
    ["makro-data", ccyA, ccyB],
    { revalidate: 300 },
  )();

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const [params, settings] = await Promise.all([searchParams, getServerSettings()]);
  const defA = G8_CURRENCIES.includes(settings.terminal.makroA as never)
    ? settings.terminal.makroA
    : "USD";
  const defB = G8_CURRENCIES.includes(settings.terminal.makroB as never)
    ? settings.terminal.makroB
    : "EUR";
  const ccyA = G8_CURRENCIES.includes(params.a as never) ? (params.a as string) : defA;
  const ccyB = G8_CURRENCIES.includes(params.b as never) ? (params.b as string) : defB;

  const raw = await getMakroData(ccyA, ccyB);
  const data = raw ? { ...raw, latestByCcy: new Map(raw.latestRows) } : null;

  if (!data) {
    return (
      <Panel title="Keine Makro-Daten">
        <p className="text-muted text-sm">
          Supabase leer oder nicht konfiguriert — Setup laut README, dann{" "}
          <code className="font-mono text-accent">npx tsx scripts/backfill.mts all</code>.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <Panel
        title="Regionen-Vergleich"
        subtitle="Zwei Währungsräume nebeneinander — Zinsen, Inflation, Arbeitsmarkt, BIP, Leading Indicator, Handelsbilanz"
      >
        <RegionCompare a={data.regionA} b={data.regionB} />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel
          title="Zins- & Renditedifferenzen"
          subtitle="Aktuelle Leitzinsen und 10Y-Renditen aller G8-Währungen"
        >
          <table className="w-full text-[12px] font-mono">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-border">
                <th className="text-left py-1.5">Währung</th>
                <th className="text-right py-1.5 px-3">Leitzins</th>
                <th className="text-right py-1.5 px-3">10Y</th>
                <th className="text-right py-1.5">10Y − Leitzins</th>
              </tr>
            </thead>
            <tbody>
              {G8_CURRENCIES.map((ccy) => {
                const v = data.latestByCcy.get(ccy);
                const curve =
                  v?.rate != null && v?.y10 != null ? v.y10 - v.rate : null;
                return (
                  <tr key={ccy} className="border-b border-border/40">
                    <td className="py-1.5 font-bold">{ccy}</td>
                    <td className="text-right py-1.5 px-3">
                      {v?.rate != null ? `${v.rate.toFixed(2)} %` : "–"}
                    </td>
                    <td className="text-right py-1.5 px-3">
                      {v?.y10 != null ? `${v.y10.toFixed(2)} %` : "–"}
                    </td>
                    <td
                      className={`text-right py-1.5 ${
                        curve === null ? "text-faint" : curve < 0 ? "text-down" : "text-up"
                      }`}
                    >
                      {curve !== null ? `${curve > 0 ? "+" : ""}${curve.toFixed(2)} pp` : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-faint mt-2">
            EUR-10Y = Deutschland (Benchmark). Negative Kurve (10Y &lt; Leitzins) = Inversion.
          </p>
        </Panel>

        <Panel
          title="Markterwartungen Zinsentscheide"
          subtitle="2Y-Proxy + gepflegtes Meeting-Pricing"
        >
          <ExpectationsPanel
            dgs2={data.dgs2}
            fedfunds={data.fedfunds}
            meetings={data.meetings}
          />
        </Panel>
      </div>

      <Panel
        title="Spread-Historie"
        subtitle="10Y-Renditedifferenz oder Leitzinsdifferenz je Pair — einer der stärksten FX-Treiber"
      >
        <SpreadChart initialPair={FX_INSTRUMENTS[0].instrument} />
      </Panel>

      <Panel
        title="Commodity-Korrelationen"
        subtitle="Rohstoff vs. zugehöriges Pair, mit rollierender 60-Tage-Korrelation"
      >
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div>
            <div className="text-[11px] font-bold mb-1">WTI Öl ↔ USD/CAD</div>
            <OverlayChart
              a={{ type: "price", key: "WTICO_USD", label: "WTI" }}
              b={{ type: "price", key: "USD_CAD" }}
              height={220}
            />
          </div>
          <div>
            <div className="text-[11px] font-bold mb-1">Gold ↔ AUD/USD</div>
            <OverlayChart
              a={{ type: "price", key: "XAU_USD", label: "Gold" }}
              b={{ type: "price", key: "AUD_USD" }}
              height={220}
            />
          </div>
          <div>
            <div className="text-[11px] font-bold mb-1">Kupfer ↔ AUD & NZD</div>
            <OverlayChart
              a={{ type: "price", key: "XCU_USD", label: "Kupfer" }}
              b={{ type: "price", key: "NZD_USD" }}
              height={220}
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}
