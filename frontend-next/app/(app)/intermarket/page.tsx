import { unstable_cache } from "next/cache";
import Panel from "@/components/layout/Panel";
import CorrelationMatrix from "@/components/intermarket/CorrelationMatrix";
import OverlayTool from "@/components/intermarket/OverlayTool";
import DxyChart from "@/components/intermarket/DxyChart";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";
import { loadIntermarketData } from "@/lib/data/intermarket";
import { DXY_WEIGHTS } from "@/lib/calc/dxy";

export const dynamic = "force-dynamic";

// Globale Daten — 5 min Server-Cache.
const getIntermarket = unstable_cache(
  () => tryQuery(() => loadIntermarketData(createServiceClient())),
  ["intermarket-data"],
  { revalidate: 300 },
);

export default async function Page() {
  const data = await getIntermarket();

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <Panel
        title="Korrelationsmatrix"
        subtitle="Pearson auf Tages-Log-Returns — Fenster 20/60/200 Tage wählbar"
      >
        <CorrelationMatrix />
      </Panel>

      <Panel
        title="Intermarket-Overlay"
        subtitle="Beliebige zwei Instrumente übereinander — Dual-Achse oder normalisiert, rollierende Korrelation"
      >
        <OverlayTool />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel
          title="DXY-Dashboard"
          subtitle="Dollar-Index aus offizieller Formel + FRED Broad Dollar"
          className="xl:col-span-2"
        >
          {data && data.dxy.length > 0 ? (
            <>
              <DxyChart dxy={data.dxy} broad={data.broad} />
              <div className="flex flex-wrap gap-2 mt-3">
                {DXY_WEIGHTS.map((w) => (
                  <span
                    key={w.key}
                    className="px-2 py-0.5 rounded bg-surface2 border border-border text-[10px] font-mono text-muted"
                  >
                    {w.key.replace("_", "/")} {w.weight > 0 ? "+" : ""}
                    {(w.weight * 100).toFixed(1)} %
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted text-sm font-mono py-8 text-center">
              DXY braucht Preis- + FRED-Daten (DEXSDUS) — Backfill ausführen.
            </p>
          )}
        </Panel>

        <Panel title="USD-Paare (1M)" subtitle="Dollar-Auswirkung auf alle USD-Paare">
          <div className="space-y-1.5">
            {(data?.impact ?? []).map((row) => (
              <div key={row.pair} className="flex items-center gap-2 text-[12px]">
                <span className="w-20 font-mono font-bold">{row.pair}</span>
                <div className="flex-1 h-2.5 bg-surface2 rounded-sm relative overflow-hidden">
                  {row.ret1M !== null && (
                    <div
                      className={`absolute top-0 h-full ${
                        row.ret1M >= 0 ? "bg-up/60 left-1/2" : "bg-down/60 right-1/2"
                      }`}
                      style={{ width: `${Math.min(50, Math.abs(row.ret1M) * 12)}%` }}
                    />
                  )}
                  <div className="absolute left-1/2 top-0 h-full w-px bg-faint/50" />
                </div>
                <span
                  className={`w-16 text-right font-mono font-bold ${
                    row.ret1M === null ? "text-faint" : row.ret1M >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {row.ret1M !== null ? `${row.ret1M > 0 ? "+" : ""}${row.ret1M.toFixed(2)} %` : "–"}
                </span>
              </div>
            ))}
            {(!data || data.impact.length === 0) && (
              <p className="text-muted text-sm font-mono py-4 text-center">Keine Preisdaten.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
