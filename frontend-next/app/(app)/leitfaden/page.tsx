import Panel from "@/components/layout/Panel";

export const dynamic = "force-static";

/**
 * Leitfaden — beschreibt ausschliesslich den heute genutzten Workflow und die
 * aktuell aktiven Begriffe: GVA-Linie als Signal, Cockpit als Handels-Startseite,
 * der eine Status-Lebenszyklus, das Währungs-Ranking als Konfluenz und das feste
 * Trade-Budget. Die früher hier erklärten Einzel-Faktor-Ansichten (COT
 * Intelligence, Retail, Saisonalität 2.0, Intermarket, Weekly Outlook,
 * Setup-Finder) sind in der App ausgeblendet und stehen deshalb bewusst nicht
 * mehr im Leitfaden. Rein statischer Referenz-Text, keine Live-Daten.
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
      <span className="font-mono font-bold text-text shrink-0 w-32">{v}</span>
      <span className="text-muted">{children}</span>
    </li>
  );
}

export default function Page() {
  return (
    <div className="space-y-5 max-w-[1000px] mx-auto">

      {/* 1 — Kern: Was getradet wird */}
      <Panel
        title="Was du tradest — GVA"
        subtitle="Die GVA-Linie ist das Signal. Alles Fundamentale ist Konfluenz, kein Gate."
      >
        <div className="space-y-4 text-[13px] leading-relaxed">
          <p className="text-muted">
            Der Scanner erkennt das <span className="text-text font-medium">GVA-Kerzenmuster</span> und
            bildet daraus <span className="text-text font-medium">Linien</span>: eine{" "}
            <span className="text-down">Short-Linie</span> (Widerstand, oben) und eine{" "}
            <span className="text-up">Long-Linie</span> (Unterstützung, unten). Berührt der Marktpreis
            eine Linie, ist das ein <span className="text-warn font-medium">HIT</span> — der einzige
            eigentliche Trade-Auslöser. Bei einem Live-Hit kommt ein Telegram-Alert und das Pair steht
            im Cockpit unter „Getroffen“.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded border border-up/30 bg-up/5 p-3">
              <div className="text-up font-bold text-[13px] mb-1">Signal = GVA</div>
              <ul className="text-[12px] text-muted space-y-0.5">
                <li>GVA-Muster → Linie (Short/Long)</li>
                <li>Preis berührt Linie → HIT</li>
                <li>Nur GVA-Setups werden getradet</li>
              </ul>
            </div>
            <div className="rounded border border-border bg-surface2 p-3">
              <div className="text-text font-bold text-[13px] mb-1">Konfluenz (kein Gate)</div>
              <ul className="text-[12px] text-muted space-y-0.5">
                <li>Währungs-Ranking (Stärke-Quintil Q5/Q1)</li>
                <li>Gibt Rückenwind oder Gegenwind</li>
                <li>Verbietet nie einen Trade</li>
              </ul>
            </div>
          </div>
        </div>
      </Panel>

      {/* 2 — Workflow */}
      <Panel
        title="Dein Workflow — von der Linie zum Trade"
        subtitle="Übersicht → Cockpit → Entscheiden → Outlook → Journal"
      >
        <div className="space-y-4 text-[13px] leading-relaxed">
          <ol className="space-y-2 text-muted">
            <li>
              <span className="text-text font-medium">1. Übersicht.</span> Die Startseite (das
              Rauten-Logo oben links) beantwortet „was mache ich heute?“ und zeigt die offenen Zähler
              je Modus.
            </li>
            <li>
              <span className="text-text font-medium">2. Cockpit.</span> Deine Handels-Startseite. Jeder
              Hit landet hier automatisch — kein manuelles Übernehmen nötig. Vier Lanes (siehe
              Begriffe): <span className="text-text">Nähert sich → Getroffen → Watchlist → In Arbeit</span>.
              Klick auf eine Karte öffnet die fundamentale Lage (Verdikt, beide Quintile, Linien-Info,
              High-Impact-Kalender der Woche). Über <span className="font-mono text-accent">+ Setup</span>{" "}
              erfasst du ein Setup von Hand, das nicht aus einem GVA-Hit stammt.
            </li>
            <li>
              <span className="text-text font-medium">3. Entscheiden.</span> Die Knöpfe sitzen direkt auf
              der Karte: <span className="text-up">Genommen</span> schreibt einen Trade ins Journal
              (zählt in die Winrate), <span className="text-text">Beobachten</span> legt das Setup auf die
              Watchlist, <span className="text-down">Verwerfen</span> schliesst es ab.
            </li>
            <li>
              <span className="text-text font-medium">4. Outlook.</span> Detailebene über dem Setup:
              These, Checkliste, Ziele (Entry/SL/TP). Der Status wandert Beobachtung → Wartend → Aktiv →
              Ausgeführt/Verworfen.
            </li>
            <li>
              <span className="text-text font-medium">5. Journal.</span> Genommene Trades laufen ins
              Journal — Dashboard, Trades, Equity, Trade-Kalender und Strategien liegen im Modus
              „Journalieren“.
            </li>
          </ol>
        </div>
      </Panel>

      {/* 3 — Vokabular: der eine Lebenszyklus */}
      <Panel
        title="Begriffe — der eine Status-Lebenszyklus"
        subtitle="Cockpit und Outlook sprechen dieselbe Sprache"
      >
        <div className="space-y-3 text-[13px]">
          <ul className="space-y-1.5">
            <Threshold v="Nähert sich">
              Preis läuft auf eine Linie zu (≤ 100 Pips), aus dem Live-Scanner. Ephemer — verschwindet
              von selbst, wird nicht gespeichert.
            </Threshold>
            <Threshold v="Getroffen">Linie berührt (frischer HIT), noch nicht entschieden.</Threshold>
            <Threshold v="Beobachtung">Gesehen, wird beobachtet — noch keine feste Absicht (Lane „Watchlist“).</Threshold>
            <Threshold v="Wartend">Trigger/Einstieg definiert, Preis ist noch nicht da (Lane „In Arbeit“).</Threshold>
            <Threshold v="Aktiv">Trade läuft (Lane „In Arbeit“).</Threshold>
            <Threshold v="Ausgeführt / Verworfen">
              Abgeschlossen (im Journal) bzw. abgebrochen — fällt aus der Offen-Ansicht.
            </Threshold>
          </ul>
          <Read>
            „Wartend“ meint überall dasselbe: eine bewusste, bestehende Absicht. Die Cockpit-Lane für das
            ephemere Heranlaufen heisst deshalb <span className="text-text">„Nähert sich“</span> und nicht
            „Wartend“.
          </Read>
        </div>
      </Panel>

      {/* 4 — Konfluenz: Ranking */}
      <Panel
        title="Konfluenz — Währungs-Ranking (Q5/Q1)"
        subtitle="Stärke-Quintil je Währung: gibt Rückenwind oder Gegenwind"
      >
        <div className="space-y-3 text-[13px]">
          <ul className="space-y-1.5">
            <Threshold v="Stärke-Quintil">
              Position des Zins-+-Saison-Scores einer Währung in ihrer eigenen 156-Wochen-Verteilung.{" "}
              <span className="text-up">Q5</span> = stärkstes Fünftel, <span className="text-down">Q1</span>{" "}
              = schwächstes.
            </Threshold>
            <Threshold v="Nur Q5 / Q1">
              Es zählen ausschliesslich die Extrem-Quintile. <span className="text-text">Q2–Q4 sind
              neutral</span> — keine Aussage, kein Rücken-/Gegenwind.
            </Threshold>
            <Threshold v="Rückenwind / Gegenwind">
              Steht die Base auf <span className="text-up">Q5</span> und die Quote auf{" "}
              <span className="text-down">Q1</span>, ist ein Long der Base fundamental gestützt
              („Rückenwind“). Läuft die GVA-Linie dagegen, zeigt das Cockpit „Gegenwind“.
            </Threshold>
          </ul>
          <Read>
            Das Ranking ist <span className="text-text">Konfluenz, kein Gate</span>. Ein GVA-Setup gegen
            das Ranking bleibt handelbar — es trägt nur eine Warnung.
          </Read>
          <Act>
            Bevorzuge Setups mit Rückenwind. Bei Gegenwind kleiner/vorsichtiger handeln oder einen
            besonders sauberen technischen Grund verlangen.
          </Act>
        </div>
      </Panel>

      {/* 5 — Trade-Budget */}
      <Panel
        title="Trade-Budget — 8 Live-Trades pro Monat"
        subtitle="Feste Obergrenze, damit Disziplin sichtbar bleibt"
      >
        <div className="space-y-3 text-[13px]">
          <ul className="space-y-1.5">
            <Threshold v="8 pro Monat">
              Ein Kästchen = ein Live-Trade, <span className="text-text">kontenübergreifend</span>{" "}
              (Funded + Eigenkapital zusammen). Backtest-Trades zählen nie.
            </Threshold>
            <Threshold v="Freischaltung">
              In festen 7-Tage-Blöcken ab dem 1.: bis 7. → 2 frei, bis 14. → 4, bis 21. → 6, ab 22. → 8.
              Ungenutzte Kästchen verfallen nicht (kumulativ).
            </Threshold>
            <Threshold v="Wo sichtbar">
              Widget im Journal-Dashboard (über dem Konto-Umschalter, zeigt alle Trades) und Chip in der
              Cockpit-Kopfzeile („N von 8 übrig“).
            </Threshold>
          </ul>
          <Read>
            Das Budget <span className="text-text">blockiert nie</span> das „Genommen“ — ein beim Broker
            offener Trade muss ins Journal, sonst werden Winrate und Adherence wertlos. Es macht den
            Verbrauch nur sichtbar.
          </Read>
        </div>
      </Panel>

      {/* 6 — Modi-Landkarte */}
      <Panel title="Die vier Modi" subtitle="Was wo liegt — der Rest der App als Landkarte">
        <div className="space-y-3 text-[13px]">
          <ul className="space-y-1.5">
            <Threshold v="Trades finden">
              Cockpit · Währungs-Ranking · Visuelles Radar &amp; Heatmap 28 (Admin). Der tägliche Weg zum
              Setup.
            </Threshold>
            <Threshold v="Journalieren">
              Dashboard · Trades · Equity · Outlook · Trade-Kalender · Strategien. Alles rund um erfasste
              Trades und definierte Setups.
            </Threshold>
            <Threshold v="Backtesten">
              Backtest-Lab · Replay (GVA-Hits). Setups an der Historie prüfen.
            </Threshold>
            <Threshold v="Labor">
              Factor-Lab · Engine-Log · Macro Terminal · Real Yield · News. Erklärt das „Warum“ hinter der
              Konfluenz — keine tägliche Entscheidungsquelle.
            </Threshold>
          </ul>
          <Read>
            Einstellungen und diesen Leitfaden erreichst du oben rechts über das Avatar-Menü (dein
            Initial). Sie haben keinen eigenen Modus-Tab.
          </Read>
        </div>
      </Panel>

    </div>
  );
}
