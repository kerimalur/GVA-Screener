import Panel from "@/components/layout/Panel";
import SeriesPicker from "@/components/vergleich/SeriesPicker";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="max-w-[1400px] mx-auto">
      <Panel
        title="Freier Vergleich"
        subtitle="Beliebige zwei Datenreihen auf gemeinsamer Zeitachse — Dual-Achse oder normalisiert, mit rollierender Korrelation"
      >
        <SeriesPicker />
      </Panel>
    </div>
  );
}
