import { unstable_cache } from "next/cache";
import Panel from "@/components/layout/Panel";
import SeasonalityHeatmap, { type SeasonRow } from "@/components/saisonalitaet/SeasonalityHeatmap";
import SeasonalityDetail from "@/components/saisonalitaet/SeasonalityDetail";
import { createServiceClient } from "@/lib/supabase/server";
import { getSeasonalityStats } from "@/lib/data/seasonality";
import { tryQuery } from "@/lib/data/util";
import { INSTRUMENTS } from "@/lib/constants/instruments";
import { MONTH_LABELS } from "@/lib/calc/seasonality";

export const dynamic = "force-dynamic";

// Map nicht JSON-serialisierbar → Entries cachen (5 min).
const getSeasonality = unstable_cache(
  () =>
    tryQuery(async () => {
      const stats = await getSeasonalityStats(createServiceClient());
      return [...stats.entries()];
    }),
  ["seasonality-data"],
  { revalidate: 300 },
);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string }>;
}) {
  const [{ instrument: rawInstrument }, entries] = await Promise.all([
    searchParams,
    getSeasonality(),
  ]);
  const stats = entries ? new Map(entries) : null;

  if (!stats || stats.size === 0) {
    return (
      <Panel title="Keine Saisonalitäts-Daten">
        <p className="text-muted text-sm">
          Berechnung läuft direkt in Postgres (View <code className="font-mono text-accent">seasonality_stats</code>) —
          braucht Preishistorie: <code className="font-mono text-accent">npx tsx scripts/backfill.mts prices</code>.
        </p>
      </Panel>
    );
  }

  const instrument =
    rawInstrument && stats.has(rawInstrument) ? rawInstrument : "EUR_USD";
  const detail = stats.get(instrument);
  const detailDef = INSTRUMENTS.find((i) => i.instrument === instrument);

  const rows: SeasonRow[] = INSTRUMENTS.filter((i) => stats.has(i.instrument)).map((i) => {
    const s = stats.get(i.instrument)!;
    return {
      instrument: i.instrument,
      displayName: i.displayName,
      values: s.months.map((m) => (m.years > 0 ? m.avgReturn : null)),
    };
  });

  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <Panel
        title="Monats-Heatmap (Ø-Return in %)"
        subtitle={`Alle Instrumente × 12 Monate — ${MONTH_LABELS[currentMonth - 1]} hervorgehoben · Klick auf Zelle öffnet Detail`}
      >
        <SeasonalityHeatmap rows={rows} />
      </Panel>

      <Panel
        title={`Detail — ${detailDef?.displayName ?? instrument}`}
        subtitle="Ø-Monatsreturn + Trefferquote (Anteil positiver Jahre)"
      >
        {detail ? (
          <SeasonalityDetail
            displayName={detailDef?.displayName ?? instrument}
            months={detail.months}
            yearsCovered={detail.yearsCovered}
          />
        ) : (
          <p className="text-muted text-sm font-mono">Keine Daten für {instrument}.</p>
        )}
      </Panel>
    </div>
  );
}
