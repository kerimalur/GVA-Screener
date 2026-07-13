import Panel from "@/components/layout/Panel";
import { loadRankingData, type RankingRow } from "@/lib/ml/ranking";

export const dynamic = "force-dynamic";

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.abs(score), 1) * 50;
  const pos = score >= 0;
  return (
    <div className="relative h-2 w-32 rounded bg-border/40">
      <div
        className={`absolute top-0 h-2 rounded ${pos ? "bg-up left-1/2" : "bg-down right-1/2"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function QuintileBadge({ q }: { q: number }) {
  const cls =
    q === 5 ? "bg-up/15 text-up" : q === 1 ? "bg-down/15 text-down" : "bg-border/40 text-muted";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${cls}`}>
      Q{q}
      {q === 5 ? " · handelbar" : ""}
    </span>
  );
}

function RankingTable({ rows }: { rows: RankingRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted text-xs">
            <th className="py-1 pr-2">#</th>
            <th className="pr-3">Währung</th>
            <th className="pr-3">Score</th>
            <th className="pr-3"></th>
            <th className="pr-3">Konfidenz</th>
            <th>Top-Faktoren</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.ccy} className="border-t border-border/40">
              <td className="py-2 pr-2 font-mono text-muted">{i + 1}</td>
              <td className="pr-3 font-bold">{r.ccy}</td>
              <td className={`pr-3 font-mono ${r.score >= 0 ? "text-up" : "text-down"}`}>
                {r.score >= 0 ? "+" : ""}
                {r.score.toFixed(3)}
              </td>
              <td className="pr-3">
                <ScoreBar score={r.score} />
              </td>
              <td className="pr-3">
                <QuintileBadge q={r.confidence_quintile} />
              </td>
              <td className="text-xs text-muted font-mono">
                {r.top_features
                  .map((f) => `${f.feature} ${f.value >= 0 ? "+" : ""}${f.value.toFixed(2)}`)
                  .join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Page() {
  const d = await loadRankingData();
  const fmt = (m: { hits: number; total: number } | undefined) =>
    m && m.total > 0
      ? `${((m.hits / m.total) * 100).toFixed(1)} % (n=${m.total})`
      : "– noch keine gereiften Wochen";

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      <Panel
        title={`Währungs-Ranking — Woche ${d.weekStart ?? "?"}`}
        subtitle={`Champion-Modell, Horizont ${d.horizon ?? "–"}W, stark long → stark short. Nur Q5-Signale gelten als handelbar (Labor-Regel: Edge lebt im obersten Konfidenz-Fünftel).`}
      >
        {d.champion.length > 0 ? (
          <div className="p-5">
            <RankingTable rows={d.champion} />
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">
            Noch kein Ranking — Weekly-Workflow ausführen (GitHub → Actions → ML Weekly Ranking).
          </p>
        )}
      </Panel>

      <Panel
        title="Paper-Track — echte Forward-Trefferquote"
        subtitle="Oberste Instanz, nicht der Backtest. Champion muss die Baseline (Zins+Saison) schlagen."
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

      <Panel title="Engine-Status" subtitle="Nächtliche Experiment-Suche auf GitHub Actions.">
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
