import type { WeeklyBtcCard as BtcData } from "@/lib/data/weekly";
import OutlookPrefillButton from "./OutlookPrefillButton";

function fmtSigned(v: number | null | undefined, digits = 1, suffix = ""): string {
  if (v === null || v === undefined) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${suffix}`;
}

/** BTC-Dossier: Leveraged-Funds-Flow + Realrendite + Risk-Regime. */
export default function WeeklyBtcCard({ btc }: { btc: BtcData }) {
  const biasCls =
    btc.bias === "LONG"
      ? "border-up text-up bg-up/10"
      : btc.bias === "SHORT"
        ? "border-down text-down bg-down/10"
        : "border-border text-muted";

  return (
    <div className="bg-surface2 border border-accent/40 rounded-lg p-3.5 space-y-2.5 flex flex-col">
      <div className="flex items-center gap-2">
        <span className="font-bold text-[14px]">₿ BTC/USD</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${biasCls}`}>
          {btc.bias ?? "NEUTRAL"}
        </span>
        <span className="ml-auto text-[10px] font-mono text-faint">
          {btc.reportDate ? `COT ${new Date(btc.reportDate).toLocaleDateString("de-DE")}` : "COT fehlt — Backfill"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="border border-border/60 rounded p-2">
          <div className="text-[9px] uppercase tracking-widest text-faint">Lev-Funds 4W</div>
          <div className={`font-mono font-bold ${(btc.flow?.delta4wPctOi ?? 0) > 0 ? "text-up" : (btc.flow?.delta4wPctOi ?? 0) < 0 ? "text-down" : "text-muted"}`}>
            {fmtSigned(btc.flow?.delta4wPctOi, 1, "% OI")}
          </div>
        </div>
        <div className="border border-border/60 rounded p-2">
          <div className="text-[9px] uppercase tracking-widest text-faint">Realrendite 3M</div>
          <div className={`font-mono font-bold ${(btc.realYieldChg3m ?? 0) < 0 ? "text-up" : (btc.realYieldChg3m ?? 0) > 0 ? "text-down" : "text-muted"}`}>
            {btc.realYieldChg3m !== null ? fmtSigned(btc.realYieldChg3m * 100, 0, " bps") : "–"}
          </div>
        </div>
        <div className="border border-border/60 rounded p-2">
          <div className="text-[9px] uppercase tracking-widest text-faint">Risk-Gauge</div>
          <div className={`font-mono font-bold ${btc.risk.regime === "Risk-On" ? "text-up" : btc.risk.regime === "Risk-Off" ? "text-down" : "text-muted"}`}>
            {btc.risk.composite.toFixed(0)}
          </div>
        </div>
      </div>

      <ul className="space-y-1 text-[11px]">
        {btc.reasons.map((r, i) => (
          <li key={i} className="flex gap-1.5 leading-snug">
            <span className={r.dir === 1 ? "text-up" : r.dir === -1 ? "text-down" : "text-faint"}>
              {r.dir === 1 ? "▲" : r.dir === -1 ? "▼" : "•"}
            </span>
            <span className="text-muted">{r.text}</span>
          </li>
        ))}
      </ul>

      {btc.events.filter((e) => e.drift).length > 0 && (
        <div className="space-y-0.5 text-[11px]">
          {btc.events
            .filter((e) => e.drift)
            .slice(0, 3)
            .map((e, i) => (
              <div key={i} className="font-mono text-warn">
                ⚡ USD {new Date(e.eventTime).toLocaleDateString("de-DE", { weekday: "short" })} {e.title}
              </div>
            ))}
        </div>
      )}

      <div className="mt-auto pt-1 flex items-center gap-3">
        <OutlookPrefillButton
          prefill={{
            symbol: "BTCUSD",
            direction: btc.bias === "LONG" ? "long" : btc.bias === "SHORT" ? "short" : null,
            fundamental: btc.fundamentalText,
          }}
        />
        <span className="text-[10px] font-mono text-faint">
          {btc.realYieldNow !== null && `10Y-Real ${btc.realYieldNow.toFixed(2)}%`}
          {btc.breakevenNow !== null && ` · Breakeven ${btc.breakevenNow.toFixed(2)}%`}
        </span>
      </div>
    </div>
  );
}
