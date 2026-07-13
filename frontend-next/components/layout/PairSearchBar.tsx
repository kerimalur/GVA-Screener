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
const ANALYSE_PREFIXES = ["/dashboard", "/weekly", "/cot", "/makro"];

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
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div
        className={`flex items-center gap-2 bg-surface border rounded-[10px] px-3 h-9 w-[200px] transition-colors duration-100 ${
          focused ? "border-accent" : "border-border2"
        }`}
      >
        <i className="ph-bold ph-magnifying-glass text-[13px] text-faint shrink-0" />
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
          className={`flex-1 bg-transparent border-none outline-none text-[13px] font-semibold font-mono tracking-[0.3px] ${
            activePair ? "text-accent" : "text-text"
          }`}
        />
        {query && (
          <button onClick={clear} className="text-faint text-[14px] leading-none p-0 shrink-0 cursor-pointer">
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-surface border border-border2 rounded-(--radius-card) overflow-hidden overflow-y-auto z-100 max-h-[260px] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {filtered.slice(0, 28).map((pair) => (
            <button
              key={pair}
              onMouseDown={(e) => { e.preventDefault(); select(pair); }}
              className={`block w-full text-left px-3.5 py-2 text-[13px] font-semibold font-mono tracking-[0.3px] cursor-pointer transition-colors duration-75 ${
                pair === activePair ? "text-accent bg-accent-dim" : "text-text hover:bg-surface2"
              }`}
            >
              {pair.slice(0, 3)}/{pair.slice(3)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
