import Panel from "@/components/layout/Panel";
import TrainingButton from "@/components/ml/TrainingButton";

export const dynamic = "force-static";

/**
 * Erklär-Seite zum neuen LightGBM-ML-Modell: was es kann, wie man es trainiert,
 * wie es besser wird, und der Unterschied zum alten regelbasierten System.
 */

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-[11px] font-bold text-accent">
        {n}
      </div>
      <div className="text-[13px]">
        <div className="font-bold text-text mb-0.5">{title}</div>
        <div className="text-muted leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1000px] mx-auto">

      {/* Was ist das */}
      <Panel
        title="Das ML-Modell — was es ist"
        subtitle="Ein echtes gelerntes Modell statt fester Regeln"
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-muted">
          <p>
            Bis jetzt hat das Tool mit <span className="text-text">festen Wenn-Dann-Regeln</span>{" "}
            gearbeitet: „COT-Flow &gt; 2 % → bullish“, „Saison-Return &gt; 0,3 % → long“. Fünf solche
            Regeln, ≥ 2 gleichgerichtet = Signal. Diese Schwellen waren Bauchgefühl und haben im
            Backtest ~50 % Trefferquote gebracht — keine Edge.
          </p>
          <p>
            Das neue <span className="text-text font-medium">LightGBM-Modell</span> (ein Gradient-
            Boosted-Trees-Verfahren) bekommt stattdessen <span className="text-text">~40 Rohdaten-
            Merkmale</span> pro Woche und Pair und lernt <span className="text-text">selbst</span>,
            welche Kombinationen die Kursrichtung der nächsten 1–4 Wochen vorhersagen — inklusive
            Wechselwirkungen, die keine einzelne Regel abbilden kann.
          </p>
        </div>
      </Panel>

      {/* Unterschied alt vs neu */}
      <Panel title="Alt vs. neu — der Unterschied" subtitle="Regelbasiertes System (Labor) vs. gelerntes Modell">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[640px]">
            <thead>
              <tr className="text-[9px] text-faint font-mono uppercase tracking-wider text-left">
                <th className="pb-2 pr-4"></th>
                <th className="pb-2 pr-4">Altes System (Regeln / Labor)</th>
                <th className="pb-2">Neues ML-Modell (LightGBM)</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {[
                ["Entscheidung", "Feste Schwellen von Hand gesetzt", "Aus 8–17 Jahren Daten gelernt"],
                ["Faktoren", "5 grobe Faktoren, binär (−1/0/+1)", "~40 feine Merkmale, kontinuierlich"],
                ["COT", "1 Variante (Non-Comm), 1 Zeitfenster", "Non-Comm + Commercials + Leveraged, Perzentile 1/3/5J, Flows 1/4/8/13W, Beschleunigung, Divergenz, OI"],
                ["Wechselwirkung", "Keine — jeder Faktor zählt gleich", "Bäume erfassen Kombinationen (z. B. „COT-Extrem NUR wenn OI steigt“)"],
                ["Ausgabe", "LONG / SHORT / neutral (binär)", "Wahrscheinlichkeit 0–100 % + Confidence"],
                ["Gewichtung", "Alle Faktoren gleich (auch schädliche)", "Modell gewichtet automatisch, ignoriert nutzlose Merkmale"],
                ["Validierung", "Ganze Periode (Overfit-Gefahr)", "Walk-Forward: nur auf Vergangenheit trainiert, auf ungesehener Zukunft getestet"],
              ].map(([k, a, b]) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-2 pr-4 font-bold text-text whitespace-nowrap">{k}</td>
                  <td className="py-2 pr-4 text-muted">{a}</td>
                  <td className="py-2 text-muted">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-faint mt-3 leading-relaxed">
          Das Labor (Faktor-Explorer) bleibt bestehen — es ist das ehrliche Mess-Werkzeug, mit dem
          wir überhaupt erst herausgefunden haben, dass die alten Regeln keine Edge hatten. Das
          ML-Modell ist der Versuch, aus denselben Rohdaten mehr herauszuholen.
        </p>
      </Panel>

      {/* Was es kann */}
      <Panel title="Was es kann" subtitle="Auf der Seite „Daten-Check“ im Panel „ML-Modell“">
        <div className="grid md:grid-cols-3 gap-3 text-[12.5px]">
          <div className="rounded border border-border bg-surface2 p-3">
            <div className="text-text font-bold mb-1">Predictions</div>
            <div className="text-muted leading-relaxed">
              Für alle 28 Pairs: Richtung + Wahrscheinlichkeit für 1, 2, 3 oder 4 Wochen. Sortiert
              nach Confidence — kräftige Farbe = hohe Konfidenz, ausgegraut = schwach (nicht traden).
            </div>
          </div>
          <div className="rounded border border-border bg-surface2 p-3">
            <div className="text-text font-bold mb-1">Walk-Forward-Report</div>
            <div className="text-muted leading-relaxed">
              Trefferquote out-of-sample, AUC, Winrate pro Zeitfenster (Fold-Balken). Zeigt ehrlich,
              ob das Modell auf ungesehenen Daten funktioniert — nicht nur auf Trainingsdaten.
            </div>
          </div>
          <div className="rounded border border-border bg-surface2 p-3">
            <div className="text-text font-bold mb-1">Feature Importance</div>
            <div className="text-muted leading-relaxed">
              Welche Merkmale das Modell tatsächlich nutzt — COT (blau) vs. Saison (grün). So siehst
              du, ob Smart-Money oder Saisonalität die Vorhersage trägt.
            </div>
          </div>
        </div>
      </Panel>

      {/* Wie man trainiert */}
      <Panel title="Wie man es trainiert" subtitle="Einmal auf Knopfdruck, dann fertige Modelle in der DB">
        <div className="space-y-3.5">
          <Step n={1} title="„Training starten“ klicken">
            Direkt hier (oder im ML-Modell-Panel auf der Daten-Check-Seite). Läuft im Hintergrund auf
            dem Render-Backend — der Button zeigt live den Fortschritt (Features → Training 1W → 2W → …).
            <TrainingButton />
          </Step>
          <Step n={2} title="5–15 Minuten warten">
            Das Modell baut ~40 Merkmale über die volle Historie, macht eine Grid-Suche über
            Hyperparameter und trainiert 4 Modelle (je Horizont) mit Walk-Forward-Validierung
            (~25 Zeitfenster). Läuft on-demand, nicht automatisch.
          </Step>
          <Step n={3} title="Report prüfen">
            Nach „abgeschlossen ✓“ erscheinen Predictions + OOS-Kennzahlen. Wichtigste Zahl:{" "}
            <span className="text-text">OOS-Winrate</span> und{" "}
            <span className="text-text">High-Confidence-Winrate</span>. Liegt die klar über 50 %
            (out-of-sample!), hat das Modell echte Edge.
          </Step>
          <Step n={4} title="Bei neuen Daten neu trainieren">
            COT/Preise aktualisieren sich wöchentlich per Cron. Ein erneutes Training alle paar
            Wochen zieht die neuen Daten mit ein — die alten Modelle werden automatisch ersetzt.
          </Step>
        </div>
      </Panel>

      {/* Wie es besser wird */}
      <Panel title="Wie es besser wird" subtitle="Stellschrauben, wenn die Edge noch zu klein ist">
        <ul className="space-y-2 text-[12.5px] text-muted leading-relaxed">
          <li>
            <span className="text-text font-medium">Mehr / bessere Merkmale:</span> zusätzliche
            Rohdaten (Realzinsen, Risk-Regime, Intermarket-Korrelationen, Volatilität). Je mehr echte
            Information, desto mehr kann das Modell finden.
          </li>
          <li>
            <span className="text-text font-medium">Regime-Konditionierung:</span> separate Modelle
            für Risk-On vs. Risk-Off — ein Faktor wirkt in Trendphasen oft anders als in Panik.
          </li>
          <li>
            <span className="text-text font-medium">Confidence-Schwelle anheben:</span> nur die
            stärksten Signale traden. Weniger Trades, höhere Trefferquote (das Labor zeigt: die Edge
            sitzt im oberen Konfidenz-Bereich).
          </li>
          <li>
            <span className="text-text font-medium">Kombi mit GVA/BOS:</span> das Modell als{" "}
            <span className="text-text">Filter</span> für deine echten Setups — nur Trades nehmen,
            die das ML-Modell mit hoher Confidence bestätigt. Das ist das eigentliche Ziel.
          </li>
          <li>
            <span className="text-text font-medium">Mehr Historie:</span> je länger der Zeitraum,
            desto robuster die gelernten Muster (aktuell bis ~2008).
          </li>
        </ul>
      </Panel>

      {/* Ehrlichkeit */}
      <Panel title="Ehrlich bleiben" subtitle="Kein Wundermittel">
        <div className="rounded border border-warn/30 bg-warn/5 p-3 text-[12.5px] text-muted leading-relaxed space-y-2">
          <p>
            Das Modell ist <span className="text-text">kein Garant</span>. Wenn in den Daten keine
            Vorhersagbarkeit steckt, wird auch LightGBM keine finden — und der ehrliche Walk-Forward-
            Report zeigt das dann als ~50 % OOS. Das ist gewollt: lieber die Wahrheit sehen als eine
            eingebildete Edge, die im Live-Trading Geld kostet.
          </p>
          <p>
            Alle Kennzahlen im Report sind <span className="text-text">out-of-sample</span> — das
            Modell hat diese Wochen beim Training nie gesehen. Kein In-Sample-Wert wird als Erfolg
            verkauft. Ohne Spread/Kosten gerechnet.
          </p>
        </div>
      </Panel>

    </div>
  );
}
