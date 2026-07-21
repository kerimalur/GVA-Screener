"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import FreshBadge from "@/components/ui/FreshBadge";
import OutlookWizardModal from "@/components/journal/OutlookWizardModal";
import { fetchScreener, PAIRS_TOTAL, type MarketData } from "@/lib/gva/api";
import { loadSignals, type SignalRecord } from "@/lib/journal/signals";
import {
  loadGvaOutlooks,
  loadOpenManualOutlooks,
  outlooksBySignal,
  saveOutlook,
  type OutlookRecord,
} from "@/lib/journal/outlooks";
import { loadTrades } from "@/lib/journal/trades";
import { budgetState } from "@/lib/journal/budget";
import type { Trade } from "@/lib/journal/types";
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

const POLL_MS = 15_000;

const EMPTY: CockpitLanes = { naehert: [], getroffen: [], watchlist: [], inArbeit: [] };

/**
 * Lane-Beschriftungen kommen aus dem gemeinsamen Vokabular — keine
 * hartkodierten Statusnamen mehr. „In Arbeit" ist bewusst ein Lane-Name und
 * kein Status: die Bahn fasst zwei Zustände zusammen.
 */
const LANES: { id: keyof CockpitLanes; label: string; hint: string }[] = [
  {
    id: "naehert",
    label: setupLabel("naehert"),
    hint: `Linie ≤ ${NAEHERT_PIP_LIMIT}p`,
  },
  { id: "getroffen", label: setupLabel("getroffen"), hint: "frischer GVA-HIT" },
  { id: "watchlist", label: "Watchlist", hint: setupLabel("beobachtung") },
  {
    id: "inArbeit",
    label: "In Arbeit",
    hint: [setupLabel("wartend"), setupLabel("aktiv")].join(" · "),
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

/**
 * Eine Karte. Der Rumpf führt in die Detailebene (Outlook), die Fusszeile
 * trägt den Lebenszyklus.
 *
 * Der Klick öffnete früher ein Modal mit fundamentalen Details — dieselben
 * Inhalte, die auch der Outlook zeigte, nur anders. Jetzt gibt es einen Weg:
 * die Karte führt auf den Outlook, und dort steht alles.
 */
function Card({
  card,
  busy,
  budgetLeer,
  onOpen,
  onTake,
  onWatch,
  onDismiss,
}: {
  card: CockpitCard;
  busy: boolean;
  /** Monatsbudget aufgebraucht — warnt, blockiert aber nicht. */
  budgetLeer: boolean;
  onOpen: (c: CockpitCard) => void;
  onTake: (c: CockpitCard) => void;
  onWatch: (c: CockpitCard) => void;
  onDismiss: (c: CockpitCard) => void;
}) {
  const dirCls =
    card.lineDir === "long" ? "text-up" : card.lineDir === "short" ? "text-down" : "text-muted";
  const dir = card.lineDir ? card.lineDir.toUpperCase() : "";
  // Ohne Signal UND ohne Outlook gibt es nichts zu schreiben: „Nähert sich"-
  // Karten sind ephemer und existieren nur im Scanner-Snapshot.
  const bewegbar = card.signalId != null || card.outlookId != null;
  const oeffenbar = card.outlookId != null;

  return (
    <div className="rounded-md border border-border/60 bg-surface hover:border-faint transition-colors">
      <button
        onClick={() => onOpen(card)}
        disabled={!oeffenbar}
        title={
          oeffenbar
            ? "Details im Outlook öffnen"
            : "Noch kein Outlook — entsteht mit dem HIT auf die Linie"
        }
        className="w-full text-left px-2.5 py-2 disabled:cursor-default"
      >
        <div className="font-mono font-bold text-[13px] flex items-center gap-1.5 flex-wrap">
          {card.pair}
          {card.manual && (
            <span
              title="Von Hand erfasstes Setup — kein GVA-Hit dahinter"
              className="px-1 py-0.5 rounded bg-surface2 text-muted text-[9px] font-bold"
            >
              ✎ MANUELL
            </span>
          )}
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
          ) : card.manual ? (
            <>
              {card.lineLevel != null ? `${card.lineLevel} · ` : ""}
              {dir}
            </>
          ) : (
            <>● HIT · {dir}</>
          )}
        </div>
        {/* Karten in Watchlist/In Arbeit tragen mehrere mögliche Zustände —
            der genaue steht drauf. */}
        {card.status !== "naehert" && card.status !== "getroffen" && (
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted">
            {setupLabel(card.status)}
          </div>
        )}
        <Confluence card={card} />
        <OutlookHinweise card={card} />
      </button>

      {bewegbar && (
        <div className="flex items-center gap-0.5 border-t border-border/60 px-1 py-1">
          {/* Budget aufgebraucht → warnen, aber nie sperren: der Trade ist beim
              Broker evtl. schon offen, und ein verweigertes Journal macht
              Winrate und Adherence wertlos. */}
          <button
            onClick={() => onTake(card)}
            disabled={busy}
            title={
              budgetLeer
                ? "Budget des Monats ist aufgebraucht — Trade wird trotzdem geloggt"
                : "Genommen → Journal"
            }
            className={`flex-1 py-1 rounded text-[10px] font-semibold hover:bg-active disabled:opacity-40 ${
              budgetLeer ? "text-warn" : "text-accent"
            }`}
          >
            <i className={`ph-bold ${budgetLeer ? "ph-warning" : "ph-notebook"}`} /> Genommen
          </button>
          {card.status !== "beobachtung" && (
            <button
              onClick={() => onWatch(card)}
              disabled={busy}
              title={setupLabel("beobachtung")}
              className="px-2 py-1 rounded text-[10px] text-muted hover:bg-active disabled:opacity-40"
            >
              <i className="ph-bold ph-eye" />
            </button>
          )}
          <button
            onClick={() => onDismiss(card)}
            disabled={busy}
            title={setupLabel("verworfen")}
            className="px-2 py-1 rounded text-[10px] text-muted hover:bg-down-dim hover:text-down disabled:opacity-40"
          >
            <i className="ph-bold ph-x" />
          </button>
        </div>
      )}
    </div>
  );
}

