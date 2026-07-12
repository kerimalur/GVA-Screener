import Panel from "@/components/layout/Panel";
import MacroTerminal from "@/components/makro/MacroTerminal";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <Panel
        title="Macro Terminal — G10 Currency Bias"
        subtitle="Fundamentalbild jeder G8-Währung auf einen Blick: Macro-Score, Regime, Sub-Scores, Zentralbank-Monitor. Alles aus FRED, deterministisch berechnet."
      >
        <MacroTerminal />
      </Panel>
    </div>
  );
}
