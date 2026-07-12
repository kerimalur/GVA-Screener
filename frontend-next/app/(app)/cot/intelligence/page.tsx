import Panel from "@/components/layout/Panel";
import CotIntelligence from "@/components/cot/CotIntelligence";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <Panel
        title="COT Intelligence — Institutionelle Positionierung"
        subtitle="Gewichteter Bias je Währung aus allen Trader-Gruppen (Dealer, Asset Manager, Leveraged Funds, Commercials, Retail). Ranking, Weekly Heatmap, Flips & Extremes. Klick auf eine Währung → Detailanalyse."
      >
        <CotIntelligence />
      </Panel>
    </div>
  );
}
