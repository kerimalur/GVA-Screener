import Panel from "@/components/layout/Panel";

export const dynamic = "force-static";

/**
 * Leitfaden des Labors.
 *
 * Der alte Leitfaden beschrieb den Handels-Workflow: GVA-Linie als Signal,
 * Cockpit als Startseite, Lebenszyklus, Trade-Budget. Das liegt seit dem
 * 13.08.2026 in KerimOS (siehe ../../TRADING-UMBAU.md). Hier steht deshalb,
 * was das Labor beantwortet — und, mindestens ebenso wichtig, welche Fragen es
 * ausdrücklich NICHT beantwortet.
 *
 * Rein statischer Text, keine Live-Daten.
 */

function Frage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-surface2 p-3 text-[12.5px] leading-relaxed">
      <div className="text-[9px] uppercase tracking-widest text-accent mb-1.5">
        Welche Frage beantwortet das
      </div>
      {children}
    </div>
  );
}

function Falle({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-down/30 bg-down/5 p-3 text-[12.5px] leading-relaxed">
      <div className="text-[9px] uppercase tracking-widest text-down mb-1.5">
        Wo man sich täuscht
      </div>
      {children}
    </div>
  );
}

function Begriff({ v, children }: { v: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="font-mono font-bold text-text shrink-0 w-40">{v}</span>
      <span className="text-muted">{children}</span>
    </li>
  );
}

