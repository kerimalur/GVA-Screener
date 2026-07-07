import Panel from "@/components/layout/Panel";
import ContractSelector from "@/components/cot/ContractSelector";
import CotSnapshotTable from "@/components/cot/CotSnapshotTable";
import CotHistoryChart from "@/components/cot/CotHistoryChart";
import BacktestPanel from "@/components/cot/BacktestPanel";
import ConditionalOutcomePanel from "@/components/cot/ConditionalOutcomePanel";
import MultiCompare from "@/components/cot/MultiCompare";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getLatestReports, getCotSeriesBatch } from "@/lib/data/cot";
import { tryQuery } from "@/lib/data/util";
import { CFTC_CONTRACTS, CONTRACT_BY_CODE } from "@/lib/constants/cftcContracts";
import { getServerSettings } from "@/lib/settings/server";

export const dynamic = "force-dynamic";

interface PercentileRow {
  code: string;
  label: string;
  net: number;
  percentile: number | null;
  date: string;
}

// Globale Daten, ändern sich wöchentlich (CFTC) — 5 min Server-Cache.
// Map ist nicht JSON-serialisierbar → als Entries cachen.
const getCotPageData = unstable_cache(
  () =>
    tryQuery(async () => {
      const db = createServiceClient();
      const [latest, seriesByCode] = await Promise.all([
        getLatestReports(db),
        getCotSeriesBatch(db, CFTC_CONTRACTS.map((c) => c.code)),
      ]);

      const percentiles: PercentileRow[] = [];
      for (const c of CFTC_CONTRACTS) {
        const series = seriesByCode.get(c.code) ?? [];
        const last = series[series.length - 1];
        if (last) {
          percentiles.push({
            code: c.code,
            label: c.label,
            net: last.net,
            percentile: last.percentile,
            date: last.date,
          });
        }
      }
      return { latestEntries: [...latest.entries()], percentiles };
    }),
  ["cot-page-data"],
  { revalidate: 300 },
);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [{ code: rawCode }, settings, raw] = await Promise.all([
    searchParams,
    getServerSettings(),
    getCotPageData(),
  ]);
  const fallback = CONTRACT_BY_CODE.has(settings.terminal.defaultCot)
    ? settings.terminal.defaultCot
    : "099741";
  const code = rawCode && CONTRACT_BY_CODE.has(rawCode) ? rawCode : fallback;
  const contract = CONTRACT_BY_CODE.get(code)!;
  const hi = settings.terminal.cotExtremePct;
  const lo = 100 - hi;

  const data = raw ? { latest: new Map(raw.latestEntries), percentiles: raw.percentiles } : null;
  const snapshot = data?.latest.get(code);

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <ContractSelector active={code} />

      {!data || data.percentiles.length === 0 ? (
        <Panel title="Keine COT-Daten">
          <p className="text-muted text-sm">
            Supabase leer oder nicht konfiguriert. Setup: <code className="font-mono text-accent">supabase/schema.sql</code> +{" "}
            <code className="font-mono text-accent">seed.sql</code> ausführen, <code className="font-mono text-accent">.env.local</code>{" "}
            füllen, dann <code className="font-mono text-accent">npx tsx scripts/backfill.mts all</code>.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Panel
              title={`Aktueller Report — ${contract.label}`}
              subtitle="Positionen, Netto, Veränderung zur Vorwoche"
            >
              {snapshot ? (
                <CotSnapshotTable latest={snapshot.latest} prev={snapshot.prev} />
              ) : (
                <p className="text-muted text-sm font-mono">Kein Report vorhanden.</p>
              )}
            </Panel>

            <Panel
              title="Extrem-Übersicht (alle Contracts)"
              subtitle="Aktuelles Positionierungs-Perzentil der Non-Commercials (5J-Fenster)"
            >
              <table className="w-full text-[12px] font-mono">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-border">
                    <th className="text-left py-1.5">Contract</th>
                    <th className="text-right py-1.5 px-2">Netto</th>
                    <th className="text-right py-1.5 px-2">Perzentil</th>
                    <th className="text-right py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.percentiles.map((p) => {
                    const extreme =
                      p.percentile === null
                        ? null
                        : p.percentile >= hi
                          ? "long"
                          : p.percentile <= lo
                            ? "short"
                            : null;
                    return (
                      <tr key={p.code} className="border-b border-border/40">
                        <td className="py-1.5 font-sans font-semibold">{p.label}</td>
                        <td className={`text-right py-1.5 px-2 ${p.net >= 0 ? "text-up" : "text-down"}`}>
                          {p.net.toLocaleString("de-DE")}
                        </td>
                        <td className="text-right py-1.5 px-2">
                          {p.percentile !== null ? p.percentile.toFixed(0) : "–"}
                        </td>
                        <td className="text-right py-1.5">
                          {extreme === "long" && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-up/15 text-up">
                              EXTREM-LONG
                            </span>
                          )}
                          {extreme === "short" && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-down/15 text-down">
                              EXTREM-SHORT
                            </span>
                          )}
                          {extreme === null && <span className="text-faint text-[10px]">neutral</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </div>

          <Panel
            title={`Historie — ${contract.label}`}
            subtitle="Non-Commercials & Commercials netto, Preis-Overlay, Perzentil-Verlauf · Zoom via Brush"
          >
            <CotHistoryChart code={code} />
          </Panel>

          <Panel
            title={`Backtest — Was passierte nach COT-Extremen? (${contract.label})`}
            subtitle="Ø-Forward-Returns nach Niveau- oder Δ-Extremen (Flow) — mit Basisrate und Klartext-Fazit"
          >
            {contract.priceInstrument ? (
              <BacktestPanel code={code} />
            ) : (
              <p className="text-muted text-sm">
                Für den Dollar-Index gibt es kein direktes Preis-Instrument — Backtest via EUR (größte DXY-Komponente) wählen.
              </p>
            )}
          </Panel>

          {contract.ccy && contract.ccy !== "USD" && contract.priceInstrument && (
            <Panel
              title={`Conditional-Outcome — Konfluenz Flow × Zins-Drehung (${contract.label})`}
              subtitle="Bei welcher Kombination aus Smart-Money-Flow und 10Y-Spread-Drehung lief das Pair historisch wohin?"
            >
              <ConditionalOutcomePanel code={code} />
            </Panel>
          )}

          <Panel
            title="Contract-Vergleich"
            subtitle="Mehrere Märkte als Perzentil-Linien nebeneinander"
          >
            <MultiCompare />
          </Panel>
        </>
      )}
    </div>
  );
}
