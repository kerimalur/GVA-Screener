"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CurrencyModal from "./CurrencyModal";
import { SUBSCORE_ORDER } from "@/lib/calc/currencyScore";
import type { TerminalCurrency } from "@/lib/data/terminal";

/**
 * Modus A (Übersicht): 8 Währungs-Boxen, gruppiert in Long / Neutral / Short
 * nach dem kanonischen Bias-Score. Klick → Detail-Modal (Modus B).
 * „Vergleichen" → zwei Boxen wählen → Vergleichsseite (Modus C).
 */

function fmtTotal(v: number | null): string {
  if (v === null) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

function CurrencyBox({
  c,
  onClick,
  compareSlot,
  compareMode,
}: {
  c: TerminalCurrency;
  onClick: () => void;
  /** 1 = als Pair 1 markiert, 2 = Pair 2, null = nicht markiert */
  compareSlot: 1 | 2 | null;
  compareMode: boolean;
}) {
  const dir = c.score.direction;
  const border =
    dir === "LONG" ? "border-up/50" : dir === "SHORT" ? "border-down/50" : "border-border";
  const totalCls = dir === "LONG" ? "text-up" : dir === "SHORT" ? "text-down" : "text-muted";
  return (
    <button
      onClick={onClick}
      className={`relative text-left rounded-lg border bg-surface2 p-3.5 space-y-2.5 transition-all cursor-pointer hover:border-accent/70 ${border} ${
        compareSlot !== null ? "ring-2 ring-accent border-accent" : ""
      } ${compareMode && compareSlot === null ? "opacity-90" : ""}`}
    >
      {compareSlot !== null && (
        <span className="absolute -top-2 -right-2 bg-accent text-black text-[10px] font-black px-1.5 py-0.5 rounded">
          Pair {compareSlot}
        </span>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{c.flag}</span>
          <span className="font-mono font-black text-[15px]">{c.ccy}</span>
        </div>
        <span className={`text-xl font-black font-mono ${totalCls}`}>{fmtTotal(c.score.total)}</span>
      </div>
      <div className="flex items-center gap-2.5 pt-1.5 border-t border-border/60">
        {SUBSCORE_ORDER.map(({ key, short }) => {
          const sub = c.score.subs.find((s) => s.key === key)!;
          return (
            <span
              key={key}
              title={`${sub.label}: ${sub.text}`}
              className="flex items-center gap-0.5 text-[10px] font-mono"
            >
              <span className="text-faint">{short}</span>
              <span className={sub.dir === 1 ? "text-up" : sub.dir === -1 ? "text-down" : "text-faint"}>
                {sub.score === null ? "·" : sub.dir === 1 ? "▲" : sub.dir === -1 ? "▼" : "•"}
              </span>
            </span>
          );
        })}
      </div>
    </button>
  );
}

function Group({
  title,
  cls,
  items,
  render,
}: {
  title: string;
  cls: string;
  items: TerminalCurrency[];
  render: (c: TerminalCurrency) => React.ReactNode;
}) {
  return (
    <div>
      <div className={`text-[11px] font-black uppercase tracking-widest mb-2 ${cls}`}>
        {title} <span className="text-faint font-mono">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-faint text-[11px] font-mono">—</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map((c) => render(c))}
        </div>
      )}
    </div>
  );
}

export default function TerminalOverview({ currencies }: { currencies: TerminalCurrency[] }) {
  const router = useRouter();
  const [openCcy, setOpenCcy] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [pairA, setPairA] = useState<string | null>(null);

  const long = currencies
    .filter((c) => c.score.direction === "LONG")
    .sort((a, b) => (b.score.total ?? 0) - (a.score.total ?? 0));
  const short = currencies
    .filter((c) => c.score.direction === "SHORT")
    .sort((a, b) => (a.score.total ?? 0) - (b.score.total ?? 0));
  const neutral = currencies
    .filter((c) => c.score.direction === "NEUTRAL")
    .sort((a, b) => Math.abs(b.score.total ?? 0) - Math.abs(a.score.total ?? 0));

  const handleClick = (c: TerminalCurrency) => {
    if (!compareMode) {
      setOpenCcy(c.ccy);
      return;
    }
    if (pairA === null) {
      setPairA(c.ccy);
      return;
    }
    if (pairA === c.ccy) {
      setPairA(null); // Abwahl
      return;
    }
    router.push(`/makro/terminal/vergleich?a=${pairA}&b=${c.ccy}`);
  };

  const slotOf = (ccy: string): 1 | 2 | null => (compareMode && pairA === ccy ? 1 : null);

  const open = currencies.find((c) => c.ccy === openCcy) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            setCompareMode((m) => !m);
            setPairA(null);
          }}
          className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
            compareMode
              ? "bg-accent/15 text-accent border-accent"
              : "text-muted border-border hover:border-border2 hover:text-text"
          }`}
        >
          ⇄ Vergleichen
        </button>
        <span className="text-[11px] font-mono text-muted">
          {compareMode
            ? pairA === null
              ? "Erste Währung wählen (Pair 1) …"
              : `${pairA} gewählt — zweite Währung wählen (Pair 2)`
            : "Klick auf eine Box öffnet das Währungs-Detail."}
        </span>
      </div>

      <Group
        title="Long"
        cls="text-up"
        items={long}
        render={(c) => (
          <CurrencyBox
            key={c.ccy}
            c={c}
            onClick={() => handleClick(c)}
            compareSlot={slotOf(c.ccy)}
            compareMode={compareMode}
          />
        )}
      />
      <Group
        title="Neutral"
        cls="text-muted"
        items={neutral}
        render={(c) => (
          <CurrencyBox
            key={c.ccy}
            c={c}
            onClick={() => handleClick(c)}
            compareSlot={slotOf(c.ccy)}
            compareMode={compareMode}
          />
        )}
      />
      <Group
        title="Short"
        cls="text-down"
        items={short}
        render={(c) => (
          <CurrencyBox
            key={c.ccy}
            c={c}
            onClick={() => handleClick(c)}
            compareSlot={slotOf(c.ccy)}
            compareMode={compareMode}
          />
        )}
      />

      <p className="text-[10px] text-faint leading-relaxed">
        Kanonischer Bias-Score −1…+1 = Ø der verfügbaren Sub-Scores (C = COT-Flow · Z = Zinsen/CB ·
        S = Saisonalität · R = Retail konträr). LONG ≥ +0.15 · SHORT ≤ −0.15. Eine Bias-Logik für
        die ganze App — Details per Klick.
      </p>

      {open && <CurrencyModal currency={open} onClose={() => setOpenCcy(null)} />}
    </div>
  );
}
