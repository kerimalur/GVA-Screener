import { Panel, Kennzahl, Chip, cx } from "@/components/ui";
import TrainingPanel from "@/components/ml/TrainingPanel";

export const dynamic = "force-static";
export const metadata = { title: "Training — GVA Labor" };

/**
 * Training — woraus das Modell besteht.
 *
 * Die Seite hiess vorher „ML-Modell (LightGBM)" und zeigte ein Panel mit
 * Knöpfen. Wer nicht ohnehin wusste, was dort passiert, konnte es hier nicht
 * lernen — und damit war die Seite für den einzigen Nutzer nutzlos, der sie
 * hat.
 *
 * Jetzt beantwortet sie fünf Fragen in der Reihenfolge, in der sie sich
 * stellen: Was wird vorhergesagt? Woraus? Wie wird geprüft? Wo ist die
 * Grenze? Was tun die Knöpfe?
 *
 * Statischer Erklärtext — die Live-Daten liegen in Engine und Ranking.
 */

const GRUPPEN = [
  {
    key: "rates",
    label: "Zinsen",
    felder: ["rate_level", "rate_diff_avg", "rate_mom_6m"],
    was: "Leitzinsniveau, Abstand zum Schnitt der anderen sieben Währungen, Bewegung über sechs Monate.",
    warum: "Kapital fliesst dorthin, wo es mehr Zins gibt — der bekannteste Zusammenhang im FX-Markt und deshalb auch der am stärksten eingepreiste.",
  },
  {
    key: "cot_core",
    label: "COT (Standard)",
    felder: ["noncomm_net", "comm_net", "retail_net", "cot_divergence", "comm_z", "open_interest", "…"],
    was: "Netto-Positionierung der drei Gruppen aus dem CFTC-Bericht, ihre Wochenveränderung und wie extrem sie im historischen Vergleich steht.",
    warum: "Die Commercials sichern ab und liegen an Wendepunkten oft richtig; die Non-Commercials folgen dem Trend. Die Differenz zwischen beiden ist der eigentliche Informationsgehalt.",
  },
  {
    key: "cot_tff",
    label: "COT (TFF)",
    felder: ["dealer_net", "asset_net", "lev_net", "+ Wochenänderungen"],
    was: "Feinere Aufteilung desselben Berichts: Händler, Vermögensverwalter, gehebelte Fonds.",
    warum: "Leveraged Funds bewegen sich schneller als Asset Manager. Wer beide getrennt sieht, erkennt, ob eine Bewegung getragen ist oder nur schnelles Geld.",
  },
  {
    key: "season",
    label: "Saison",
    felder: ["season_mean_ret", "season_hit_years", "season_active"],
    was: "Durchschnittliche Rendite dieses Kalendermonats, in wie vielen Jahren sie stimmte, ob der Monat als aktiv gilt.",
    warum: "Repatriierungen, Quartalsenden und Steuerstichtage wiederholen sich. Der schwächste Faktor der vier — und der, bei dem Zufall am ehesten wie Muster aussieht.",
  },
  {
    key: "scores",
    label: "Scores",
    felder: ["cot_score", "rates_score", "season_score"],
    was: "Die drei Faktoren bereits zu je einer Zahl von −1 bis +1 verdichtet.",
    warum: "Verdichtung wirft Information weg und macht das Modell dafür stabiler. Ob das ein guter Tausch ist, entscheidet die Suche — deshalb sind Roh- und Score-Variante beide im Rennen.",
  },
];

function Schritt({ nr, titel, children }: { nr: number; titel: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-line bg-accent-dim">
        <span className="num text-[11px] font-semibold text-accent-soft">{nr}</span>
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="text-[13px] font-medium text-text">{titel}</div>
        <div className="mt-1 space-y-2 text-[12.5px] leading-relaxed text-muted">{children}</div>
      </div>
    </div>
  );
}

