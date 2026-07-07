import GaugeArc from "@/components/charts/GaugeArc";
import Sparkline from "@/components/charts/Sparkline";
import type { RiskGaugeResult } from "@/lib/calc/riskGauge";

/** Risk-On/Risk-Off-Gauge + 4 Sub-Indikatoren. */
export default function RiskGaugePanel({ risk }: { risk: RiskGaugeResult }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <GaugeArc
        value={risk.composite}
        leftLabel="Risk-Off"
        rightLabel="Risk-On"
        size={190}
      />
      <span
        className={`px-3 py-1 rounded text-[11px] font-black tracking-widest ${
          risk.regime === "Risk-On"
            ? "bg-up/15 text-up"
            : risk.regime === "Risk-Off"
              ? "bg-down/15 text-down"
              : "bg-warn/15 text-warn"
        }`}
      >
        {risk.regime.toUpperCase()}
      </span>

      <div className="w-full space-y-2">
        {risk.indicators.map((ind) => (
          <div key={ind.name} className="flex items-center gap-2">
            <span className="w-24 text-[11px] font-medium shrink-0">{ind.name}</span>
            <div className="flex-1 h-2 bg-surface2 rounded-full overflow-hidden">
              <div
                className={`h-full ${ind.score >= 60 ? "bg-up" : ind.score <= 40 ? "bg-down" : "bg-warn"}`}
                style={{ width: `${ind.score}%` }}
              />
            </div>
            <span className="w-8 text-right text-[11px] font-mono font-bold">
              {ind.score.toFixed(0)}
            </span>
            {ind.spark.length > 1 ? (
              <Sparkline values={ind.spark} width={60} height={18} />
            ) : (
              <div style={{ width: 60 }} />
            )}
          </div>
        ))}
      </div>
      <div className="w-full text-[10px] text-faint space-y-0.5">
        {risk.indicators.map((ind) => (
          <div key={ind.name} className="font-mono">· {ind.detail}</div>
        ))}
      </div>
    </div>
  );
}
