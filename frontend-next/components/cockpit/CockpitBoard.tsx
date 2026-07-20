"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toaster";
import FreshBadge from "@/components/ui/FreshBadge";
import { fetchScreener, PAIRS_TOTAL, type MarketData } from "@/lib/gva/api";
import { loadSignals, type SignalRecord } from "@/lib/journal/signals";
import {
  loadGvaOutlooks,
  outlooksBySignal,
  type OutlookRecord,
} from "@/lib/journal/outlooks";
import { setSetupStatus } from "@/lib/setup/setStatus";
import { setupLabel, type SetupStatus } from "@/lib/setup/lifecycle";
import {
  assembleLanes,
  boardStateOf,
  snapshotFreshness,
  zonesLabel,
  SNAPSHOT_FRESH_MIN,
  SNAPSHOT_STALE_MIN,
  NAEHERT_PIP_LIMIT,
  type BoardState,
  type CockpitCard,
  type CockpitLanes,
} from "@/lib/cockpit/board";
import FundamentalModal, {
  type CcyRanking,
  type CockpitEvent,
} from "./FundamentalModal";

const POLL_MS = 15_000;

const EMPTY: CockpitLanes = { naehert: [], getroffen: [], inArbeit: [] };

/**
 * Lane-Beschriftungen kommen aus dem gemeinsamen Vokabular — keine
 * hartkodierten Statusnamen mehr. „In Arbeit" ist bewusst ein Lane-Name und
 * kein Status: die Bahn fasst drei Zustände zusammen.
 */
