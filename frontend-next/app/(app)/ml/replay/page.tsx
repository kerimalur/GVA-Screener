import Panel from "@/components/layout/Panel";
import ReplayExplorer from "@/components/ml/ReplayExplorer";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <Panel
        title="Backtest-Replay — GVA-Hits manuell bewerten"
        subtitle="Historische GVA-Hits mit Fundamental-Snapshot der Hit-Woche. Chart in TradingView prüfen (BOS/Fib/Volumen), dann bewerten — Ergebnis wird automatisch bei 1:3 R:R simuliert. Ergibt die ehrliche Winrate des kompletten Setups."
      >
        <ReplayExplorer />
      </Panel>
    </div>
  );
}
