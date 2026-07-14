import Panel from "@/components/layout/Panel";
import ReplayExplorer from "@/components/ml/ReplayExplorer";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <Panel
        title="GVA-Replay — Hits manuell bewerten"
        subtitle="Rein technisch: historische GVA-Hits chronologisch durchgehen und mit TradingView abgleichen — pro Linie nur Erstellungsdatum, Hit-Datum und Hit-Preis. Sessions lassen sich pausieren, fortsetzen und auswerten."
      >
        <ReplayExplorer />
      </Panel>
    </div>
  );
}
