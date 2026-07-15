import Panel from "@/components/layout/Panel";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import { loadEngineLog, type EngineNight } from "@/lib/ml/engineLog";

export const dynamic = "force-dynamic";

function HallDelta({ n }: { n: EngineNight }) {
  if (n.bestHall === null) return <span className="text-muted">–</span>;
  const d = n.deltaHall;
  return (
    <span className="font-mono">
      {n.bestHall.toFixed(3)}
      {d !== null && d !== 0 && (
        <span className={`ml-1 text-xs ${d > 0 ? "text-up" : "text-down"}`}>
          {d > 0 ? "▲" : "▼"}
          {Math.abs(d).toFixed(3)}
        </span>
      )}
    </span>
  );
}

export default async function Page() {
  const { nights, chart, totalExperiments } = await loadEngineLog();

  return (
    <div className="space-y-5 max-w-[1100px] mx-auto">
      <Panel
        title="Verlauf — bester Hall-Score pro Nacht"
        subtitle={`${totalExperiments} Experimente gesamt · steigend = die Suche findet konsistentere Modelle`}
      >
        {chart.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Experimente. Läuft der Nightly-Workflow?</p>
        ) : (
          <TimeSeriesChart
            data={chart}
            series={[{ key: "bestHall", label: "Bester Hall-Score", color: "var(--color-up)" }]}
            height={220}
            yDigits={3}
          />
        )}
      </Panel>

      <Panel title="Nacht für Nacht" subtitle="Was die nächtliche Experiment-Suche getan hat.">
        {nights.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Läufe.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs">
                  <th className="py-1 pr-3">Nacht (UTC)</th>
                  <th className="pr-3">Fertig</th>
                  <th className="pr-3">Fehler</th>
                  <th className="pr-3">Offen</th>
                  <th className="pr-3">Bester Hall (Δ)</th>
                  <th>Laufzeit</th>
                </tr>
              </thead>
              <tbody>
                {nights.map((n) => (
                  <tr key={n.date} className="border-t border-border/40">
                    <td className="py-2 pr-3 font-mono">{n.date}</td>
                    <td className="pr-3 font-mono">{n.done}</td>
                    <td className={`pr-3 font-mono ${n.failed > 0 ? "text-down" : "text-muted"}`}>
                      {n.failed}
                    </td>
                    <td className="pr-3 font-mono text-muted">{n.pending}</td>
                    <td className="pr-3">
                      <HallDelta n={n} />
                    </td>
                    <td className="font-mono text-muted">{n.runtimeMin} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {nights.some((n) => n.failures.length > 0) && (
        <Panel title="Fehlgeschlagene Runs" subtitle="Damit ein stiller Crash nicht unbemerkt bleibt.">
          <div className="space-y-3">
            {nights
              .filter((n) => n.failures.length > 0)
              .map((n) => (
                <details key={n.date} className="text-sm">
                  <summary className="cursor-pointer font-mono">
                    {n.date} — {n.failures.length} Fehler
                  </summary>
                  <ul className="mt-1 ml-4 space-y-1">
                    {n.failures.map((f, i) => (
                      <li key={i} className="text-xs font-mono text-muted">
                        <span className="text-accent">{f.algo}</span> — {f.error}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
