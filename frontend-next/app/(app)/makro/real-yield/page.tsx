import { createServiceClient } from "@/lib/supabase/server";
import { loadRealYieldData } from "@/lib/data/realYield";
import RealYieldView from "@/components/makro/RealYieldView";

export const dynamic = "force-dynamic";

export default async function Page() {
  const db = createServiceClient();
  const { currencies, risk, vixDate } = await loadRealYieldData(db);
  return <RealYieldView currencies={currencies} risk={risk} vixDate={vixDate} />;
}
