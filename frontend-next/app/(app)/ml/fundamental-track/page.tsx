import Panel from "@/components/layout/Panel";
import FundamentalTrack from "@/components/ml/FundamentalTrack";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <Panel
        title="Fundamental-Track — Q-Score vs. Markt"
        subtitle="Pro Pair: die letzten 52 Wochen-Q-Scores beider Währungen (Baseline, as-of) und ob der Markt danach 1W/4W in Bias-Richtung lief. Inspektion der Score-Kalibrierung — nicht der ML-Backtest."
      >
        <div className="p-5">
          <FundamentalTrack />
        </div>
      </Panel>
    </div>
  );
}
