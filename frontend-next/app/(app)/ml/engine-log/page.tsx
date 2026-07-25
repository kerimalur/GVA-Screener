import Panel from "@/components/layout/Panel";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import { loadEngineLog, type EngineNight } from "@/lib/ml/engineLog";
import { loadHoldout } from "@/lib/ml/holdout";
import HoldoutSection from "@/components/ml/HoldoutSection";
import { formatDelta } from "@/lib/ml/holdoutFormat";

export const dynamic = "force-dynamic";

function HallDelta({ n }: { n: EngineNight }) {
  if (n.bestHall === null) return <span className="text-muted">–</span>;
  const d = formatDelta(n.deltaHall);
  const tone = d?.sign === "up" ? "text-up" : d?.sign === "down" ? "text-down" : "text-muted";
  return (
    <span className="font-mono">
      {n.bestHall.toFixed(3)}
      {d && (
        <span
          className={`ml-1 text-xs ${tone}`}
          title={d.sign === "flat" ? "unverändert zur Vornacht" : "Änderung zur Vornacht"}
        >
          {d.text}
        </span>
      )}
    </span>
  );
}

function ScoreExplainer() {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-xs font-bold text-muted hover:text-fg py-1">
        Was bedeuten Score, Ø-Trefferquote und σ?
      </summary>
      <div className="text-xs text-muted leading-relaxed space-y-2 pl-4 pt-1">
        <p>
          Jede Nacht testet die Engine hunderte Modell-Varianten. Jedes Modell wird nur auf
          Vergangenheitsdaten trainiert und dann auf Wochen geprüft, die es beim Training{" "}
          <span className="font-bold text-fg">nie gesehen hat</span> (out-of-sample). Der Score ist{" "}
          <span className="font-mono text-fg">Ø-Trefferquote − σ</span>: die durchschnittliche
          Trefferquote über die Testfenster, minus deren Schwankung — belohnt wird Konsistenz,
          nicht ein Glückstreffer in einer Marktphase.
        </p>
        <p>
          <span className="font-bold text-fg">Ø und σ getrennt lesen:</span> Ø ≈ 0.51 bei kleiner σ
          = <span className="text-fg">keine Edge</span> (Münzwurf). Ø ≈ 0.55+ bei hoher σ ={" "}
          <span className="text-fg">instabile Edge</span> — funktioniert nur in manchen
          Marktphasen. Erst Ø deutlich über 0.5 UND kleine σ ist ein belastbarer Kandidat.
        </p>
        <p>
          <span className="font-bold text-fg">Stabile Linie:</span> der «Beste der Nacht» ist ein
          rohes Maximum über ~1200 Läufe und springt bei schwachem Signal zufällig zwischen
          Modell-Familien. Die stabile Linie folgt einer festen Familie und wechselt nur, wenn ein
          Herausforderer sie mehrere Nächte in Folge um eine Mindest-Marge schlägt (Hysterese).
          Das reduziert Auswahl-Rauschen — es{" "}
          <span className="font-bold text-fg">verbessert das Signal nicht</span>. (Der strenge
          104-Wochen-Holdout bleibt unangetastet; den prüft erst die manuelle Beförderung.)
        </p>
        <p>
          <span className="font-bold text-fg">Baseline:</span> die Latte, gegen die alles gemessen
          wird — schlicht das Vorzeichen des Zins+Saison-Scores, ohne jedes Training. Ein Modell,
          das sie nicht schlägt, hat keine Existenzberechtigung. Die Baseline läuft nur einmal
          (sie ist deterministisch und das Suchpanel ändert sich nicht), darum zeigen die meisten
          Nächte hier «–» statt eines vorgetragenen Werts. Die gestrichelte Referenzlinie im
          Verlauf markiert ihren Stand.
        </p>
      </div>
    </details>
  );
}

function StagnationHinweis({ nights }: { nights: EngineNight[] }) {
  const aktuell = nights[0];
  if (!aktuell?.stagnant) return null;
  return (
    <div className="rounded-md border border-accent/40 bg-accent/10 p-3 text-xs leading-relaxed">
      <span className="font-bold text-accent">Suche stagniert.</span> Der beste Score bewegt sich
      seit mehreren Nächten nicht mehr — der aktuelle Suchraum ist auskonvergiert. Das ist kein
      Fehler: weitersuchen bringt nichts, solange der Raum nicht erweitert wird (weitere Features,
      Horizonte, Modellfamilien). Der Workflow läuft deshalb seit dem 25.07.2026 wöchentlich statt
      nächtlich.
    </div>
  );
}

