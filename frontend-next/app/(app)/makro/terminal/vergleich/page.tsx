import Link from "next/link";
import Panel from "@/components/layout/Panel";
import CurrencyDetailSections from "@/components/terminal/CurrencyDetailSections";
import { BiasScore, DirectionTag } from "@/components/ui/terminal";
import RegionCompare, { type RegionData } from "@/components/makro/RegionCompare";
import SpreadChart from "@/components/makro/SpreadChart";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { loadTerminalData } from "@/lib/data/terminal";
import { getCategoryValue, getStaleFlags } from "@/lib/data/fred";
import { tryQuery } from "@/lib/data/util";
import { G8_CURRENCIES, FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { seriesFor, type FredCategory } from "@/lib/constants/fredSeries";

export const dynamic = "force-dynamic";

// Gleicher Cache-Key wie /makro/terminal → ein gemeinsamer Eintrag.
const getTerminal = unstable_cache(
  () => tryQuery(() => loadTerminalData(createServiceClient())),
  ["terminal-data-v1"],
  { revalidate: 300 },
);

const REGION_CATEGORIES: FredCategory[] = [
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
    REGION_CATEGORIES.map(async (category) => ({
      category,
      label: seriesFor(ccy, category)?.label ?? category,
      data: await getCategoryValue(db, ccy, category, staleFlags),
    })),
  );
  return { ccy, values };
}

// Makro-Regionen-Vergleich (aus der früheren /makro-Seite) — 5 min Cache je Paar.
const getRegions = (ccyA: string, ccyB: string) =>
  unstable_cache(
    () =>
      tryQuery(async () => {
        const db = createServiceClient();
        const staleFlags = await getStaleFlags(db);
        const [regionA, regionB] = await Promise.all([
          loadRegion(db, ccyA, staleFlags),
          loadRegion(db, ccyB, staleFlags),
        ]);
        return { regionA, regionB };
      }),
    ["terminal-regions", ccyA, ccyB],
    { revalidate: 300 },
  )();

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const params = await searchParams;
  const a = G8_CURRENCIES.includes(params.a as never) ? (params.a as string) : "USD";
  const bRaw = G8_CURRENCIES.includes(params.b as never) ? (params.b as string) : "EUR";
  const b = bRaw === a ? (a === "EUR" ? "USD" : "EUR") : bRaw;

  const [data, regions] = await Promise.all([getTerminal(), getRegions(a, b)]);

  const ca = data?.currencies.find((c) => c.ccy === a) ?? null;
  const cb = data?.currencies.find((c) => c.ccy === b) ?? null;

  if (!data || !ca || !cb) {
    return (
      <Panel title="Vergleich — Setup nötig">
        <p className="text-muted text-sm">
          Keine Terminal-Daten — Setup laut README, dann{" "}
          <code className="font-mono text-accent">npx tsx scripts/backfill.mts all</code>.
        </p>
      </Panel>
    );
  }

  // Direktes Pair der beiden Währungen (falls handelbar) für die Spread-Historie
  const directPair =
    FX_INSTRUMENTS.find(
      (i) =>
        (i.baseCcy === a && i.quoteCcy === b) || (i.baseCcy === b && i.quoteCcy === a),
    )?.instrument ?? "EUR_USD";

  const head = (c: NonNullable<typeof ca>, slot: string) => (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-faint">{slot}</span>
      <span className="font-mono text-[11px] font-bold text-faint uppercase">{c.iso}</span>
      <span className="font-mono font-black text-[16px]">{c.ccy}</span>
      <BiasScore
        value={c.score.total === null ? null : c.score.total * 100}
        digits={0}
        threshold={15}
        size="sm"
        className="text-[16px]"
      />
      <DirectionTag direction={c.score.direction} />
    </div>
  );

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/makro/terminal"
          className="text-[12px] font-mono text-accent hover:underline"
        >
          ← Zurück zur Übersicht
        </Link>
        <span className="text-[11px] font-mono text-muted">
          Vergleich {a} vs. {b} — alle Sub-Scores nebeneinander
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="space-y-4">
          <Panel>{head(ca, "Pair 1")}</Panel>
          <CurrencyDetailSections currency={ca} />
        </div>
        <div className="space-y-4">
          <Panel>{head(cb, "Pair 2")}</Panel>
          <CurrencyDetailSections currency={cb} />
        </div>
      </div>

      {regions && (
        <Panel
          title="Regionen-Vergleich (Makro)"
          subtitle="Zinsen, Inflation, Arbeitsmarkt, BIP, Leading Indicator, Handelsbilanz"
        >
          <RegionCompare a={regions.regionA} b={regions.regionB} />
        </Panel>
      )}

      <Panel
        title="Spread-Historie"
        subtitle="10Y-Renditedifferenz oder Leitzinsdifferenz je Pair — einer der stärksten FX-Treiber"
      >
        <SpreadChart initialPair={directPair} />
      </Panel>
    </div>
  );
}
