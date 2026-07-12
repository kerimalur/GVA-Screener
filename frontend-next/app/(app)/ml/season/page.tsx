import Panel from "@/components/layout/Panel";
import SeasonExplorer from "@/components/ml/SeasonExplorer";
import SeasonVerdict from "@/components/ml/SeasonVerdict";

export default function SeasonPage() {
  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      <Panel
        title="Saison-Verdict — was wirklich funktioniert"
        subtitle="Automatische Prüfung: nur signifikante UND in beiden Zeithälften stabile Muster gelten. Kein Selbst-Interpretieren."
      >
        <SeasonVerdict />
      </Panel>

      <Panel
        title="Saison-Explorer (Rohdaten)"
        subtitle="Alle Sub-Patterns zum eigenen Erkunden — Interpretation liefert der Verdict oben"
      >
        <SeasonExplorer />
      </Panel>
    </div>
  );
}