export default function TrainingSeite() {
  return (
    <div className="anim-fade mx-auto max-w-[1200px] space-y-4 py-1">
      <Panel lit>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kennzahl label="Vorhergesagt wird" wert="Richtung" gross
            sub="steigt oder fällt eine Währung gegen den Korb" />
          <Kennzahl label="Horizont" wert="1 – 4 Wochen" gross
            sub="Suche wählt, welcher am besten trägt" />
          <Kennzahl label="Kandidaten" wert="8 Währungen" gross
            sub="USD EUR GBP JPY CHF AUD CAD NZD" />
          <Kennzahl label="Bewertung" wert="Walk-Forward" gross
            sub="nur mit Wissen der Vergangenheit" />
        </div>
      </Panel>

      <Panel title="Was das Modell überhaupt tut" hint="In fünf Schritten, von der Frage bis zur Zahl.">
        <Schritt nr={1} titel="Die Frage stellen">
          <p>
            Nicht „wie weit steigt EUR/USD", sondern nur: <strong className="text-text">Ist
            der Euro in vier Wochen stärker oder schwächer als der Durchschnitt der
            anderen sieben Währungen?</strong> Eine Ja/Nein-Frage je Währung und Woche.
          </p>
          <p>
            Der Korb-Bezug ist der Trick dabei. Wenn der Dollar weltweit anzieht,
            fallen alle Paare gegen ihn — das sagt über den Euro nichts. Erst der
            Vergleich mit dem Korb trennt „Euro ist stark" von „alle anderen sind
            schwach". Deshalb wird der Korb vorher herausgerechnet.
          </p>
        </Schritt>

        <Schritt nr={2} titel="Die Zutaten sammeln">
          <p>
            Je Währung und Woche ein Datensatz aus fünf Gruppen (Tabelle unten). Die
            Suche entscheidet, welche Teilmenge davon ein Modell bekommt — nicht alle
            gleichzeitig, sondern <em>Kombinationen</em>: Mehr Merkmale heisst nicht
            besser, sondern erst einmal nur mehr Gelegenheit, Rauschen zu lernen.
          </p>
          <p>
            Dazu kommt für jede Währung ein Erkennungsmerkmal (<span className="num">ccy_EUR</span> und so
            fort), damit das Modell weiss, über wen es gerade urteilt.
          </p>
        </Schritt>

        <Schritt nr={3} titel="Zwei Modelltypen gegeneinander">
          <p>
            <strong className="text-text">Logistische Regression</strong> — eine
            gewichtete Summe. Einfach, nachvollziehbar, und bei gegebener Einstellung
            immer dasselbe Ergebnis. Sie kann nur „mehr davon heisst wahrscheinlicher".
          </p>
          <p>
            <strong className="text-text">LightGBM</strong> — viele kleine
            Entscheidungsbäume nacheinander, jeder korrigiert die Fehler der
            vorherigen. Findet Wechselwirkungen („hoher Zins hilft nur, wenn COT
            mitzieht"), überanpasst dafür leichter und liefert bei jedem Lauf leicht
            andere Zahlen.
          </p>
          <p className="text-faint">
            Genau diese Zufälligkeit fehlte der Suche monatelang: Der Kern bestand nur
            aus logreg, und ein deterministisches Modell findet in derselben Nacht
            zwangsläufig dasselbe. Seit dem 14.08.2026 sind beide im Kern.
          </p>
        </Schritt>

        <Schritt nr={4} titel="Ehrlich prüfen">
          <p>
            <strong className="text-text">Walk-Forward:</strong> Trainiere auf allem
            bis Woche N, sage Woche N+1 voraus, rücke eine Woche weiter. Nie mit
            Wissen aus der Zukunft — sonst sagt man vorher, was man schon kennt.
          </p>
          <p>
            <strong className="text-text">Purging:</strong> Zwischen Trainings- und
            Testfenster bleibt eine Lücke von der Länge des Horizonts. Ohne sie würde
            eine Vier-Wochen-Prognose aus Woche N teilweise auf Kursen beruhen, die
            im Testfenster liegen — ein Leck, das die Zahl schönt, ohne dass man es
            sieht.
          </p>
          <p>
            <strong className="text-text">Holdout:</strong> Die letzten 104 Wochen
            sieht die Suche nie. Sie sind der einzige ehrliche Test — und jeder Blick
            darauf wird gezählt.
          </p>
        </Schritt>

        <Schritt nr={5} titel="Woche für Woche anwenden">
          <p>
            Samstags nach dem COT-Release sagen Champion und Baseline die kommende
            Woche voraus. Beide Ergebnisse werden geschrieben, nichts überschrieben.
            Sobald der Horizont abgelaufen ist, trägt derselbe Job ein, ob die
            Richtung stimmte.
          </p>
          <p>
            Daraus entsteht der <strong className="text-text">Paper-Track</strong>:
            eine Trefferquote, bei der nichts nachträglich angepasst werden kann.
            Sie steht auf der Ranking-Seite ganz oben.
          </p>
        </Schritt>
      </Panel>

      <Panel
        title="Die fünf Zutatengruppen"
        hint="Die Suche wählt Teilmengen davon — nicht alles auf einmal."
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="lbl px-3 py-2 text-left">Gruppe</th>
                <th className="lbl px-3 py-2 text-left">Merkmale</th>
                <th className="lbl px-3 py-2 text-left">Was drinsteckt</th>
                <th className="lbl px-3 py-2 text-left">Warum das etwas sagen könnte</th>
              </tr>
            </thead>
            <tbody>
              {GRUPPEN.map((g) => (
                <tr key={g.key} className="border-b border-line/60 align-top last:border-b-0 hover:bg-surface2">
                  <td className="px-3 py-2.5">
                    <div className="num font-medium text-text">{g.label}</div>
                    <div className="num text-[10.5px] text-faint">{g.key}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {g.felder.map((f) => (
                        <Chip key={f} mono>{f}</Chip>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-[280px] px-3 py-2.5 text-muted">{g.was}</td>
                  <td className="max-w-[320px] px-3 py-2.5 text-muted">{g.warum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Champion und Baseline" hint="Warum es immer zwei sind.">
          <div className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
            <p>
              Der <strong className="text-text">Champion</strong> ist die Konfiguration,
              die die nächtliche Suche zuletzt befördert hat. Er wechselt nur mit
              Abstand über mehrere Nächte — sonst würde jede Zufallsschwankung ein
              neues Modell krönen.
            </p>
            <p>
              Die <strong className="text-text">Baseline</strong> ist eine bewusst
              dumme Regel: Zins plus Saison, keine Suche, keine Anpassung. Sie läuft
              jede Woche mit.
            </p>
            <p>
              Der Sinn: <strong className="text-text">Ein Modell, das die Baseline
              nicht schlägt, hat keinen Wert</strong> — egal wie gut seine absolute
              Trefferquote aussieht. 56 Prozent klingen ordentlich; wenn die dumme
              Regel 57 trifft, ist die ganze Maschinerie ein teurer Umweg.
            </p>
          </div>
        </Panel>

        <Panel title="Wo die Grenze liegt" hint="Was dieses Modell nicht kann.">
          <div className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
            <p>
              Es sagt <strong className="text-text">Richtung</strong> voraus, nicht
              Ausmass und nicht Zeitpunkt. Für einen Einstieg reicht das nicht — dafür
              gibt es die GVA-Linie in KerimOS. Das Ranking sagt nur, ob der Wind von
              vorne oder von hinten kommt.
            </p>
            <p>
              Es kennt <strong className="text-text">keine Nachrichten</strong>. Eine
              überraschende Zinsentscheidung steht in keinem Merkmal, und die Woche
              danach sieht für das Modell aus wie jede andere.
            </p>
            <p>
              Es beruht auf <strong className="text-text">wöchentlichen COT-Daten mit
              drei Tagen Verzug</strong>. Was zwischen Dienstag und Freitag passiert,
              erfährt es erst danach.
            </p>
            <p className="text-faint">
              Und der wichtigste Vorbehalt: Ein Ergebnis aus tausenden Experimenten
              ist ein Maximum, kein Messwert. Nur die Holdout-Zahl zählt.
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="Selbst rechnen lassen"
        hint="Trainiert gegen das Render-Backend. Beim Kaltstart kann der erste Aufruf lange dauern."
      >
        <TrainingPanel />
      </Panel>
    </div>
  );
}