const LANES: { id: keyof CockpitLanes; label: string; hint: string }[] = [
  {
    id: "naehert",
    label: setupLabel("naehert"),
    hint: `Linie ≤ ${NAEHERT_PIP_LIMIT}p`,
  },
  { id: "getroffen", label: setupLabel("getroffen"), hint: "frischer GVA-HIT" },
  {
    id: "inArbeit",
    label: "In Arbeit",
    hint: [setupLabel("beobachtung"), setupLabel("wartend"), setupLabel("aktiv")].join(" · "),
  },
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

/**
 * Anreicherung aus dem verknüpften Outlook. Fehlt der Outlook (Altbestand oder
 * fehlgeschlagener Insert), wird schlicht nichts gezeigt.
 */
function OutlookHinweise({ card }: { card: CockpitCard }) {
  if (!card.outlookId) return null;
  const teile: string[] = [];
  if (card.hasThesis) teile.push("These");
  if (card.checklistTotal > 0) teile.push(`${card.checklistDone}/${card.checklistTotal}`);
  if (!card.isStarred && teile.length === 0) return null;
  return (
    <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-faint">
      {card.isStarred && <i className="ph-fill ph-star text-warn" title="Favorit" />}
      {teile.length > 0 && <span>{teile.join(" · ")}</span>}
    </div>
  );
}

function Card({ card, onClick }: { card: CockpitCard; onClick: () => void }) {
  const dirCls =
    card.lineDir === "long" ? "text-up" : card.lineDir === "short" ? "text-down" : "text-muted";
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
      {/* In-Arbeit-Karten tragen drei mögliche Zustände — der genaue steht drauf. */}
      {card.status !== "naehert" && card.status !== "getroffen" && (
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          {setupLabel(card.status)}
        </div>
      )}
      <Confluence card={card} />
      <OutlookHinweise card={card} />
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
  const [outlooks, setOutlooks] = useState<Record<string, OutlookRecord>>({});
  const [meta, setMeta] = useState({
    loaded: false,
    offline: false,
    updated: null as number | null,
    zones: 0,
    pairsTotal: PAIRS_TOTAL,
    live: true,
    completeRun: false,
    /** ms des ERSTEN erfolgreichen Fetches — Basis fürs warmup-Zeitfenster */
    firstFetchMs: null as number | null,
  });
  const [selected, setSelected] = useState<CockpitCard | null>(null);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  const loadSignalsSafe = useCallback(async () => {
    try {
      // 'new' + 'watchlist' = die beiden offenen Signalzustände. Die feinere
      // Einordnung (Beobachtung / Wartend / Aktiv) kommt aus dem Outlook.
      const [fresh, watch, gvaOutlooks] = await Promise.all([
        loadSignals("new"),
        loadSignals("watchlist"),
        // Anreicherung ist optional: schlägt sie fehl, bleiben die Karten roh.
        loadGvaOutlooks().catch(() => [] as OutlookRecord[]),
      ]);
      if (!aliveRef.current) return;
      setSignals([...fresh, ...watch]);
      setOutlooks(outlooksBySignal(gvaOutlooks));
    } catch {
      /* Signals optional — Board bleibt aus Scanner nutzbar */
    }
  }, []);

  const loadScanner = useCallback(async () => {
    try {
      const snap = await fetchScreener();
      if (!aliveRef.current) return;
      setScanner(snap.data);
      setMeta((m) => ({
        loaded: true,
        offline: false,
        updated: snap.updated,
        zones: snap.zones,
        pairsTotal: snap.pairsTotal,
        live: snap.live,
        completeRun: snap.zonesCompleteRun,
        // Nur beim ersten Erfolg setzen — das Zeitfenster misst ab da.
        firstFetchMs: m.firstFetchMs ?? Date.now(),
      }));
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

  const state: BoardState = boardStateOf({
    loaded: meta.loaded,
    offline: meta.offline,
    zones: meta.zones,
    pairsTotal: meta.pairsTotal,
    completeRun: meta.completeRun,
    firstFetchMs: meta.firstFetchMs,
  });

  // Nur beim echten Kaltstart (`warmup`) KEINE Lanes rendern — sonst sieht ein
  // halb geladenes Backend aus wie ein Board ohne Setups. Bei `partial` ist der
  // Kaltstart durch: dann sind die vorhandenen Pairs mehr wert als das Warten.
  const lanes =
    state === "loading" || state === "warmup"
      ? EMPTY
      : assembleLanes(scanner, signals, quintiles, outlooks);

  const freshness = snapshotFreshness(meta.updated);
  const zonesTxt = zonesLabel(state, meta.zones, meta.pairsTotal);

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
   * Einziger Schreibpfad des Cockpits. `setSetupStatus` setzt Signal, spiegelt
   * den verknüpften Outlook und schliesst den Backend-Lebenszyklus in einem
   * Aufruf — ohne diesen letzten Schritt bliebe das Paar sticky auf HIT.
   */
  const applyStatus = useCallback(
    async (c: CockpitCard, next: SetupStatus): Promise<boolean> => {
      try {
        await setSetupStatus({
          signalId: c.signalId,
          outlookId: c.outlookId,
          pair: c.pair,
          next,
        });
        return true;
      } catch {
        // Der Signal-Status steht bereits (er wird nie zurückgerollt) — was
        // hier scheitert, ist die Outlook-Spiegelung. Sichtbar machen.
        toast.error("Outlook konnte nicht gespiegelt werden");
        return false;
      }
    },
    [],
  );

  const onTake = useCallback(
    async (c: CockpitCard) => {
      if (!c.signalId) return;
      setBusy(true);
      // Linie verbrauchen ('done') + Outlook auf „Ausgeführt".
      await applyStatus(c, "ausgefuehrt");
      sessionStorage.setItem(
        "tradePrefill",
        JSON.stringify({
          pair: c.pair,
          direction: c.lineDir === "short" ? "short" : "long",
          date: (c.hitAt ?? new Date().toISOString()).split("T")[0],
          notes: notesFor(c),
          setups: ["setup_3day_gva"],
          signalId: c.signalId,
          outlookId: c.outlookId,
        }),
      );
      router.push("/journal");
    },
    [router, applyStatus],
  );

  const mutateStatus = useCallback(
    async (c: CockpitCard, next: SetupStatus, okMsg: string) => {
      if (!c.signalId) return;
      setBusy(true);
      const ok = await applyStatus(c, next);
      if (ok) toast.success(okMsg);
      setSelected(null);
      await loadSignalsSafe();
      setBusy(false);
    },
    [loadSignalsSafe, applyStatus],
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
        {/* Zonen-Stand: "startet noch" / "läuft, aber unvollständig" /
            "läuft vollständig" muss jederzeit ablesbar sein. Bei `partial`
            bewusst als Warnung und nicht wegklickbar. */}
        {zonesTxt && (
          <span
            className={
              state === "partial"
                ? "inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn/15 text-warn text-[10px] font-bold font-mono"
                : "px-1.5 py-0.5 rounded bg-surface2 text-faint text-[10px] font-mono"
            }
          >
            {state === "partial" && <i className="ph-bold ph-warning" />}
            {zonesTxt}
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
        onWatch={(c) => mutateStatus(c, "beobachtung", "Als beobachtet markiert")}
        onDismiss={(c) => mutateStatus(c, "verworfen", "Verworfen")}
      />
    </div>
  );
}
