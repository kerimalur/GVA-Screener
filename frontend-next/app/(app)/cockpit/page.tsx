import "server-only";
import Panel from "@/components/layout/Panel";
import CockpitBoard from "@/components/cockpit/CockpitBoard";
import { loadFundamentalContext } from "@/lib/cockpit/detailServer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cockpit — FX Terminal" };

export default async function CockpitPage() {
  const { quintiles } = await loadFundamentalContext();

  return (
    <div className="space-y-4 max-w-[1280px] mx-auto">
      <Panel
        title="Cockpit — alle Setups"
        subtitle="Nähert sich → Getroffen → Watchlist → In Arbeit. GVA-Hits erscheinen von selbst, eigene Setups über «+ Setup». Klick auf eine Karte öffnet den Outlook; nur «Genommen» landet im Journal."
      >
        <div className="p-4">
          <CockpitBoard quintiles={quintiles} />
        </div>
      </Panel>
    </div>
  );
}
