import { Suspense } from "react";
import { Panel } from "@/components/ui";
import { loadRankingData, type PairIdea, type PairIdeas, type RankingRow } from "@/lib/ml/ranking";
import RankingPerformance from "@/components/ml/RankingPerformance";
import PerformancePanel from "@/components/ml/PerformancePanel";
import { loadPerfCandles } from "@/lib/ml/perfCandles";

/** Lädt die Kerzen der Kandidaten-Pairs (Render) vor und rendert das Panel.
 *  Eigene async-Grenze hinter <Suspense>, damit ein Render-Kaltstart nur dieses
 *  Panel verzögert und nicht die ganze Ranking-Seite blockiert. */
async function PerformancePanelBody({
  pairs,
  startByPair,
}: {
  pairs: PairIdea[];
  startByPair: Record<string, string>;
}) {
  const preloaded = await loadPerfCandles(pairs, startByPair);
  return <RankingPerformance pairs={pairs} startByPair={startByPair} preloaded={preloaded} />;
}

export const dynamic = "force-dynamic";

function LadderBar({ score }: { score: number }) {
  const pct = Math.min(Math.abs(score), 1) * 50;
  const pos = score >= 0;
  return (
    <div className="relative h-5 flex-1 rounded bg-border/25">
      <div
        className={`absolute top-0 bottom-0 rounded ${pos ? "left-1/2 bg-up" : "right-1/2 bg-down"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function QuintileBadge({ q }: { q: number }) {
  const cls =
    q === 5 ? "bg-up/15 text-up" : q === 1 ? "bg-down/15 text-down" : "bg-border/40 text-muted";
  // STÄRKE-Quintil (nicht Konfidenz): Position des Zins+Saison-Scores in der
  // eigenen 156W-Verteilung. Q5 = stärkstes Fünftel. „handelbar" bewusst
  // entfernt — die OOS-Evidenz reicht dafür nicht (Paper-Track nahe Münzwurf,
  // n zu klein). Q5/Q1 = Kandidat, keine validierte Handelsfreigabe.
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${cls}`}
      title="Stärke-Quintil des Zins+Saison-Scores (Q5 = stärkstes Fünftel vs. eigene 156-Wochen-Verteilung). Kandidat, nicht validiert handelbar."
    >
      Q{q}
      {q === 5 ? " · Kandidat" : ""}
    </span>
  );
}

function RankingTable({ rows }: { rows: RankingRow[] }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.ccy}>
          <div className="flex items-center gap-2.5">
            <span className="w-9 font-mono font-extrabold text-[13px]">{r.ccy}</span>
            <LadderBar score={r.score} />
            <span className={`w-16 text-right font-mono text-xs ${r.score >= 0 ? "text-up" : "text-down"}`}>
              {r.score >= 0 ? "+" : ""}
              {r.score.toFixed(3)}
            </span>
            <QuintileBadge q={r.strength_quintile} />
          </div>
          <div className="pl-11 mt-0.5 text-[10px] text-muted font-mono">
            {r.top_features
              .map((f) => `${f.feature} ${f.value >= 0 ? "+" : ""}${f.value.toFixed(2)}`)
              .join(" · ")}
          </div>
        </div>
      ))}
    </div>
  );
}

