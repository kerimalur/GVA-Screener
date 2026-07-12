import Panel from "@/components/layout/Panel";
import TrainingPanel from "@/components/ml/TrainingPanel";

export const dynamic = "force-static";

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      <Panel
        title="ML-Modell (LightGBM)"
        subtitle="Lernt Direction 1–4W aus COT-Rohdaten + Saisonalität — Python-Backend (Render), Walk-Forward-validiert"
      >
        <TrainingPanel />
      </Panel>
    </div>
  );
}
