import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import Panel from "@/components/layout/Panel";
import CotCurrencyDetailView from "@/components/cot/CotCurrencyDetail";
import { createServiceClient } from "@/lib/supabase/server";
import { getCotCurrencyDetail } from "@/lib/data/cotIntel";
import { tryQuery } from "@/lib/data/util";
import { G8_CURRENCIES } from "@/lib/constants/instruments";

export const dynamic = "force-dynamic";

const loadDetail = (ccy: string) =>
  unstable_cache(
    () => tryQuery(() => getCotCurrencyDetail(createServiceClient(), ccy)),
    ["cot-intel-detail", ccy],
    { revalidate: 3600 },
  )();

export default async function Page({ params }: { params: Promise<{ currency: string }> }) {
  const { currency } = await params;
  const ccy = currency.toUpperCase();
  if (!G8_CURRENCIES.includes(ccy as never)) notFound();

  const detail = await loadDetail(ccy);
  if (!detail) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <Panel title={`COT Intelligence — ${ccy}`}>
          <p className="text-muted text-sm">
            Keine COT-Daten für {ccy} vorhanden. Backfill ausführen oder auf den nächsten
            wöchentlichen CFTC-Report warten.
          </p>
        </Panel>
      </div>
    );
  }

  return <CotCurrencyDetailView d={detail} />;
}