export default async function Page() {
  const [{ nights, chart, totalExperiments, lastBaselineHall }, holdout] = await Promise.all([
    loadEngineLog(),
    loadHoldout(),
  ]);

  return (
    <div className="space-y-5 max-w-[1100px] mx-auto">
      <StagnationHinweis nights={nights} />
      <Panel
        title="Verlauf — Score & Trefferquote pro Nacht"
        subtitle={`${nights.length} Nächte · ${totalExperiments} Experimente gesamt · Score = Ø-Trefferquote − σ · stabile Linie wechselt nur mit Marge über mehrere Nächte`}
      >
        {chart.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Experimente. Läuft der Nightly-Workflow?</p>
        ) : (
          <>
            <TimeSeriesChart
              data={chart}
              series={[
                { key: "bestHall", label: "Bester Score (roh)", color: "var(--color-up)" },
                { key: "stableScore", label: "Stabile Linie", color: "var(--color-accent)" },
                { key: "meanHitrate", label: "Ø Trefferquote (roh)", dashed: true },
                { key: "baselineHall", label: "Baseline", color: "var(--color-down)" },
              ]}
              height={220}
              defaultTimeframe="Max"
              yDigits={3}
              refLineY={lastBaselineHall ?? undefined}
            />
            <ScoreExplainer />
          </>
        )}
      </Panel>

      <HoldoutSection data={holdout} />

      <Panel title="Nacht für Nacht" subtitle="Was die wöchentliche Experiment-Suche getan hat.">
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
                  <th className="pr-3">Bester Score (Δ)</th>
                  <th className="pr-3">Baseline</th>
                  <th className="pr-3">Hit Ø ± σ</th>
                  <th className="pr-3">Bestes Modell</th>
                  <th className="pr-3">Stabiles Modell</th>
                  <th>Laufzeit</th>
                </tr>
              </thead>
              <tbody>
                {nights.map((n) => (
                  <tr key={n.date} className="border-t border-border/40">
                    <td className="py-2 pr-3 font-mono">
                      {n.date}
                      {n.stagnant && (
                        <span
                          className="ml-1 text-accent text-[10px]"
                          title="Bester Score seit mehreren Nächten unverändert — Suchraum auskonvergiert"
                        >
                          ⏸
                        </span>
                      )}
                    </td>
                    <td className="pr-3 font-mono">{n.done}</td>
                    <td className={`pr-3 font-mono ${n.failed > 0 ? "text-down" : "text-muted"}`}>
                      {n.failed}
                    </td>
                    <td className="pr-3 font-mono text-muted">{n.pending}</td>
                    <td className="pr-3">
                      <HallDelta n={n} />
                    </td>
                    {/* Nächte ohne Baseline-Lauf zeigen «–» — kein Vortrag des
                        letzten bekannten Werts (siehe run_experiments._best_baseline). */}
                    <td className="pr-3 font-mono text-xs">
                      {n.baselineHall !== null ? (
                        <span title="Zins+Saison-Composite, ohne Training">
                          {n.baselineHall.toFixed(3)}
                          {n.baselineHitrate !== null && (
                            <span className="text-muted"> · hit {n.baselineHitrate.toFixed(3)}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted" title="in dieser Nacht lief keine Baseline">
                          –
                        </span>
                      )}
                    </td>
                    <td className="pr-3 font-mono text-xs">
                      {n.meanHitrate !== null ? (
                        <>
                          {n.meanHitrate.toFixed(3)}
                          <span className="text-muted">
                            {" "}
                            ±{(n.stdHitrate ?? 0).toFixed(3)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                    <td className="pr-3 font-mono text-xs text-muted">{n.bestModel ?? "–"}</td>
                    <td className="pr-3 font-mono text-xs text-muted">
                      {n.stableModel ?? "–"}
                      {n.stableScore !== null && (
                        <span className="text-fg"> · {n.stableScore.toFixed(3)}</span>
                      )}
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
