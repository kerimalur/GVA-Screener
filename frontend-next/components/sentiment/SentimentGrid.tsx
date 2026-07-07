import GaugeArc from "@/components/charts/GaugeArc";

export interface SentimentEntry {
  pair: string;
  longPct: number;
  shortPct: number;
  longPositions: number | null;
  shortPositions: number | null;
}

/** Gauge je Pair, nach Extremität sortiert. Long-lastig = Konträr-Short. */
export default function SentimentGrid({ entries }: { entries: SentimentEntry[] }) {
  const sorted = [...entries].sort(
    (a, b) => Math.abs(b.longPct - 50) - Math.abs(a.longPct - 50),
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      {sorted.map((e) => (
        <div
          key={e.pair}
          className={`bg-surface2 border rounded p-2 flex flex-col items-center ${
            e.longPct >= 70 || e.longPct <= 30 ? "border-warn/60" : "border-border"
          }`}
        >
          <span className="text-[11px] font-mono font-bold mb-1">{e.pair}</span>
          {/* invertiert: viel Retail-Long = rot (Konträr-Short) */}
          <GaugeArc value={e.longPct} size={90} invert leftLabel="Short" rightLabel="Long" />
          <span className="text-[9px] text-faint font-mono mt-0.5">
            {e.longPct.toFixed(0)} % long
          </span>
        </div>
      ))}
    </div>
  );
}