function Lane({
  label,
  hint,
  cards,
  busy,
  budgetLeer,
  onOpen,
  onTake,
  onWatch,
  onDismiss,
}: {
  label: string;
  hint: string;
  cards: CockpitCard[];
  busy: boolean;
  budgetLeer: boolean;
  onOpen: (c: CockpitCard) => void;
  onTake: (c: CockpitCard) => void;
  onWatch: (c: CockpitCard) => void;
  onDismiss: (c: CockpitCard) => void;
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
          cards.map((c) => (
            <Card
              key={c.key}
              card={c}
              busy={busy}
              budgetLeer={budgetLeer}
              onOpen={onOpen}
              onTake={onTake}
              onWatch={onWatch}
              onDismiss={onDismiss}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function CockpitBoard({ quintiles }: { quintiles: Record<string, number> }) {
  const router = useRouter();
  const [scanner, setScanner] = useState<MarketData[]>([]);
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [outlooks, setOutlooks] = useState<Record<string, OutlookRecord>>({});
  const [manuelle, setManuelle] = useState<OutlookRecord[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
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
  const [busy, setBusy] = useState(false);
  const [wizard, setWizard] = useState(false);
  const aliveRef = useRef(true);

  const loadSignalsSafe = useCallback(async () => {
    try {
      // 'new' + 'watchlist' = die beiden offenen Signalzustände. Die feinere
      // Einordnung (Beobachtung / Wartend / Aktiv) kommt aus dem Outlook.
      const [fresh, watch, gvaOutlooks, manual, alleTrades] = await Promise.all([
        loadSignals("new"),
        loadSignals("watchlist"),
        // Anreicherung ist optional: schlägt sie fehl, bleiben die Karten roh.
        loadGvaOutlooks().catch(() => [] as OutlookRecord[]),
        // Manuelle Setups sind die zweite Kartenquelle — fällt sie aus, zeigt
        // das Board weiterhin die GVA-Seite statt gar nichts.
        loadOpenManualOutlooks().catch(() => [] as OutlookRecord[]),
        // Nur für den Budget-Chip. Fällt es aus, entfällt der Chip still.
        loadTrades().catch(() => [] as Trade[]),
      ]);
      if (!aliveRef.current) return;
      setSignals([...fresh, ...watch]);
      setOutlooks(outlooksBySignal(gvaOutlooks));
      setManuelle(manual);
      setTrades(alleTrades);
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
      : assembleLanes(scanner, signals, quintiles, outlooks, manuelle);

  const freshness = snapshotFreshness(meta.updated);
  const zonesTxt = zonesLabel(state, meta.zones, meta.pairsTotal);
  const budget = budgetState(trades);

  const notesFor = (c: CockpitCard): string => {
    const line = c.lineDir ? `${c.lineDir.toUpperCase()}-Linie` : "Linie";
    const lvl = c.lineLevel != null ? ` ${c.lineLevel}` : "";
    const conf =
      c.confluence.verdict === "neutral"
        ? "Ranking neutral"
        : `${c.confluence.verdict === "rueckenwind" ? "Rückenwind" : "Gegenwind"} (${c.confluence.reason})`;
    const late = c.detectedLate ? "\nHinweis: nachträglich erkannt (Backend war offline)" : "";
    const herkunft = c.manual ? "Manuelles Setup" : `GVA-Signal: ${line}${lvl}`;
    return `${herkunft}\nKonfluenz: ${conf}${late}`;
  };

  /**
   * Einziger Schreibpfad des Cockpits. `setSetupStatus` setzt Signal, spiegelt
   * den verknüpften Outlook und schliesst den Backend-Lebenszyklus in einem
   * Aufruf — ohne diesen letzten Schritt bliebe das Paar sticky auf HIT.
   * Manuelle Setups laufen durch exakt dieselbe Funktion, nur ohne Signal.
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

  /** Detailebene: EINE Ansicht je Setup — der Outlook. */
  const onOpen = useCallback(
    (c: CockpitCard) => {
      if (!c.outlookId) return;
      router.push(`/journal/outlook?outlook=${c.outlookId}`);
    },
    [router],
  );

  const onTake = useCallback(
    async (c: CockpitCard) => {
      if (!c.signalId && !c.outlookId) return;
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
          setups: c.manual ? [] : ["setup_3day_gva"],
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
      if (!c.signalId && !c.outlookId) return;
      setBusy(true);
      const ok = await applyStatus(c, next);
      if (ok) toast.success(okMsg);
      await loadSignalsSafe();
      setBusy(false);
    },
    [loadSignalsSafe, applyStatus],
  );

  /**
   * „+ Setup" — der einzige Weg, ein Setup von Hand anzulegen. Vorher entstand
   * so etwas nur im Journal-Outlook und tauchte im Cockpit nie auf.
   */
  const anlegen = useCallback(
    async (data: OutlookRecord) => {
      try {
        await saveOutlook({ ...data, source: "manual", signalId: null });
        toast.success("Setup angelegt");
        await loadSignalsSafe();
      } catch {
        toast.error("Setup konnte nicht angelegt werden");
        throw new Error("save failed");
      }
    },
    [loadSignalsSafe],
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
        {/* Budget-Stand am Ort der Entscheidung. Leeres Budget wird betont,
            aber nie erzwungen — siehe Warnung an der Karte. Kein Chip, solange
            noch keine Trades geladen sind (Kaltstart / Fehler). */}
        {trades.length > 0 && (
          <span
            title={`Trade-Budget des Monats: ${budget.used} von ${budget.total} verbraucht`}
            className={
              budget.offen === 0
                ? "px-1.5 py-0.5 rounded bg-down/15 text-down text-[10px] font-bold font-mono"
                : "px-1.5 py-0.5 rounded bg-surface2 text-faint text-[10px] font-mono"
            }
          >
            {budget.offen === 0
              ? `Budget aufgebraucht (${budget.used}/${budget.total})`
              : `${budget.offen} von ${budget.total} übrig`}
          </span>
        )}
        <div className="ml-auto">
          <Button size="sm" icon="ph-plus" onClick={() => setWizard(true)}>
            Setup
          </Button>
        </div>
      </div>

      {state === "offline" && (
        <p className="text-[12px] text-warn">
          GVA-Scanner offline — nur Signal-Historie und manuelle Setups sichtbar.
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
              busy={busy}
              budgetLeer={budget.offen === 0}
              onOpen={onOpen}
              onTake={onTake}
              onWatch={(c) => mutateStatus(c, "beobachtung", "Auf die Watchlist gesetzt")}
              onDismiss={(c) => mutateStatus(c, "verworfen", "Verworfen")}
            />
          ))}
        </div>
      )}

      {wizard && (
        <OutlookWizardModal onSave={anlegen} onClose={() => setWizard(false)} />
      )}
    </div>
  );
}
