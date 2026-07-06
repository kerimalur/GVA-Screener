import {
  computeChangeStats,
  CHANGE_WINDOWS,
  type ChangeStat,
} from "@/lib/calc/changeStats";
import type { SeriesPoint } from "@/lib/calc/seriesMath";

export interface CompareStatsRow {
  label: string;
  points: SeriesPoint[];
}

/** Kompakte Zahl: 98,4k für COT-Kontrakte, 4 Nachkommastellen für FX-Preise. */
function formatValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  if (abs >= 10) return v.toFixed(2);
  if (abs > 0) return v.toFixed(4);
  return "0";
}

function DeltaCell({ stat }: { stat: ChangeStat | null }) {
  if (!stat) {
    return <td className="px-3 py-2 text-right font-mono text-faint">–</td>;
  }
  const up = stat.delta > 0;
  const flat = stat.delta === 0;
  const cls = flat ? "text-faint" : up ? "text-up" : "text-down";
  return (
    <td className={`px-3 py-2 text-right font-mono ${cls}`}>
      <div className="font-bold">
        {up ? "+" : ""}
        {formatValue(stat.delta)} {flat ? "" : up ? "▲" : "▼"}
      </div>
      {stat.pct !== null && (
        <div className="text-[10px] opacity-80">
          {stat.pct > 0 ? "+" : ""}
          {stat.pct.toFixed(2)} %
        </div>
      )}
    </td>
  );
}

/** Δ-Statistik (1W/1M/3M/1J) je Serie — Zahlen zum Chart. */
export default function CompareStatsTable({ rows }: { rows: CompareStatsRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-faint border-b border-border">
            <th className="px-3 py-2 text-left font-medium">Serie</th>
            <th className="px-3 py-2 text-right font-medium">Letzter Wert</th>
            {CHANGE_WINDOWS.map((w) => (
              <th key={w} className="px-3 py-2 text-right font-medium">
                Δ {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stats = computeChangeStats(row.points);
            return (
              <tr key={row.label} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium max-w-56 truncate">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {stats.last !== null ? formatValue(stats.last) : "–"}
                  {stats.lastDate && (
                    <div className="text-[10px] text-faint font-normal">{stats.lastDate}</div>
                  )}
                </td>
                {CHANGE_WINDOWS.map((w) => (
                  <DeltaCell key={w} stat={stats.changes[w]} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
