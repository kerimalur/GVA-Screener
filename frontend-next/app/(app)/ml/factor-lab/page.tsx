import "server-only";
import Panel from "@/components/layout/Panel";
import { loadFactorStats, type FactorStat } from "@/lib/ml/factorLab";

export const dynamic = "force-dynamic";
export const metadata = { title: "Factor-Lab — FX Terminal" };

function rate(hits: number, n: number): string {
  return n > 0 ? `${((hits / n) * 100).toFixed(1)} % (n=${n})` : "– noch keine";
}

const FACTOR_LABEL: Record<string, string> = {
  cot: "COT",
  rates: "Zins/Macro",
  season: "Saison",
  ranking_baseline: "Ranking-Baseline (Kombi)",
};

export default async function FactorLabPage() {
  const stats = await loadFactorStats();
  stats.sort((a, b) => {
    const ra = a.liveN ? a.liveHits / a.liveN : -1;
    const rb = b.liveN ? b.liveHits / b.liveN : -1;
    return rb - ra || a.horizon - b.horizon;
  });

  return (
    <div className="space-y-4 max-w-[900px] mx-auto">
      <Panel
        title="Factor-Lab — welcher Faktor trifft?"
        subtitle="Live = echter Forward-Beweis (oberste Instanz). Historisch = Kalibrier-Blick, n effektiv klein (überlappende Fenster, korrelierte Währungen), nicht purged. Neutral zählt nicht."
      >
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs">
                <th className="py-1 pr-3">Faktor</th>
                <th className="pr-3">Horizont</th>
                <th className="pr-3">Live-Hitrate</th>
                <th className="pr-3">Historisch</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-muted">
                    Noch keine Daten — Seed- und Forward-Job laufen lassen.
                  </td>
                </tr>
              )}
              {stats.map((s: FactorStat) => (
                <tr key={`${s.factor}-${s.horizon}`} className="border-t border-border/40">
                  <td className="py-2 pr-3 font-semibold">{FACTOR_LABEL[s.factor] ?? s.factor}</td>
                  <td className="pr-3 font-mono">{s.horizon}W</td>
                  <td className="pr-3 font-mono">{rate(s.liveHits, s.liveN)}</td>
                  <td className="pr-3 font-mono text-muted">{rate(s.seedHits, s.seedN)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