function PairRow({ i }: { i: PairIdea }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-t border-border/40 first:border-t-0">
      <span className="font-mono font-bold w-24">{i.pair}</span>
      <span
        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
          i.direction === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down"
        }`}
      >
        {i.direction.toUpperCase()}
      </span>
      <span className="text-xs text-muted font-mono">{i.reason}</span>
    </div>
  );
}

function ConfluenceChip({ text }: { text: string }) {
  const isQ5 = text.includes("Q5");
  return (
    <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${isQ5 ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
      {text}
    </span>
  );
}

function BestPairCard({ i }: { i: PairIdea }) {
  const parts = i.reason.split(" × ");
  return (
    <div className={`rounded-md p-3.5 border bg-surface2/60 ${i.direction === "long" ? "border-up/25" : "border-down/25"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono font-extrabold text-[14px]">{i.pair}</span>
        <span
          className={`ml-auto font-mono font-bold text-[9px] px-1.5 py-0.5 rounded ${i.direction === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}
        >
          {i.direction.toUpperCase()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {parts.map((p) => (
          <ConfluenceChip key={p} text={p} />
        ))}
      </div>
    </div>
  );
}

function PairList({ ideas }: { ideas: PairIdeas }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-muted mb-2.5 font-bold">
          Beste Konstellation — beide Seiten extrem (Stärke-Quintil Q5 × Q1)
        </div>
        {ideas.best.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ideas.best.map((i) => (
              <BestPairCard key={i.pair} i={i} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Diese Woche keine Q5×Q1-Paarung (beide Seiten im Stärke-Quintil-Extrem).</p>
        )}
      </div>
      {ideas.groups.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-2 font-bold">Q5/Q1 gegen neutrale Währungen</div>
          <div className="grid md:grid-cols-3 gap-6">
            {ideas.groups.map((g) => (
              <div key={g.ccy}>
                <div className="text-[11px] mb-1.5 font-bold text-muted">{g.label}</div>
                {g.ideas.map((i) => (
                  <PairRow key={i.pair} i={i} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Explainer() {
  return (
    <div className="space-y-3">
      <details className="group">
        <summary className="cursor-pointer text-sm font-bold py-1">
          Wie kommen Score und Q-Stufe zustande?
        </summary>
        <div className="text-xs text-muted leading-relaxed space-y-2 pl-4 pt-1">
          <p>
            <span className="font-bold text-fg">Score (−1 … +1)</span>: erwartete relative Stärke
            der Währung gegen den Korb der anderen 7 über die nächsten {`4`} Wochen. Beim aktuellen
            Champion (Baseline): 0.5 × Zins-Score + 0.5 × Saison-Score. Zins-Score = Differenzial
            zum Ø der anderen Leitzinsen (±2 pp = ±1) plus 6-Monats-Momentum. Saison-Score = nur
            aktiv, wenn der Kalendermonat in ≥12 von 17 Jahren dieselbe Richtung hatte, sonst 0.
            Die Spalte «Top-Faktoren» zeigt die Beiträge pro Währung.
          </p>
          <p>
            <span className="font-bold text-fg">Stärke-Quintil (1–5)</span>: der heutige Score wird
            gegen die Verteilung aller Scores der letzten 156 Wochen gestellt. Q5 = stärkstes
            Fünftel, Q1 = schwächstes. Das ist ein <span className="font-bold">Stärke</span>-Mass,
            <span className="font-bold"> keine Konfidenz</span> und keine Trefferquote. Nur die
            Extreme Q5 (long) / Q1 (short) werden als Kandidaten geflaggt, Q2–Q4 gelten als neutral.
          </p>
          <p>
            <span className="font-bold text-fg">Wie gut trifft das out-of-sample?</span> Ehrlich:
            nahe Münzwurf. Die purged Walk-Forward-Baseline (Engine, Zielgrösse demeaned Korb-Return)
            liegt bei ~52–54 % roher Trefferquote, hall_score ≈ 0.51; die breite Labor-Messung
            derselben Zins+Saison-Logik ergab 51.8 % (4W, OOS). Eine früher zitierte «57.6 %» war das
            oberste <span className="font-bold">Konfidenz</span>-Fünftel eines interaktiv getunten
            Composites — ein anderes Mass auf anderer Stichprobe, selektions-optimistisch und nicht
            purged. Sie gilt <span className="font-bold">nicht</span> für dieses Stärke-Quintil und
            ist keine Baseline-Zahl. Der Paper-Track unten misst die echte Live-Trefferquote mit n.
          </p>
        </div>
      </details>
      <details className="group">
        <summary className="cursor-pointer text-sm font-bold py-1">
          Was testet die ML-Engine jede Nacht?
        </summary>
        <div className="text-xs text-muted leading-relaxed space-y-2 pl-4 pt-1">
          <p>
            Jedes Experiment = eine Modell-Variante: Algorithmus (LightGBM oder logistische
            Regression) × Horizont (1/2/4 Wochen) × Feature-Teilmenge (COT-Kategorien, Zinsen,
            Saison — 31 Kombinationen) × zufällige Hyperparameter. Datenbasis: 25 Jahre × 8
            Währungen ≈ 10&#39;000 Wochen-Beobachtungen, alle Werte strikt «as of» (COT erst ab
            Freitags-Release nutzbar, Zinsen mit Publikations-Lag — kein Blick in die Zukunft).
          </p>
          <p>
            Bewertung: Purged Walk-Forward — Training nur auf Vergangenheit, Test auf 5
            chronologische Out-of-Sample-Blöcke à 52 Wochen, mit Sperrzone gegen Target-Leaks.
            hall_score = Ø-Trefferquote minus Streuung: ein Modell, das nur in einer Marktphase
            funktioniert, fällt durch. Die letzten 104 Wochen sieht die Suche nie — sie werden
            erst bei einer Champion-Beförderung geprüft, und jeder dieser Zugriffe wird gezählt
            (Zähler unten). Beförderung passiert nie automatisch.
          </p>
          <p>
            <span className="font-bold text-fg">Wo die Latte liegt:</span> schon ~54 % Trefferquote
            wären auf Wochenhorizont substanziell (über 50+ Signale/Jahr), pro Einzeltrade aber fast
            unsichtbar; Werte ab ~60 % sind in liquiden FX-Märkten praktisch immer Overfitting. Die
            Engine sucht deshalb nicht «mehr Prozent», sondern Konsistenz (hall_score = Ø-Trefferquote
            − Streuung). Aktueller Stand: die Baseline schafft OOS knapp über Münzwurf — ob daraus
            eine handelbare Edge wird, entscheidet allein der Paper-Track unten: jede Samstags-Prognose
            wird nach 4 Wochen gegen die Realität abgerechnet. Es braucht ~50 gereifte Prognosen für
            Aussagekraft (daher 2–3 Monate). Der Backtest lässt sich nicht als Ersatz vorziehen, sonst
            wäre der Live-Beweis wieder ein Rückblick.
          </p>
        </div>
      </details>
    </div>
  );
}

export default async function Page() {
  const d = await loadRankingData();
  const fmt = (m: { hits: number; total: number } | undefined) =>
    m && m.total > 0
      ? `${((m.hits / m.total) * 100).toFixed(1)} % (n=${m.total})`
      : "– noch keine gereiften Wochen";
  const updated = d.updatedAt
    ? new Date(d.updatedAt).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })
    : null;

  // Kandidaten-Pairs für den Performance-Chart: beste Konstellation zuerst,
  // dann die Gruppen-Ideen; pro Pair nur einmal.
  const perfPairs: PairIdea[] = [
    ...d.pairIdeas.best,
    ...d.pairIdeas.groups.flatMap((g) => g.ideas),
  ].filter((p, i, arr) => arr.findIndex((x) => x.pair === p.pair) === i);

  return (
    <div className="anim-fade space-y-4 max-w-[1200px] mx-auto">
      {/* Erst die Bilanz, dann die Prognose.
          Wer die Wochenausgabe liest, ohne zu wissen, wie oft sie zuletzt
          stimmte, liest ein Horoskop. Das Panel haengt an einer eigenen
          async-Grenze, damit die Abfrage der Historie die Seite nicht
          aufhaelt. */}
      <Suspense fallback={<Panel title="Wie gut lag das Ranking?">
        <div className="h-24 animate-pulse rounded-[var(--radius-cell)] bg-surface2" />
      </Panel>}>
        <PerformancePanel />
      </Suspense>

      <Panel
        title={`Pairs der Woche — ${d.weekStart ?? "?"}`}
        hint="Automatisch aus Stärke-Quintil Q5 (long) × Q1 (short) abgeleitet — Kandidaten, kein validiertes Signal. GVA-Setup in dieser Richtung = fundamentaler Rückenwind; Gegenrichtung bleibt valide, nur ohne Bonus."
      >
        <div className="p-5">
          {d.pairIdeas.best.length || d.pairIdeas.groups.length ? (
            <PairList ideas={d.pairIdeas} />
          ) : (
            <p className="text-sm text-muted">Diese Woche keine Stärke-Quintil-Extreme (Q5/Q1) — kein fundamentaler Rückenwind, reine GVA-Regeln.</p>
          )}
        </div>
      </Panel>

      <Panel
        title="Performance seit Signal"
        hint="Kursverlauf je Kandidaten-Pair ab der Woche, seit der die Konstellation unverändert steht — nicht ab der Zielwoche der Prognose. Umschaltbar Daily/Weekly und Kerze/Linie. Quelle: OANDA."
      >
        <div className="p-5">
          <Suspense
            fallback={
              <div className="h-[260px] flex items-center justify-center text-muted text-sm font-mono">
                Lade Kursdaten …
              </div>
            }
          >
            <PerformancePanelBody pairs={perfPairs} startByPair={d.signalStartByPair} />
          </Suspense>
        </div>
      </Panel>

      <Panel
        title={`Währungs-Ranking — Woche ${d.weekStart ?? "?"}${updated ? ` · zuletzt aktualisiert ${updated}` : ""}`}
        hint={`Champion-Modell, Horizont ${d.horizon ?? "–"}W, Stärke-Quintil stark long → stark short. Nur Q5/Q1 gelten als Kandidaten (Extrem-Regel); „handelbar" erst, wenn der Paper-Track die Trefferquote signifikant >50 % belegt.`}
      >
        {d.champion.length > 0 ? (
          <div className="p-5 space-y-4">
            <RankingTable rows={d.champion} />
            <Explainer />
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">
            Noch kein Ranking — Weekly-Workflow ausführen (GitHub → Actions → ML Weekly Ranking).
          </p>
        )}
      </Panel>

      <Panel
        title="Paper-Track — echte Forward-Trefferquote"
        hint="Oberste Instanz, nicht der Backtest. Champion muss die Baseline (Zins+Saison) schlagen."
      >
        <div className="grid grid-cols-2 gap-4 p-5 text-sm">
          <div>
            <div className="text-xs text-muted">Champion</div>
            <div className="font-mono text-lg">{fmt(d.liveHitrate["champion"])}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Baseline (Zins+Saison)</div>
            <div className="font-mono text-lg">{fmt(d.liveHitrate["baseline"])}</div>
          </div>
        </div>
      </Panel>

      <Panel title="Engine-Status" hint="Nächtliche Experiment-Suche auf GitHub Actions.">
        <div className="p-5">
          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <div className="text-xs text-muted">Experimente (done / total)</div>
              <div className="font-mono text-lg">
                {d.stats.experimentsDone} / {d.stats.experimentsTotal}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Holdout-Zugriffe</div>
              <div className="font-mono text-lg">{d.stats.holdoutAccesses}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Champion seit</div>
              <div className="font-mono text-lg">
                {d.stats.champion
                  ? new Date(d.stats.champion.promoted_at).toLocaleDateString("de-CH")
                  : "Baseline"}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted mb-1">Hall of Fame (Ø-OOS-Hitrate − Fold-Std)</div>
          <ul className="text-xs font-mono space-y-1">
            {d.stats.hallOfFame.length === 0 && <li className="text-muted">Noch keine Experimente.</li>}
            {d.stats.hallOfFame.map((h) => (
              <li key={h.id} className="truncate">
                #{h.id} · hall {h.hall_score?.toFixed(3) ?? "–"} · {JSON.stringify(h.config)}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}
