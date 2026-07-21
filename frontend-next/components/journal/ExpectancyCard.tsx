"use client";

import { useEffect, useState } from "react";
import type { Trade } from "@/lib/journal/types";
import {
  DEFAULT_EXPECTANCY_PARAMS,
  EXPECTANCY_MIN_TRADES,
  expectancyPerMonth,
  liveWinrate,
  loadExpectancyParams,
  type ExpectancyParams,
} from "@/lib/journal/discipline";
import { TRADE_BUDGET_PER_MONTH } from "@/lib/journal/budget";

/**
 * Wiederverwendbares Expectancy-Widget: erwartetes Monats-Ergebnis in % des
 * Kontos aus Winrate × RR × Risiko% × Trades/Monat. Winrate live aus den
 * übergebenen Trades; unter EXPECTANCY_MIN_TRADES → Fallback aus den Settings
 * (klar als „manuell" gekennzeichnet). Parameter: Journal-Einstellungen.
 */

export default function ExpectancyCard({ trades }: { trades: Trade[] }) {
  const [params, setParams] = useState<ExpectancyParams>(DEFAULT_EXPECTANCY_PARAMS);

  useEffect(() => {
    loadExpectancyParams().then(setParams).catch(() => {});
  }, []);

  const live = liveWinrate(trades);
  const useLive = live !== null && trades.length >= EXPECTANCY_MIN_TRADES;
  const wr = useLive ? live : params.fallbackWinrate;
  const monthly = expectancyPerMonth(wr, params);
  const pos = monthly >= 0;

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: "24px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-faint)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "6px" }}>
          Expectancy / Monat
        </div>
        <div
          style={{
            fontSize: "22px",
            fontWeight: 700,
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: "-0.5px",
            color: pos ? "var(--color-up)" : "var(--color-down)",
          }}
        >
          {pos ? "+" : ""}
          {monthly.toFixed(1)} %
        </div>
      </div>
      <div style={{ fontSize: "11px", color: "var(--color-muted)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.8 }}>
        <div>
          Winrate {wr.toFixed(1)} %{" "}
          {useLive ? (
            <span style={{ color: "var(--color-up)" }}>· live (n={trades.length})</span>
          ) : (
            <span style={{ color: "var(--color-warn)" }}>
              · manuell (Fallback, erst {trades.length}/{EXPECTANCY_MIN_TRADES} Trades)
            </span>
          )}
        </div>
        <div>
          Risiko {params.riskPct} % · RR 1:{params.rr} · {TRADE_BUDGET_PER_MONTH} Trades/Mt (Budget)
        </div>
      </div>
    </div>
  );
}
