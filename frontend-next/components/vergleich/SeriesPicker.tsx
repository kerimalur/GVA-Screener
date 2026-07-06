"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OverlayChart from "@/components/intermarket/OverlayChart";
import { INSTRUMENTS, FX_INSTRUMENTS } from "@/lib/constants/instruments";
import { CFTC_CONTRACTS } from "@/lib/constants/cftcContracts";
import { FRED_CATALOG } from "@/lib/constants/fredSeries";

const TYPE_LABELS: Record<string, string> = {
  price: "Preis",
  cot_net: "COT-Netto",
  spread_10y: "10Y-Spread",
  rate_diff: "Zinsdifferenz",
  sentiment: "Retail-Sentiment",
  fred: "FRED-Serie",
};

function keyOptions(type: string): Array<{ value: string; label: string }> {
  switch (type) {
    case "price":
      return INSTRUMENTS.map((i) => ({ value: i.instrument, label: i.displayName }));
    case "cot_net":
      return CFTC_CONTRACTS.map((c) => ({ value: c.code, label: c.label }));
    case "spread_10y":
    case "rate_diff":
      return FX_INSTRUMENTS.map((i) => ({ value: i.instrument, label: i.displayName }));
    case "sentiment":
      return FX_INSTRUMENTS.map((i) => ({
        value: i.instrument.replace("_", ""),
        label: i.displayName,
      }));
    case "fred":
      return FRED_CATALOG.map((s) => ({ value: s.id, label: `${s.label} (${s.id})` }));
    default:
      return [];
  }
}

function defaultKey(type: string): string {
  return keyOptions(type)[0]?.value ?? "";
}

function Picker() {
  const router = useRouter();
  const params = useSearchParams();

  const typeA = params.get("ta") ?? "cot_net";
  const keyA = params.get("ka") ?? "099741";
  const typeB = params.get("tb") ?? "price";
  const keyB = params.get("kb") ?? "EUR_USD";
  const normalize = params.get("norm") === "1";

  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    router.replace(`/vergleich?${next.toString()}`);
  }

  const slot = (
    label: string,
    type: string,
    key: string,
    typeParam: string,
    keyParam: string,
  ) => (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-faint w-12">{label}</span>
      <select
        value={type}
        onChange={(e) =>
          update({ [typeParam]: e.target.value, [keyParam]: defaultKey(e.target.value) })
        }
        className="bg-surface2 border border-border rounded px-2 py-1 text-[12px]"
      >
        {Object.entries(TYPE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select
        value={key}
        onChange={(e) => update({ [keyParam]: e.target.value })}
        className="bg-surface2 border border-border rounded px-2 py-1 text-[12px] font-mono max-w-72"
      >
        {keyOptions(type).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {slot("Serie A", typeA, keyA, "ta", "ka")}
        {slot("Serie B", typeB, keyB, "tb", "kb")}
        <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => update({ norm: e.target.checked ? "1" : "0" })}
            className="accent-[#58a6ff]"
          />
          auf 100 normalisieren
        </label>
      </div>

      <OverlayChart
        a={{ type: typeA, key: keyA }}
        b={{ type: typeB, key: keyB }}
        height={380}
        normalize={normalize}
        showStats
      />

      <p className="text-[10px] text-faint">
        Beispiele: COT-Netto EUR vs. EUR/USD-Preis · Zinsdifferenz vs. Pair · Retail-Sentiment vs. Preis ·
        10Y-Spread vs. Pair. Auswahl steckt in der URL — teilbar.
      </p>
    </div>
  );
}

export default function SeriesPicker() {
  return (
    <Suspense>
      <Picker />
    </Suspense>
  );
}
