"use client";

import { useState } from "react";
import OverlayChart from "./OverlayChart";
import { INSTRUMENTS } from "@/lib/constants/instruments";

/** Freies Overlay: zwei beliebige Instrumente, Dual-Axis oder normalisiert. */
export default function OverlayTool() {
  const [a, setA] = useState("XAU_USD");
  const [b, setB] = useState("AUD_USD");
  const [normalize, setNormalize] = useState(false);

  const select = (value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface2 border border-border rounded px-2 py-1 text-[12px] font-mono"
    >
      {INSTRUMENTS.map((i) => (
        <option key={i.instrument} value={i.instrument}>
          {i.displayName}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {select(a, setA)}
        <span className="text-muted text-xs">vs.</span>
        {select(b, setB)}
        <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => setNormalize(e.target.checked)}
            className="accent-[#58a6ff]"
          />
          auf 100 normalisieren
        </label>
      </div>
      <OverlayChart
        a={{ type: "price", key: a }}
        b={{ type: "price", key: b }}
        height={340}
        normalize={normalize}
      />
    </div>
  );
}
