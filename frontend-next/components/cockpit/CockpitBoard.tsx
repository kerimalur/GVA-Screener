"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toaster";
import { fetchScreener, type MarketData } from "@/lib/gva/api";
import { loadSignals, setSignalStatus, type SignalRecord } from "@/lib/journal/signals";
import {
  assembleLanes,
  WARTEND_PIP_LIMIT,
  type CockpitCard,
  type CockpitLanes,
} from "@/lib/cockpit/board";
import FundamentalModal, {
  type CcyRanking,
  type CockpitEvent,
} from "./FundamentalModal";

const POLL_MS = 15_000;

const EMPTY: CockpitLanes = { wartend: [], aktiv: [], inArbeit: [] };

const LANES: { id: keyof CockpitLanes; label: string; hint: string }[] = [
  { id: "wartend", label: "Wartend", hint: `Linie ≤ ${WARTEND_PIP_LIMIT}p` },
  { id: "aktiv", label: "Aktiv · gehittet", hint: "frischer GVA-HIT" },
  { id: "inArbeit", label: "In Arbeit", hint: "beobachtet" },
];

function Confluence({ card }: { card: CockpitCard }) {
  const { verdict, reason } = card.confluence;
  if (verdict === "neutral") {
    return <div className="font-mono text-[10px] text-faint mt-1">◦ Ranking neutral</div>;
  }
  return verdict === "rueckenwind" ? (
    <div className="font-mono text-[10px] text-up mt-1">✓ {reason}</div>
  ) : (
    <div className="font-mono text-[10px] text-down/80 mt-1">✗ gegen Ranking ({reason})</div>
  );
}

function Card({ card, onClick }: { card: CockpitCard; onClick: () => void }) {
  const dirCls = card.lineDir === "long" ? "text-up" : card.lineDir === "short" ? "text-down" : "text-muted";
  const dir = card.lineDir ? card.lineDir.toUpperCase() : "";
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md border border-border/60 bg-surface hover:border-faint transition-colors px-2.5 py-2"
    >
      <div className="font-mono font-bold text-[13px]">{card.pair}</div>
      <div className={`font-mono text-[11px] ${dirCls}`}>
        {card.distance != null ? (
          <>{card.distance.toFixed(0)}p · {dir}</>
        ) : (
          <>● HIT · {dir}</>
        )}
      </div>
      <Confluence card={card} />
    </button>
  );
}

function Lane({
  label,
  hint,
  cards,
  onCard,
}: {
  label: string;
  hint: string;
  cards: CockpitCard[];
  onCard: (c: CockpitCard) => void;
}) {
  return (
    <div className="flex-1 min-w-0 rounded-lg border border-border bg-surface2/40 p-2.5">
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
        <span className="text-[10px] font-mono text-faint">
          {cards.length} · {hint}
        </span>
      </div>
      <div className="space-y-2">
        {cards.length === 0 ? (
          <p className="text-[11px] text-faint px-0.5 py-3">—</p>
        ) : (
          cards.map((c) => <Card key={c.key} card={c} onClick={() => onCard(c)} />)
        )}
      </div>
    </div>
  );
}

export default function CockpitBoard({
  quintiles,
  rankingByCcy,
  eventsByCcy,
}: {
  quintiles: Record<string, number>;
  rankingByCcy: Record<string, CcyRanking>;
  eventsByCcy: Record<string, CockpitEvent[]>;
}) {
  const router = useRouter();
  const [scanner, setScanner] = useState<MarketData[]>([]);
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "offline">("loading");
  const [selected, setSelected] = useState<CockpitCard | null>(null);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  const loadSignalsSafe = useCallback(async () => {
    try {
      // 'new' + 'watchlist' = Aktiv- und In-Arbeit-Lane.
      const [fresh, watch] = await Promise.all([
        loadSignals("new"),
        loadSignals("watchlist"),
      ]);
      if (aliveRef.current) setSignals([...fresh, ...watch]);
    } catch {
      /* Signals optional — Board bleibt aus Scanner nutzbar */
    }
  }, []);

  const loadScanner = useCallback(async () => {
    try {
      const rows = await fetchScreener();
      if (!aliveRef.current) return;
      setScanner(rows);
      setState("ok");
    } catch {
      if (aliveRef.current) setState("offline");
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const load = () => {
      void loadScanner();
      void loadSignalsSafe();
    };
    queueMicrotask(load);
    const t = setInterval(load, POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(t);
    };
  }, [loadScanner, loadSignalsSafe]);

  const lanes = state === "loading" ? EMPTY : assembleLanes(scanner, signals, quintiles);

  const notesFor = (c: CockpitCard): string => {
    const line = c.lineDir ? `${c.lineDir.toUpperCase()}-Linie` : "Linie";
    const lvl = c.lineLevel != null ? ` ${c.lineLevel}` : "";
    const conf =
      c.confluence.verdict === "neutral"
        ? "Ranking neutral"
        : `${c.confluence.verdict === "rueckenwind" ? "Rückenwind" : "Gegenwind"} (${c.confluence.reason})`;
    return `GVA-Signal: ${line}${lvl}\nKonfluenz: ${conf}`;
  };

  const onTake = useCallback(
    async (c: CockpitCard) => {
      if (!c.signalId) return;
      setBusy(true);
      try {
        await setSignalStatus(c.signalId, "journaled");
      } catch {
        toast.error("Status-Update fehlgeschlagen");
        setBusy(false);
        return;
      }
      sessionStorage.setItem(
        "tradePrefill",
        JSON.stringify({
          pair: c.pair,
          direction: c.lineDir === "short" ? "short" : "long",
          date: (c.hitAt ?? new Date().toISOString()).split("T")[0],
          notes: notesFor(c),
          setups: ["setup_3day_gva"],
          signalId: c.signalId,
        }),
      );
      router.push("/journal");
    },
    [router],
  );

  const mutateStatus = useCallback(
    async (c: CockpitCard, status: "watchlist" | "dismissed", okMsg: string) => {
      if (!c.signalId) return;
      setBusy(true);
      try {
        await setSignalStatus(c.signalId, status);
        toast.success(okMsg);
        setSelected(null);
        await loadSignalsSafe();
      } catch {
        toast.error("Aktion fehlgeschlagen");
      } finally {
        setBusy(false);
      }
    },
    [loadSignalsSafe],
  );

  return (
    <div className="space-y-3">
      {state === "offline" && (
        <p className="text-[12px] text-warn">
          GVA-Scanner offline — nur Signal-Historie sichtbar.
        </p>
      )}
      <div className="flex gap-3 items-start">
        {LANES.map((l) => (
          <Lane
            key={l.id}
            label={l.label}
            hint={l.hint}
            cards={lanes[l.id]}
            onCard={setSelected}
          />
        ))}
      </div>

      <FundamentalModal
        card={selected}
        rankingByCcy={rankingByCcy}
        eventsByCcy={eventsByCcy}
        busy={busy}
        onClose={() => setSelected(null)}
        onTake={onTake}
        onWatch={(c) => mutateStatus(c, "watchlist", "Als beobachtet markiert")}
        onDismiss={(c) => mutateStatus(c, "dismissed", "Verworfen")}
      />
    </div>
  );
}
