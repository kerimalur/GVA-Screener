"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toaster";
import FreshBadge from "@/components/ui/FreshBadge";
import {
  fetchScreener,
  markPair,
  PAIRS_TOTAL,
  type MarketData,
} from "@/lib/gva/api";
import { loadSignals, setSignalStatus, type SignalRecord } from "@/lib/journal/signals";
import {
  assembleLanes,
  boardStateOf,
  snapshotFreshness,
  SNAPSHOT_FRESH_MIN,
  SNAPSHOT_STALE_MIN,
  WARTEND_PIP_LIMIT,
  type BoardState,
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

/** Kopfzeilen-Farben: ≤2 min normal, >2 min grau, >5 min warn. */
const HEADER_TONES = {
  fresh: "bg-surface2 text-muted",
  old: "bg-surface2 text-faint",
  dead: "bg-warn/15 text-warn",
};

function fmtClock(updatedSec: number | null): string {
  if (updatedSec == null) return "–";
  return new Date(updatedSec * 1000).toLocaleTimeString("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
      <div className="font-mono font-bold text-[13px] flex items-center gap-1.5">
        {card.pair}
        {card.detectedLate && (
          <span
            title="Nachträglich aus der Kerzen-Historie erkannt — kein Live-Hit"
            className="px-1 py-0.5 rounded bg-warn/15 text-warn text-[9px] font-bold"
          >
            ⏱ NACHTRÄGLICH
          </span>
        )}
      </div>
      <div className={`font-mono text-[11px] ${dirCls}`}>
        {card.distance != null ? (
          <>
            {/* „~" = Distanz stammt vom Tagesschluss, nicht von einem Live-Preis */}
            {card.stale ? "~" : ""}
            {card.distance.toFixed(0)}p · {dir}
          </>
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
  const [meta, setMeta] = useState({
    loaded: false,
    offline: false,
    updated: null as number | null,
    zones: 0,
    pairsTotal: PAIRS_TOTAL,
    live: true,
  });
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
      const snap = await fetchScreener();
      if (!aliveRef.current) return;
      setScanner(snap.data);
      setMeta({
        loaded: true,
        offline: false,
        updated: snap.updated,
        zones: snap.zones,
        pairsTotal: snap.pairsTotal,
        live: snap.live,
      });
    } catch {
      if (aliveRef.current) setMeta((m) => ({ ...m, offline: true }));
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

  const state: BoardState = boardStateOf(
    meta.loaded,
    meta.offline,
    meta.zones,
    meta.pairsTotal,
  );

  // Beim Kaltstart (`warmup`) bewusst KEINE Lanes rendern — sonst sieht ein
  // halb geladenes Backend aus wie ein Board ohne Setups.
  const lanes =
    state === "loading" || state === "warmup"
      ? EMPTY
      : assembleLanes(scanner, signals, quintiles);

  const freshness = snapshotFreshness(meta.updated);

  const notesFor = (c: CockpitCard): string => {
    const line = c.lineDir ? `${c.lineDir.toUpperCase()}-Linie` : "Linie";
    const lvl = c.lineLevel != null ? ` ${c.lineLevel}` : "";
    const conf =
      c.confluence.verdict === "neutral"
        ? "Ranking neutral"
        : `${c.confluence.verdict === "rueckenwind" ? "Rückenwind" : "Gegenwind"} (${c.confluence.reason})`;
    const late = c.detectedLate ? "\nHinweis: nachträglich erkannt (Backend war offline)" : "";
    return `GVA-Signal: ${line}${lvl}\nKonfluenz: ${conf}${late}`;
  };

  /**
   * Schliesst den Lebenszyklus im Backend. Ohne diesen Aufruf bleibt das Paar
   * für immer sticky auf HIT — kein neuer Alert, keine nächste Linie.
   * Fehler werden bewusst nur geloggt: sie dürfen weder die Supabase-
   * Statusänderung noch die UI-Aktion blockieren (markPair wirft nicht).
   */
  const releaseBackend = useCallback(async (pair: string, action: "pending" | "done") => {
    const ok = await markPair(pair, action);
    if (!ok) console.warn(`Cockpit: Backend-Lebenszyklus für ${pair} nicht bestätigt (${action})`);
  }, []);

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
      // Linie verbrauchen — der nächste Hit trifft dann die NÄCHSTE Linie.
      await releaseBackend(c.pair, "done");
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
    [router, releaseBackend],
  );

  const mutateStatus = useCallback(
    async (
      c: CockpitCard,
      status: "watchlist" | "dismissed",
      backendAction: "pending" | "done",
      okMsg: string,
    ) => {
      if (!c.signalId) return;
      setBusy(true);
      try {
        await setSignalStatus(c.signalId, status);
        // Verwerfen verbraucht die Linie ('done'), Beobachten nur 'pending'.
        await releaseBackend(c.pair, backendAction);
        toast.success(okMsg);
        setSelected(null);
        await loadSignalsSafe();
      } catch {
        toast.error("Aktion fehlgeschlagen");
      } finally {
        setBusy(false);
      }
    },
    [loadSignalsSafe, releaseBackend],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FreshBadge
          f={freshness}
          ageDays={null}
          tones={HEADER_TONES}
          labels={{
            fresh: `Stand ${fmtClock(meta.updated)} · ${scanner.length} Pairs`,
            old: `Stand ${fmtClock(meta.updated)} · ${scanner.length} Pairs`,
            dead:
              meta.updated == null
                ? "kein Snapshot"
                : `Stand ${fmtClock(meta.updated)} · veraltet (>${SNAPSHOT_STALE_MIN} min)`,
          }}
        />
        {freshness === "old" && (
          <span className="text-[10px] font-mono text-faint">
            älter als {SNAPSHOT_FRESH_MIN} min
          </span>
        )}
        {!meta.live && state !== "offline" && (
          <span className="text-[11px] text-warn">
            OANDA-Preise fehlen — Distanzen mit «~» stammen vom letzten Tagesschluss.
          </span>
        )}
      </div>

      {state === "offline" && (
        <p className="text-[12px] text-warn">
          GVA-Scanner offline — nur Signal-Historie sichtbar.
        </p>
      )}

      {state === "warmup" ? (
        <div className="rounded-lg border border-border bg-surface2/40 p-6 text-center">
          <p className="text-[13px] font-semibold text-warn">
            Backend startet (Zonen {meta.zones}/{meta.pairsTotal})
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Die GVA-Zonen werden noch berechnet. Ein leeres Board wäre jetzt
            irreführend — es bedeutet nicht «keine Setups».
          </p>
        </div>
      ) : (
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
      )}

      <FundamentalModal
        card={selected}
        rankingByCcy={rankingByCcy}
        eventsByCcy={eventsByCcy}
        busy={busy}
        onClose={() => setSelected(null)}
        onTake={onTake}
        onWatch={(c) => mutateStatus(c, "watchlist", "pending", "Als beobachtet markiert")}
        onDismiss={(c) => mutateStatus(c, "dismissed", "done", "Verworfen")}
      />
    </div>
  );
}