export default function LeitfadenSeite() {
  return (
    <div className="space-y-5 max-w-[1100px] mx-auto">
      <Panel
        title="Wozu dieses Labor da ist"
        subtitle="Und wozu ausdrücklich nicht"
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-muted">
          <p>
            Dieses Labor misst, ob eine Idee trägt. Es sagt <em>nicht</em>, was
            heute zu tun ist. Entschieden, journaliert und gehandelt wird in
            KerimOS unter <span className="font-mono text-accent">/trading</span>;
            hier gibt es kein Cockpit, keine Signal-Inbox und keinen Backtest.
          </p>
          <p>
            Die Trennung ist der Punkt. Entscheiden und Forschen haben
            verschiedene Rhythmen: Wer morgens einen Trade sucht, braucht in
            zehn Sekunden eine Richtung. Wer prüft, ob ein Faktor wirkt,
            braucht Konfidenzintervalle und Geduld. Beides auf einer Oberfläche
            führt dazu, dass das Schnelle das Langsame verdrängt — man klickt
            auf das blinkende Ding und schaut die Statistik nie an.
          </p>
          <Frage>
            <strong className="text-text">Trägt das, was ich glaube?</strong> Wenn
            die Antwort „weiss man nicht" lautet, ist das ein Ergebnis und kein
            Mangel — es spart den nächsten Schritt.
          </Frage>
        </div>
      </Panel>

      <Panel title="Modelle" subtitle="Taugt das Modell etwas?">
        <div className="space-y-3 text-[13px] leading-relaxed text-muted">
          <p>
            Die ML-Engine sucht nächtlich nach Konfigurationen, die die
            Wochen-Richtung einer Währung besser treffen als der Zufall. Das
            Ergebnis dieser Suche ist <strong className="text-text">kein
            Messwert</strong>, sondern ein Maximum aus vielen tausend Ziehungen.
            Bei genug Versuchen findet man immer etwas, das nach Edge aussieht.
          </p>
          <p>
            Deshalb gibt es die <strong className="text-text">Holdout-Validierung</strong>:
            ein zurückgehaltener Zeitraum, den die Suche nie gesehen hat, plus
            eine Baseline zum Vergleich. Der <span className="font-mono">selection_gap</span>{" "}
            (Suche minus Holdout) beziffert genau, wie stark die Suchmetrik
            geschönt war.
          </p>
          <ul className="space-y-1.5">
            <Begriff v="Engine-Log">
              Was die Suche in der Nacht gefunden hat, samt Baseline und
              Stagnations-Meldung
            </Begriff>
            <Begriff v="Holdout">
              Die ehrliche Zahl. Ein Blick kostet einen Versuch — deshalb der
              Zähler und die Rückfrage ab Lauf 2
            </Begriff>
            <Begriff v="Modell-Ranking">
              Wochenausgabe der Engine je Währung. Das Quintil (Q1–Q5) sagt, wo
              der Score in seiner eigenen 156-Wochen-Verteilung steht
            </Begriff>
            <Begriff v="Datenlage">
              Reicht das Material überhaupt? Lücken hier erklären fast jede
              seltsame Zahl weiter unten
            </Begriff>
          </ul>
          <Falle>
            <strong className="text-text">Das Quintil ist kein Konfidenzmass.</strong>{" "}
            Q5 heisst „stark im Vergleich zur eigenen Geschichte", nicht „das
            Modell ist sich sicher". Und: schliesst das Konfidenzintervall der
            Differenz zur Baseline die Null ein, gibt es <em>keinen Nachweis</em> —
            auch wenn die Zahl positiv aussieht.
          </Falle>
        </div>
      </Panel>

      <Panel title="Faktoren" subtitle="Welcher einzelne Faktor trägt?">
        <div className="space-y-3 text-[13px] leading-relaxed text-muted">
          <p>
            Ein Modell, das aus zwanzig Faktoren einen Score baut, sagt nicht,
            welcher davon die Arbeit macht. Diese Ansichten nehmen je einen
            Faktor auseinander und halten ihn gegen den Markt.
          </p>
          <ul className="space-y-1.5">
            <Begriff v="Factor-Lab">
              Trefferquote je Einzelfaktor über die Historie
            </Begriff>
            <Begriff v="Fundamental-Track">
              Q-Score gegen die tatsächliche 1W-/4W-Bewegung, bis zu zehn Jahre
              zurück. Die Antwort auf: „Bei diesem Fundamental-Bild ist EURUSD
              in X % gestiegen"
            </Begriff>
            <Begriff v="Setup-Finder">
              Ranking und Outlook-Konfluenz über alle 28 Paare gleichzeitig
            </Begriff>
            <Begriff v="Saisonalität">
              Kalender-Effekte — der Faktor mit der grössten Verwechslungsgefahr
            </Begriff>
          </ul>
          <Falle>
            Je mehr Faktoren man einzeln prüft, desto sicherer findet man
            zufällig einen guten. Wer zwanzig Faktoren testet, hat bei 5 %
            Irrtumswahrscheinlichkeit im Schnitt einen Treffer, der keiner ist.
            Ein Fund im Factor-Lab ist eine <em>Hypothese</em> — geprüft ist sie
            erst im Holdout.
          </Falle>
        </div>
      </Panel>

      <Panel title="Märkte" subtitle="Wie ist die Lage überhaupt?">
        <div className="space-y-3 text-[13px] leading-relaxed text-muted">
          <p>
            Die Rohdaten hinter den Faktoren, unaggregiert. Nützlich, wenn eine
            Modellzahl überrascht und man wissen will, woher sie kommt.
          </p>
          <ul className="space-y-1.5">
            <Begriff v="Macro Terminal">
              Zinsen, Inflation, Arbeitsmarkt je G8-Währung
            </Begriff>
            <Begriff v="Real Yield">
              Nominalzins minus Inflation — der Bewertungs-Bias einer Währung
            </Begriff>
            <Begriff v="COT">
              Wie die grossen Adressen positioniert sind, wöchentlich von der CFTC
            </Begriff>
            <Begriff v="Weekly">
              Wochenlage je Paar, zusammengezogen
            </Begriff>
            <Begriff v="Termine">
              Wirtschaftskalender. Ein Modellfehler an einem NFP-Freitag ist
              keiner
            </Begriff>
          </ul>
        </div>
      </Panel>

      <Panel title="Was hier nicht mehr steht" subtitle="Und wo es jetzt liegt">
        <div className="space-y-3 text-[13px] leading-relaxed text-muted">
          <ul className="space-y-1.5">
            <Begriff v="Cockpit">KerimOS · /trading/cockpit</Begriff>
            <Begriff v="Trade-Journal">KerimOS · /trading/journal</Begriff>
            <Begriff v="Equity, Outlook">KerimOS · /trading/journal/…</Begriff>
            <Begriff v="Backtest">KerimOS · /trading/backtest</Begriff>
            <Begriff v="Radar, Heatmap">KerimOS · /trading/radar, /trading/heatmap</Begriff>
            <Begriff v="Replay">
              entfernt — die Hit-Erkennung läuft weiter im Backend, die manuelle
              Bewertung nicht mehr
            </Begriff>
          </ul>
          <p>
            Das Backend bleibt vollständig: GVA-Erkennung, Telegram-Alerts,
            Makro-Pipeline und die ML-Engine laufen unverändert. Es hat nur
            einen Konsumenten weniger und einen mehr.
          </p>
        </div>
      </Panel>

      <Panel title="Reihenfolge" subtitle="Was zuerst, was erst danach">
        <div className="space-y-3 text-[13px] leading-relaxed text-muted">
          <ol className="space-y-2 list-decimal list-inside">
            <li>
              <strong className="text-text">Datenlage prüfen.</strong> Ohne
              sauberes Material ist jede Auswertung darunter Rauschen.
            </li>
            <li>
              <strong className="text-text">Hypothese im Factor-Lab suchen.</strong>{" "}
              Hier darf man stöbern — es kostet nichts.
            </li>
            <li>
              <strong className="text-text">Im Holdout prüfen.</strong> Einmal.
              Nicht so lange, bis das Ergebnis passt.
            </li>
            <li>
              <strong className="text-text">Urteil festhalten.</strong> Trägt es
              nicht, ist es erledigt — das ist der eigentliche Gewinn: man
              verbrennt keine Zeit mehr daran.
            </li>
            <li>
              <strong className="text-text">Trägt es, in eine Regel übersetzen</strong>{" "}
              und gegen Spread und Kosten rechnen. Dann erst nach KerimOS.
            </li>
          </ol>
        </div>
      </Panel>
    </div>
  );
}
