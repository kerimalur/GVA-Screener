import Link from "next/link";
import Sparkline from "@/components/charts/Sparkline";
import StaleBadge from "@/components/layout/StaleBadge";
import type { CategoryValue } from "@/lib/data/fred";
import { G8_CURRENCIES } from "@/lib/constants/instruments";

export interface RegionData {
  ccy: string;
  values: Array<{ category: string; label: string; data: CategoryValue | null }>;
}

const CATEGORY_LABELS: Record<string, { label: string; unit: string }> = {
  policy_rate: { label: "Leitzins", unit: "%" },
  yield_10y: { label: "10Y-Rendite", unit: "%" },
  cpi: { label: "Inflation (YoY)", unit: "%" },
  unemployment: { label: "Arbeitslosenquote", unit: "%" },
  gdp: { label: "BIP-Wachstum", unit: "%" },
  cli: { label: "Leading Indicator (PMI-Proxy)", unit: "" },
  trade: { label: "Handelsbilanz", unit: "" },
};

function fmtVal(v: number | null, unit: string): string {
  if (v === null) return "–";
  const num = Math.abs(v) >= 1000
    ? v.toLocaleString("de-DE", { maximumFractionDigits: 0 })
    : v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  return `${num}${unit ? ` ${unit}` : ""}`;
}

interface RegionCompareProps {
  a: RegionData;
  b: RegionData;
}

/** Zwei Währungsräume nebeneinander, je Kategorie Wert + Sparkline + Stale-Flag. */
export default function RegionCompare({ a, b }: RegionCompareProps) {
  return (
    <div>
      {/* Region-Auswahl */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["a", "b"] as const).map((slot) => {
          const active = slot === "a" ? a.ccy : b.ccy;
          const other = slot === "a" ? b.ccy : a.ccy;
          return (
            <div key={slot} className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-widest text-faint mr-1">
                {slot === "a" ? "Raum A" : "Raum B"}
              </span>
              {G8_CURRENCIES.map((c) => (
                <Link
                  key={c}
                  href={`/makro?a=${slot === "a" ? c : other}&b=${slot === "b" ? c : other}`}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold border transition-colors ${
                    active === c
                      ? "bg-accent/15 text-accent border-accent"
                      : "text-muted border-border hover:border-border2"
                  }`}
                >
                  {c}
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-muted border-b border-border">
            <th className="text-left py-2">Kennzahl</th>
            <th className="text-right py-2 px-3">{a.ccy}</th>
            <th className="py-2 w-24" />
            <th className="text-right py-2 px-3">{b.ccy}</th>
            <th className="py-2 w-24" />
            <th className="text-right py-2">Differenz A−B</th>
          </tr>
        </thead>
        <tbody>
          {a.values.map((row, i) => {
            const meta = CATEGORY_LABELS[row.category];
            const other = b.values[i];
            const va = row.data?.latest ?? null;
            const vb = other?.data?.latest ?? null;
            const diff = va !== null && vb !== null ? va - vb : null;
            return (
              <tr key={row.category} className="border-b border-border/40">
                <td className="py-2 font-medium">
                  {meta?.label ?? row.category}
                  {(row.data?.isStale || other?.data?.isStale) && (
                    <span className="ml-2"><StaleBadge /></span>
                  )}
                </td>
                <td className="text-right py-2 px-3 font-mono font-bold">
                  {fmtVal(va, meta?.unit ?? "")}
                </td>
                <td className="py-2">
                  {row.data && <Sparkline values={row.data.spark.map((p) => p.value)} />}
                </td>
                <td className="text-right py-2 px-3 font-mono font-bold">
                  {fmtVal(vb, meta?.unit ?? "")}
                </td>
                <td className="py-2">
                  {other?.data && <Sparkline values={other.data.spark.map((p) => p.value)} />}
                </td>
                <td
                  className={`text-right py-2 font-mono font-bold ${
                    diff === null ? "text-faint" : diff > 0 ? "text-up" : diff < 0 ? "text-down" : "text-muted"
                  }`}
                >
                  {diff !== null ? `${diff > 0 ? "+" : ""}${diff.toLocaleString("de-DE", { maximumFractionDigits: 2 })}` : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
