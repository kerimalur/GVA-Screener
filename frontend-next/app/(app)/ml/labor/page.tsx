import Panel from "@/components/layout/Panel";
import LaborExplorer from "@/components/ml/LaborExplorer";

export const dynamic = "force-static";

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      <Panel
        title="ML-Labor — Faktor-Explorer"
        subtitle="Jede Faktor-Variante × jede Kombination × jede Währung, interaktiv. COT als Non-Commercials UND Commercials. Horizont & Zeitraum als Filter."
      >
        <LaborExplorer />
      </Panel>
    </div>
  );
}
