import Panel from "@/components/layout/Panel";

export const dynamic = "force-static";

/**
 * Analyse-Leitfaden: erklärt, was die Zahlen jeder Datenquelle bedeuten,
 * wie man sie liest und was daraus fürs Trading folgt. Rein statischer
 * Referenz-Text — keine Live-Daten.
 */

function Read({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-surface2 p-3 text-[12.5px] leading-relaxed">
      <div className="text-[9px] uppercase tracking-widest text-accent mb-1.5">So liest du das</div>
      {children}
    </div>
  );
}

function Act({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-up/30 bg-up/5 p-3 text-[12.5px] leading-relaxed">
      <div className="text-[9px] uppercase tracking-widest text-up mb-1.5">So handelst du danach</div>
      {children}
    </div>
  );
}

function Threshold({ v, children }: { v: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="font-mono font-bold text-text shrink-0 w-28">{v}</span>
      <span className="text-muted">{children}</span>
    </li>
  );
}

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1000px] mx-auto">

      {/* Übersicht: was fließt in Signale, was ist nur Anzeige */}
      <Panel
        title="Wie das Tool entscheidet"
        subtitle="Welche Daten Signale erzeugen — und welche nur Kontext sind"
      >
        <div className="space-y-4 text-[13px] leading-relaxed">
          <p className="text-muted">
            Zwei getrennte Modelle rechnen aus denselben Rohdaten eine Richtung. Beide brauchen{" "}
            <span className="text-text font-medium">≥ 2 gleichgerichtete Faktoren und eine Mehrheit</span>,
            sonst „NEUTRAL“ (kein Signal).
          </p>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded border border-border bg-surface2 p-3">
              <div className="text-text font-bold text-[13px] mb-1">Pair-Screener / Weekly Outlook</div>
              <div className="text-[11px] text-faint mb-2">5 Faktoren je Pair → LONG/SHORT/NEUTRAL</div>
              <ul className="text-[12px] text-muted space-y-0.5 font-mono">
                <li>1. Zinsdifferenz (Niveau + Drehung)</li>
                <li>2. COT-Flow (Δ % Open Interest)</li>
                <li>3. Saisonalität (aktueller Monat)</li>
                <li>4. 10Y-Yield-Spread (3M-Trend)</li>
                <li>5. Retail-Sentiment (konträr)</li>
              </ul>
            </div>
            <div className="rounded border border-border bg-surface2 p-3">
              <div className="text-text font-bold text-[13px] mb-1">Währungs-Bias / Cockpit</div>
              <div className="text-[11px] text-faint mb-2">4 Faktoren je Währung → LONG/SHORT/NEUTRAL</div>
              <ul className="text-[12px] text-muted space-y-0.5 font-mono">
                <li>1. COT-Flow 4W (Δ % OI)</li>
                <li>2. Leitzins-Trend (6M)</li>
                <li>3. CB-Stance (manueller Score)</li>
                <li>4. Stärke 1M (Momentum)</li>
              </ul>
            </div>
          </div>

          <div className="rounded border border-border bg-surface p-3">
            <div className="text-[9px] uppercase tracking-widest text-faint mb-2">Nur Anzeige — fließt in KEIN Signal</div>
            <ul className="text-[12px] text-muted space-y-1">
              <li>
                <span className="text-text font-medium">Intermarket</span> (Korrelationsmatrix, DXY, Overlays) —
                reiner Kontext, kein Faktor.
              </li>
              <li>
                <span className="text-text font-medium">Kalender / News</span> — erzeugt Warn-Flags („⚡ IN PLAY“,
                News-Badges), verändert aber die berechnete Richtung nicht.
              </li>
              <li>
                <span className="text-text font-medium">Makro-Detailpanels</span> (CPI, Arbeitslosigkeit, PMI/CLI) —
                nur die Leitzins- und 10Y-Serien gehen in Faktoren ein, der Rest ist Hintergrund.
              </li>
              <li>
                <span className="text-text font-medium">Cockpit-Zusätze</span> (Retail-Aggregat, Saison-Pairs,
                News) — Anzeige; die Bias-Richtung bleibt das 4-Faktoren-Modell.
              </li>
            </ul>
          </div>
        </div>
      </Panel>

      {/* COT */}
      <Panel title="COT — Commitment of Traders" subtitle="Positionierung der großen Terminmarkt-Akteure">
        <div className="space-y-3 text-[13px]">
          <p className="text-muted">
            Drei Kennzahlen je Währung. <span className="text-text">Flow</span> (Veränderung) ist das primäre
            Signal, <span className="text-text">Perzentil</span> (Niveau) nur Kontext/Extremwarnung.
          </p>
          <ul className="space-y-1.5">
            <Threshold v="Netto">
              Long-Kontrakte minus Short-Kontrakte der Non-Commercials (bzw. Leveraged Funds im TFF-Report).
              Positiv = netto long. Absolutwert allein sagt wenig — erst im Verlauf/Perzentil.
            </Threshold>
            <Threshold v="Perzentil 0–100">
              Wo steht das aktuelle Netto im 5-Jahres-Fenster? <span className="text-text">90.+</span> = so long wie
              selten (Konträr-Risiko, überfüllt). <span className="text-text">10.−</span> = Extrem-Short.
              40–60 = neutral.
            </Threshold>
            <Threshold v="4W-Flow % OI">
              Netto-Änderung über 4 Wochen, in % des Open Interest (vergleichbar über Währungen).{" "}
              <span className="text-up">≥ +2 %</span> = Kapital fließt zu (bullish),{" "}
              <span className="text-down">≤ −2 %</span> = fließt ab. Im Pair-Screener zählt die{" "}
              <span className="text-text">Differenz Base−Quote ≥ 4</span>.
            </Threshold>
            <Threshold v="Streak">
              Wochen in Folge mit gleichem Flow-Vorzeichen. <span className="text-text">≥ 3</span> = anhaltende
              Akkumulation (bzw. Distribution) — starkes Zeichen für echtes Smart-Money-Interesse.
            </Threshold>
          </ul>
          <Read>
            Beispiel EUR im 92. Perzentil, Flow −1,5 % über 4W: Positionierung historisch extrem long, aber das
            Geld beginnt abzufließen → Vorsicht bei EUR-Longs, mögliche Wende. Ein <span className="text-up">hoher
            Perzentil + noch positiver Flow</span> ist dagegen ein intakter Trend (nur eng traillen).
          </Read>
          <Act>
            Flow gibt die Richtung, Perzentil die Warnung. Handle mit dem Flow, aber reduziere Größe/ziehe Stops
            enger, wenn das Niveau bei ≥ 90 oder ≤ 10 steht. Streak ≥ 3 in Signalrichtung = Extra-Konfidenz.
          </Act>
        </div>
      </Panel>

      {/* Makro & Zinsen */}
      <Panel title="Makro & Zinsen" subtitle="Leitzins-Differenz + Anleiherenditen">
        <div className="space-y-3 text-[13px]">
          <ul className="space-y-1.5">
            <Threshold v="Zinsdifferenz">
              Leitzins Base − Quote. <span className="text-up">&gt; +0,25 pp</span> stützt die Base-Währung
              (Carry). Wichtiger als das Niveau ist die <span className="text-text">Drehung</span>: dreht die
              Differenz um <span className="text-text">&gt; 0,2 pp in 6M</span> zugunsten einer Seite, zählt das
              als Signal.
            </Threshold>
            <Threshold v="Leitzins-Trend">
              Je Währung: Änderung des Leitzinses über 6M. <span className="text-up">≥ +25 bps</span> = strafferer
              Kurs (bullish für die Währung), <span className="text-down">≤ −25 bps</span> = Lockerung.
            </Threshold>
            <Threshold v="10Y-Spread">
              Renditedifferenz 10-jähriger Anleihen Base−Quote, Trend über 3M.{" "}
              <span className="text-up">≥ +15 bps</span> steigend = Kapital sucht die Base-Währung. Reagiert
              schneller als der Leitzins (Markterwartung).
            </Threshold>
          </ul>
          <Read>
            Zinsen sind der langsamste, verlässlichste Treiber. Steigende Differenz + steigender 10Y-Spread in
            dieselbe Richtung = fundamentaler Rückenwind. Widersprechen sie sich, ist der Markt unentschieden.
          </Read>
          <Act>
            Nutze Zinsen als Trend-Filter: Ein GVA/BOS-Setup mit dem Zinsgefälle im Rücken hat bessere Odds.
            Gegen ein klares, sich ausweitendes Zinsgefälle nur mit starkem technischem Grund handeln.
          </Act>
        </div>
      </Panel>

      {/* Retail */}
      <Panel title="Retail-Sentiment" subtitle="Positionierung der Kleinanleger (Myfxbook) — konträr gelesen">
        <div className="space-y-3 text-[13px]">
          <ul className="space-y-1.5">
            <Threshold v="Long-% je Pair">
              Anteil der Retail-Trader, die long sind. <span className="text-down">≥ 65 % long</span> = überfüllte
              Long-Seite → konträres <span className="text-down">Short-Signal</span>.{" "}
              <span className="text-up">≤ 35 % long</span> = konträres Long-Signal. 35–65 = kein Signal.
            </Threshold>
            <Threshold v="Δ pp / Woche">
              Veränderung ggü. Vorwoche. Steigt die überfüllte Seite weiter, verschärft sich das Konträr-Signal.
            </Threshold>
            <Threshold v="Cockpit-Aggregat">
              Im Währungs-Cockpit über die 7 Pairs einer Währung gemittelt (als Quote invertiert). Schwelle enger:{" "}
              <span className="text-down">≥ 60 %</span> / <span className="text-up">≤ 40 %</span>.
            </Threshold>
          </ul>
          <Read>
            Retail liegt in Trends meist falsch — sie kaufen Dips im Abwärtstrend. 80 % long bei EURUSD heißt: die
            Masse erwartet Anstieg, was den Boden für weiteren Fall legt. Es ist ein <span className="text-text">
            Timing-/Kontext-Faktor</span>, kein alleiniger Grund.
          </Read>
          <Act>
            Als Bestätigung nutzen: Short-Setup + überfüllte Retail-Long-Seite = Rückenwind. Niemals allein wegen
            Sentiment handeln — extreme Werte können lange extrem bleiben.
          </Act>
        </div>
      </Panel>

      {/* Saisonalität */}
      <Panel title="Saisonalität" subtitle="Historische Monats-Tendenz je Pair">
        <div className="space-y-3 text-[13px]">
          <ul className="space-y-1.5">
            <Threshold v="Ø Return">
              Durchschnittsrendite des aktuellen Monats über die Historie.{" "}
              <span className="text-up">≥ +0,3 %</span> bei <span className="text-up">≥ 60 % positiven Jahren</span>{" "}
              = saisonal long. <span className="text-down">≤ −0,3 % & ≤ 40 %</span> = short.
            </Threshold>
            <Threshold v="Jahre Basis">
              Nur ab <span className="text-text">≥ 8 Jahren</span> Datenbasis gewertet — sonst zu wenig
              Aussagekraft.
            </Threshold>
          </ul>
          <Read>
            Schwächster der Faktoren, reiner Tiebreaker. Aussagekräftig nur bei hoher Trefferquote über viele
            Jahre (z. B. „11 von 15 Jahren positiv“).
          </Read>
          <Act>
            Als kleines Zusatzgewicht behandeln. Bei Gleichstand der stärkeren Faktoren kann Saisonalität den
            Ausschlag geben — sie überstimmt Zinsen/COT aber nie.
          </Act>
        </div>
      </Panel>

      {/* Intermarket */}
      <Panel title="Intermarket" subtitle="Korrelationen, DXY, Overlays — reiner Kontext">
        <div className="space-y-3 text-[13px]">
          <p className="text-muted">
            Zeigt Zusammenhänge zwischen Märkten. <span className="text-text">Fließt in kein Signal</span> — dient
            der Einordnung, ob ein Trade isoliert steht oder vom Gesamtmarkt getragen wird.
          </p>
          <ul className="space-y-1.5">
            <Threshold v="Korrelation">
              +1 = gleichläufig, −1 = gegenläufig, 0 = kein Zusammenhang. Zwei hoch korrelierte Longs (z. B.
              EURUSD + GBPUSD) sind <span className="text-text">ein Risiko, nicht zwei</span>.
            </Threshold>
            <Threshold v="DXY">
              US-Dollar-Index. Steigt der DXY, stehen alle USD-Quote-Pairs (EURUSD, GBPUSD …) unter Druck —
              nützlich, um USD-Stärke gebündelt zu sehen.
            </Threshold>
          </ul>
          <Read>
            Relevanz fürs GVA/BOS-Trading: mittel. Vor allem als <span className="text-text">Risiko-Check</span> —
            nicht mehrere korrelierte Positionen gleichzeitig, und ein USD-Trade gegen einen starken DXY-Trend
            hat es schwerer.
          </Read>
          <Act>
            Vor dem Eröffnen prüfen: Bündele ich unbewusst dasselbe Risiko? Passt der Trade zum DXY? Kein
            eigenständiger Einstiegsgrund.
          </Act>
        </div>
      </Panel>

      {/* Kalender */}
      <Panel title="Kalender & News-Flags" subtitle="High-Impact-Events — Timing-Warnung, kein Richtungsfaktor">
        <div className="space-y-3 text-[13px]">
          <ul className="space-y-1.5">
            <Threshold v="⚡ IN PLAY">
              Eine Währung des Pairs hatte in den letzten 7 Tagen ein Drift-Event (CPI, NFP, Zinsentscheid) — der
              Markt „verdaut“ es noch, oft mit anhaltender Bewegung.
            </Threshold>
            <Threshold v="News-Badge">
              Anstehende High-Impact-Events der nächsten 7 Tage. ⚡ = Drift-Event (bewegt stark).
            </Threshold>
          </ul>
          <Read>
            Kein Richtungssignal, sondern <span className="text-text">Timing</span>. Vor einem High-Impact-Event
            ist die Spread-/Slippage-Gefahr hoch und technische Level halten schlechter.
          </Read>
          <Act>
            Nicht blind in ein Drift-Event hineinhandeln. Entweder davor mit engem Risiko oder die erste Reaktion
            abwarten. „IN PLAY“ nach dem Event kann einen sauberen Trend liefern.
          </Act>
        </div>
      </Panel>

    </div>
  );
}
