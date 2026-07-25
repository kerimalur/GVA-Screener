import Panel from "@/components/layout/Panel";
import { VERDICT_LABEL, type HoldoutRow, type HoldoutVerdict } from "@/lib/ml/holdoutFormat";
import type { HoldoutData } from "@/lib/ml/holdout";

/**
 * „Holdout-Validierung" — was die Suchzahl wert ist, wenn man sie einmal gegen
 * die 104 zurückgehaltenen Wochen hält.
 *
 * Darstellungs-Regel: eine Zeile darf nur dann positiv aussehen, wenn das
 * Konfidenzintervall der Differenz zur Baseline die Null ausschliesst. Sonst
 * bleibt sie neutral — «nahe an der Baseline» ist kein Erfolg.
 */

const num = (v: number | null, digits = 3) =>
  v === null || Number.isNaN(v) ? "–" : v.toFixed(digits);

function VerdictBadge({ v }: { v: HoldoutVerdict }) {
  const tone =
    v === "besser"
      ? "bg-up/15 text-up"
      : v === "schlechter"
        ? "bg-down/15 text-down"
        : "bg-border/40 text-muted";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${tone}`}>
      {VERDICT_LABEL[v]}
    </span>
  );
}

function Row({ r }: { r: HoldoutRow }) {
  const neutral = r.verdict === "kein-nachweis" || r.verdict === "offen";
  return (
    <tr className="border-t border-border/40 align-top">
      <td className="py-2 pr-3 font-mono text-xs">
        {r.family}
        {r.isBaseline && <span className="text-muted"> · Referenz</span>}
      </td>
      <td className="pr-3 font-mono text-xs whitespace-nowrap">
        <span className={neutral ? "" : "font-bold"}>{num(r.hitrate)}</span>
        <span className="text-muted">
          {" "}
          [{num(r.ciLow)} – {num(r.ciHigh)}]
        </span>
      </td>
      <td className="pr-3 font-mono text-xs text-muted">{r.n ?? "–"}</td>
      <td className="pr-3 font-mono text-xs text-muted">{num(r.searchHitrate)}</td>
      <td className="pr-3 font-mono text-xs">
        {r.selectionGap === null ? (
          <span className="text-muted">–</span>
        ) : (
          <span
            className={r.selectionGap > 0.01 ? "text-down" : "text-muted"}
            title="Suchwert minus Holdout-Wert — der quantifizierte Selection Bias"
          >
            {r.selectionGap > 0 ? "+" : ""}
            {num(r.selectionGap)}
          </span>
        )}
      </td>
      <td className="pr-3 font-mono text-xs whitespace-nowrap">
        {r.delta === null ? (
          <span className="text-muted">–</span>
        ) : (
          <>
            {r.delta > 0 ? "+" : ""}
            {num(r.delta)}
            <span className="text-muted">
              {" "}
              [{num(r.deltaCiLow)} – {num(r.deltaCiHigh)}]
            </span>
          </>
        )}
      </td>
      <td className="pr-3">
        <VerdictBadge v={r.verdict} />
      </td>
      <td className="font-mono text-xs text-muted">#{r.runIndex}</td>
    </tr>
  );
}

function Explainer({ runs }: { runs: number }) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-xs font-bold text-muted hover:text-fg py-1">
        Warum es diese Tabelle braucht — und warum die Suchzahl allein nichts sagt
      </summary>
      <div className="text-xs text-muted leading-relaxed space-y-2 pl-4 pt-1">
        <p>
          <span className="font-bold text-fg">Die Suchzahl ist ein Maximum.</span> Die nächtliche
          Suche hat über 22.000 Modell-Varianten durchprobiert und meldet die beste. Wenn man so
          oft würfelt, findet man immer eine Variante, die gut aussieht — auch dann, wenn gar kein
          Zusammenhang existiert. Die Suchzahl ist deshalb systematisch zu hoch. Sie ist kein
          Messwert, sondern ein Rekord.
        </p>
        <p>
          <span className="font-bold text-fg">Der Gap zeigt, wie viel zu hoch.</span> Gap =
          Suchwert − Holdout-Wert. Die 104 zurückgehaltenen Wochen hat die Suche nie gesehen; auf
          ihnen kann sie nichts geschönt haben. Ein grosser Gap ist zu erwarten und kein Fehler —
          er beziffert schlicht, wie stark die Suche sich selbst belogen hat. Genau das ist die
          nützlichste Zahl für alle künftigen Suchläufe.
        </p>
        <p>
          <span className="font-bold text-fg">Ohne Baseline ist jede Trefferquote sinnlos.</span>{" "}
          Die Baseline ist das Vorzeichen des Zins+Saison-Scores — ganz ohne Modell, ohne Training.
          Die Spalte «Δ Baseline» zeigt, wie viel das trainierte Modell darüber hinaus bringt, samt
          Unsicherheitsbereich der Differenz.{" "}
          <span className="font-bold text-fg">
            Schliesst dieser Bereich die Null ein, gibt es keinen nachweisbaren Vorteil
          </span>{" "}
          — dann ist der Unterschied mit den vorhandenen Daten nicht von Zufall zu unterscheiden,
          egal wie die Zahl davor aussieht.
        </p>
        <p>
          <span className="font-bold text-fg">n und der Unsicherheitsbereich gehören dazu.</span>{" "}
          Der Bereich in eckigen Klammern ist ein 95-%-Intervall, geschätzt über die Testblöcke
          (Cluster-Bootstrap). Bewusst nicht über die Einzelprognosen: acht Währungen derselben
          Woche und überlappende 4-Wochen-Fenster sind stark korreliert — ein Intervall über die
          Einzelprognosen wäre viel zu eng und würde Sicherheit vortäuschen.
        </p>
        <p>
          <span className="font-bold text-fg">Jeder weitere Lauf kostet Aussagekraft.</span> Der
          Holdout wirkt nur, solange man ihn selten befragt. Wer zwanzig Configs nacheinander
          dagegen laufen lässt und die beste nimmt, hat den Selection Bias bloss verlagert. Bisher
          wurde er <span className="font-mono text-fg">{runs}×</span> befragt; der Runner warnt ab
          dem zweiten Mal und verlangt eine ausdrückliche Bestätigung.
        </p>
      </div>
    </details>
  );
}

export default function HoldoutSection({ data }: { data: HoldoutData }) {
  const { rows, runs } = data;
  const zeitraum = rows.find((r) => r.holdoutStart && r.holdoutEnd);

  return (
    <Panel
      title="Holdout-Validierung — die zurückgehaltenen 104 Wochen"
      subtitle={
        rows.length === 0
          ? "Noch nicht befragt. Ausführen: python -m ml_engine.run_holdout"
          : `${runs} Lauf${runs === 1 ? "" : "e"} · Zeitraum ${zeitraum?.holdoutStart ?? "?"} bis ${
              zeitraum?.holdoutEnd ?? "?"
            } · Suchwert = Rekord aus über 22.000 Versuchen, Holdout-Wert = einmal gemessen`
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          Es liegen noch keine Holdout-Ergebnisse vor. Bis dahin ist der nächtliche Bestwert nur
          ein Maximum über zehntausende Versuche und nicht als Trefferquote interpretierbar.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs">
                  <th className="py-1 pr-3">Config</th>
                  <th className="pr-3">Holdout-Trefferquote (95-%-KI)</th>
                  <th className="pr-3">n</th>
                  <th className="pr-3">Suche</th>
                  <th className="pr-3">Gap</th>
                  <th className="pr-3">Δ Baseline (KI)</th>
                  <th className="pr-3">Urteil</th>
                  <th>Lauf</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Row key={`${r.runIndex}-${r.family}-${i}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>
          <Explainer runs={runs} />
        </>
      )}
    </Panel>
  );
}
