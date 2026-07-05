import type { CotReportRow } from "@/lib/supabase/types";

function fmt(n: number | null): string {
  if (n === null) return "–";
  return n.toLocaleString("de-DE");
}

function delta(
  cur: number | null,
  prev: number | null,
  oi?: number | null,
): { text: string; cls: string } {
  if (cur === null || prev === null) return { text: "–", cls: "text-faint" };
  const d = cur - prev;
  // Δ in % des Open Interest macht die Flow-Größe über Contracts vergleichbar
  const pctOi = oi && oi > 0 ? ` (${d > 0 ? "+" : ""}${((d / oi) * 100).toFixed(1)} % OI)` : "";
  return {
    text: `${d > 0 ? "+" : ""}${d.toLocaleString("de-DE")}${pctOi}`,
    cls: d > 0 ? "text-up" : d < 0 ? "text-down" : "text-muted",
  };
}

interface CotSnapshotTableProps {
  latest: CotReportRow;
  prev: CotReportRow | null;
}

/** Aktueller Report: Positionen aller drei Gruppen + Wochenänderung. */
export default function CotSnapshotTable({ latest, prev }: CotSnapshotTableProps) {
  const groups = [
    {
      name: "Non-Commercials (Large Specs)",
      long: latest.noncomm_long,
      short: latest.noncomm_short,
      prevLong: prev?.noncomm_long ?? null,
      prevShort: prev?.noncomm_short ?? null,
      emphasis: true,
    },
    {
      name: "Commercials (Hedger)",
      long: latest.comm_long,
      short: latest.comm_short,
      prevLong: prev?.comm_long ?? null,
      prevShort: prev?.comm_short ?? null,
      emphasis: false,
    },
    {
      name: "Nonreportable (Retail)",
      long: latest.nonrept_long,
      short: latest.nonrept_short,
      prevLong: prev?.nonrept_long ?? null,
      prevShort: prev?.nonrept_short ?? null,
      emphasis: false,
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-border">
            <th className="text-left py-2 pr-3">Gruppe</th>
            <th className="text-right py-2 px-3">Long</th>
            <th className="text-right py-2 px-3">Short</th>
            <th className="text-right py-2 px-3">Netto</th>
            <th className="text-right py-2 pl-3">Δ Woche (Netto)</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {groups.map((g) => {
            const net = g.long !== null && g.short !== null ? g.long - g.short : null;
            const prevNet =
              g.prevLong !== null && g.prevShort !== null ? g.prevLong - g.prevShort : null;
            const d = delta(net, prevNet, g.emphasis ? latest.open_interest : null);
            return (
              <tr key={g.name} className="border-b border-border/50">
                <td className={`py-2 pr-3 font-sans ${g.emphasis ? "font-semibold" : "text-muted"}`}>
                  {g.name}
                </td>
                <td className="text-right py-2 px-3 text-up">{fmt(g.long)}</td>
                <td className="text-right py-2 px-3 text-down">{fmt(g.short)}</td>
                <td className={`text-right py-2 px-3 font-bold ${net !== null && net >= 0 ? "text-up" : "text-down"}`}>
                  {fmt(net)}
                </td>
                <td className={`text-right py-2 pl-3 ${d.cls}`}>{d.text}</td>
              </tr>
            );
          })}
          <tr>
            <td className="py-2 pr-3 text-muted font-sans">Open Interest</td>
            <td className="text-right py-2 px-3" colSpan={3}>
              {fmt(latest.open_interest)}
            </td>
            <td className={`text-right py-2 pl-3 ${delta(latest.open_interest, prev?.open_interest ?? null).cls}`}>
              {delta(latest.open_interest, prev?.open_interest ?? null).text}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="text-[10px] text-faint font-mono mt-2">
        Report: {new Date(latest.report_date).toLocaleDateString("de-DE")} · Quelle: CFTC (Legacy, Futures only)
      </div>
    </div>
  );
}
