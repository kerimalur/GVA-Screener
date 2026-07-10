"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PAIRS = [
  "EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD",
  "EURJPY","GBPJPY","EURGBP","AUDJPY","CADJPY","CHFJPY","EURAUD",
  "EURCAD","EURCHF","EURNZD","GBPAUD","GBPCAD","GBPCHF","GBPNZD",
  "AUDCAD","AUDCHF","AUDNZD","CADCHF","NZDCAD","NZDCHF","NZDJPY",
];

// Analyse pages that show the search bar
const ANALYSE_PREFIXES = [
  "/dashboard","/weekly","/cot","/makro","/sentiment",
  "/intermarket","/saisonalitaet","/kalender","/vergleich",
];

function isAnalysePage(pathname: string): boolean {
  return ANALYSE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export default function PairSearchBar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("pair") ?? "");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync when URL pair param changes
  useEffect(() => {
    setQuery(searchParams.get("pair") ?? "");
  }, [searchParams]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!isAnalysePage(pathname)) return null;

  const filtered = query.length === 0
    ? PAIRS
    : PAIRS.filter((p) => p.toLowerCase().includes(query.replace("/","").toLowerCase()));

  const select = (pair: string) => {
    setQuery(pair);
    setOpen(false);
    inputRef.current?.blur();
    const params = new URLSearchParams(searchParams.toString());
    params.set("pair", pair);
    router.push(`${pathname}?${params.toString()}`);
  };

  const clear = () => {
    setQuery("");
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pair");
    const qs = params.toString();
    router.push(pathname + (qs ? `?${qs}` : ""));
  };

  const activePair = searchParams.get("pair");

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Input */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "var(--color-surface)",
        border: `1px solid ${focused ? "var(--color-accent)" : "var(--color-border2)"}`,
        borderRadius: "10px",
        padding: "0 12px",
        height: "36px",
        width: "200px",
        transition: "border-color 120ms",
      }}>
        <i className="ph-bold ph-magnifying-glass" style={{ fontSize: "13px", color: "var(--color-faint)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Pair suchen…"
          onChange={(e) => { setQuery(e.target.value.toUpperCase()); setOpen(true); }}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) select(filtered[0]);
            if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            color: activePair ? "var(--color-accent)" : "var(--color-text)",
            letterSpacing: "0.3px",
          }}
        />
        {query && (
          <button onClick={clear} style={{ color: "var(--color-faint)", background: "transparent", border: "none", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        )}
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          right: 0,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border2)",
          borderRadius: "12px",
          overflow: "hidden",
          zIndex: 100,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          maxHeight: "260px",
          overflowY: "auto",
        }}>
          {filtered.slice(0, 28).map((pair) => (
            <button
              key={pair}
              onMouseDown={(e) => { e.preventDefault(); select(pair); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.3px",
                color: pair === activePair ? "var(--color-accent)" : "var(--color-text)",
                background: pair === activePair ? "var(--color-accent-dim)" : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 80ms",
              }}
              onMouseEnter={(e) => { if (pair !== activePair) (e.currentTarget as HTMLElement).style.background = "var(--color-surface2)"; }}
              onMouseLeave={(e) => { if (pair !== activePair) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {pair.slice(0,3)}/{pair.slice(3)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
