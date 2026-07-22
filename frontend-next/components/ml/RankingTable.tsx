"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import type { RankingRow } from "@/lib/ml/ranking";

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

/** Aufschlüsselung des Scores nach Faktoren (Klick auf eine Ranking-Zeile).
 *  Bewusst schlicht/funktional — das genaue Box-Design folgt separat. Nutzt die
 *  bereits vorhandenen `top_features` des Rankings, keine neue Score-Logik. */
function ScoreBreakdown({ row }: { row: RankingRow }) {
  const maxAbs = Math.max(1e-9, ...row.top_features.map((f) => Math.abs(f.value)));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">Gesamt-Score</div>
          <div className={`font-mono text-xl font-bold ${row.score >= 0 ? "text-up" : "text-down"}`}>
            {row.score >= 0 ? "+" : ""}
            {row.score.toFixed(3)}
          </div>
        </div>
        <QuintileBadge q={row.strength_quintile} />
      </div>

      <div>
        <div className="text-xs text-muted mb-2">Beiträge der Faktoren zum Score</div>
        {row.top_features.length === 0 ? (
          <p className="text-xs text-muted">Keine Faktor-Beiträge hinterlegt.</p>
        ) : (
          <ul className="space-y-2.5">
            {row.top_features.map((f) => (
              <li key={f.feature} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div>
                  <div className="text-xs font-mono">{f.feature}</div>
                  <div className="relative h-1.5 w-full rounded bg-border/40 mt-1">
                    <div
                      className={`absolute top-0 h-1.5 rounded ${
                        f.value >= 0 ? "bg-up left-1/2" : "bg-down right-1/2"
                      }`}
                      style={{ width: `${Math.min(Math.abs(f.value) / maxAbs, 1) * 50}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`font-mono text-xs font-bold ${f.value >= 0 ? "text-up" : "text-down"}`}
                >
                  {f.value >= 0 ? "+" : ""}
                  {f.value.toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        Champion-Baseline: 0.5 × Zins-Score + 0.5 × Saison-Score. Die Beiträge zeigen, welche
        Faktoren die Stärke dieser Woche treiben (nach |Beitrag| absteigend).
      </p>
    </div>
  );
}

export default function RankingTable({ rows }: { rows: RankingRow[] }) {
  const [sel, setSel] = useState<RankingRow | null>(null);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted text-xs">
              <th className="py-1 pr-2">#</th>
              <th className="pr-3">Währung</th>
              <th className="pr-3">Score</th>
              <th className="pr-3"></th>
              <th
                className="pr-3"
                title="Stärke-Quintil: Position des Scores in der eigenen 156W-Verteilung (nicht Konfidenz)"
              >
                Stärke-Quintil
              </th>
              <th>Top-Faktoren</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.ccy}
                onClick={() => setSel(r)}
                className="border-t border-border/40 cursor-pointer hover:bg-surface2/60 transition-colors"
                title="Klicken für die Score-Aufschlüsselung nach Faktoren"
              >
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
                  <QuintileBadge q={r.strength_quintile} />
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

      <Modal
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? `${sel.ccy} — Score-Aufschlüsselung` : ""}
        subtitle="Woraus sich die Kursstärke zusammensetzt"
        size="sm"
      >
        {sel && <ScoreBreakdown row={sel} />}
      </Modal>
    </>
  );
}
