"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Panel from "@/components/layout/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import FundamentalDetail from "@/components/cockpit/FundamentalDetail";
import OutlookWizardModal from "./OutlookWizardModal";
import {
  loadOutlooks,
  saveOutlook,
  updateOutlook,
  removeOutlook,
  OUTLOOK_STATUS_CONFIG,
  type OutlookRecord,
  type OutlookStatus,
} from "@/lib/journal/outlooks";
import { loadSignals, signalsById, type SignalRecord } from "@/lib/journal/signals";
import { setSetupStatus } from "@/lib/setup/setStatus";
import {
  fromOutlookStatus,
  isClosedSetup,
  setupLabel,
  type SetupStatus,
} from "@/lib/setup/lifecycle";
import { cardForOutlook } from "@/lib/cockpit/board";
import type { CcyRanking, CockpitEvent } from "@/lib/cockpit/detail";
import {
  fetchFundamentals,
  splitPair,
  type FundamentalsData,
} from "@/lib/journal/fundamentals";

type StatusFilter = "all" | "starred" | OutlookStatus;

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConfidenceStars({ value }: { value: number }) {
  return (
    <span className="text-warn text-[11px]">
      {"★".repeat(value)}
      <span className="text-faint">{"★".repeat(Math.max(0, 5 - value))}</span>
    </span>
  );
}

/**
 * Herkunft eines Outlooks. Bei `source='gva'` steckt ein echter Hit dahinter —
 * inklusive Linien-Level, Hit-Zeitpunkt und dem Flag „nachträglich erkannt"
 * aus `signals.detected_late`. Bei `source='manual'` steht genau das da:
 * von Hand erfasst, kein Signal.
 */
function Herkunft({
  outlook,
  signal,
}: {
  outlook: OutlookRecord;
  signal: SignalRecord | undefined;
}) {
  if (outlook.source === "manual") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted">
        <span className="px-1.5 py-0.5 rounded bg-surface2 text-muted font-bold">✎ manuell</span>
      </div>
    );
  }
  if (outlook.source !== "gva") return null;
  const level = signal?.lineLevel ?? outlook.interestingZone;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted">
      <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold">GVA-Hit</span>
      {level != null && <span>Linie {level}</span>}
      {signal?.hitAt && <span>HIT {fmtWhen(signal.hitAt)}</span>}
      {signal?.detectedLate && (
        <span
          title="Nachträglich aus der Kerzen-Historie erkannt — kein Live-Hit"
          className="px-1.5 py-0.5 rounded bg-warn/15 text-warn font-bold"
        >
          ⏱ nachträglich erkannt
        </span>
      )}
    </div>
  );
}

function FundamentalsCompare({
  symbol,
  fundamentals,
}: {
  symbol: string;
  fundamentals: FundamentalsData | null;
}) {
  if (!fundamentals) return null;
  const { base, quote } = splitPair(symbol);
  const b = fundamentals.byCode[base];
  const q = fundamentals.byCode[quote];
  if (!b && !q) return null;

  const fmt = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : "—");
  return (
    <div className="mt-2 pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-[10px] font-mono">
      {[{ ccy: base, d: b }, { ccy: quote, d: q }].map(({ ccy, d }) => (
        <div key={ccy} className="flex items-center gap-2">
          <span className="font-bold text-muted">{ccy}</span>
          {d?.score !== undefined && (
            <span title="Stärke-Score" className={Number(d.score) >= 0 ? "text-up" : "text-down"}>
              S {fmt(d.score)}
            </span>
          )}
          <span title="Realzins" className={Number(d?.realRate) >= 0 ? "text-up" : "text-down"}>
            RR {fmt(d?.realRate)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Lebenszyklus-Knöpfe — identisch in Liste und Detailansicht. */
function StatusAktionen({
  outlook,
  onStatus,
  onJournal,
}: {
  outlook: OutlookRecord;
  onStatus: (o: OutlookRecord, next: SetupStatus) => void;
  onJournal: (o: OutlookRecord) => void;
}) {
  const aktuell = fromOutlookStatus(outlook.status);
  return (
    <>
      {aktuell === "beobachtung" && (
        <Button variant="subtle" size="sm" onClick={() => onStatus(outlook, "wartend")}>
          {setupLabel("wartend")}
        </Button>
      )}
      {(aktuell === "beobachtung" || aktuell === "wartend") && (
        <Button variant="subtle" size="sm" onClick={() => onStatus(outlook, "aktiv")}>
          {setupLabel("aktiv")}
        </Button>
      )}
      {aktuell === "aktiv" && (
        <Button variant="primary" size="sm" icon="ph-notebook" onClick={() => onJournal(outlook)}>
          Journalieren
        </Button>
      )}
      {!isClosedSetup(aktuell) && (
        <Button variant="ghost" size="sm" onClick={() => onStatus(outlook, "verworfen")}>
          {setupLabel("verworfen")}
        </Button>
      )}
    </>
  );
}

export default function OutlookView({
  quintiles = {},
  rankingByCcy = {},
  eventsByCcy = {},
}: {
  quintiles?: Record<string, number>;
  rankingByCcy?: Record<string, CcyRanking>;
  eventsByCcy?: Record<string, CockpitEvent[]>;
}) {
  const router = useRouter();
  const [outlooks, setOutlooks] = useState<OutlookRecord[]>([]);
  const [signals, setSignals] = useState<Record<string, SignalRecord>>({});
  const [fundamentals, setFundamentals] = useState<FundamentalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showWizard, setShowWizard] = useState(false);
  const [editing, setEditing] = useState<OutlookRecord | undefined>();
  /** Aus dem Cockpit verlinkter Eintrag — schaltet auf die Detailansicht. */
  const [fokusId, setFokusId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, sigs] = await Promise.all([
        loadOutlooks(),
        // Herkunftsdaten sind optional: ohne sie fehlt nur der GVA-Kopf.
        loadSignals().catch(() => [] as SignalRecord[]),
      ]);
      setOutlooks(rows);
      setSignals(signalsById(sigs));
    } catch {
      toast.error("Fehler beim Laden der Outlooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten-Fetch beim Mount
    reload();
    fetchFundamentals().then(setFundamentals);

    // Direktlink aus dem Cockpit: ?outlook=<id>. Bewusst über
    // window.location statt useSearchParams — spart die Suspense-Grenze.
    const ziel = new URLSearchParams(window.location.search).get("outlook");
    if (ziel) setFokusId(ziel);

    // Dossier-Übergabe aus dem Weekly-Cockpit (/weekly): Wizard vorbefüllt öffnen
    const raw = sessionStorage.getItem("outlook-prefill");
    if (raw) {
      sessionStorage.removeItem("outlook-prefill");
      try {
        const p = JSON.parse(raw) as {
          symbol?: string;
          direction?: "long" | "short" | null;
          fundamental?: string;
        };
        setEditing({
          symbol: p.symbol || "EURUSD",
          direction: p.direction ?? "long",
          thesis: "",
          confidence: 3,
          status: "observation",
          fundamentalOutlook: p.fundamental || "",
        });
        setShowWizard(true);
      } catch {
        // defekter Prefill — Wizard normal nutzbar
      }
    }
  }, [reload]);

  const filtered = useMemo(() => {
    const sorted = [...outlooks].sort((a, b) => {
      if (!!b.isStarred !== !!a.isStarred) return b.isStarred ? 1 : -1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    if (filter === "all") {
      // „Offen" = alles ausser abgeschlossen (ausgeführt / verworfen).
      return sorted.filter((o) => !isClosedSetup(fromOutlookStatus(o.status)));
    }
    if (filter === "starred") return sorted.filter((o) => o.isStarred);
    return sorted.filter((o) => o.status === filter);
  }, [outlooks, filter]);

  /** Ziel eines Cockpit-Klicks: genau ein Setup, in voller Tiefe. */
  const fokus = useMemo(
    () => (fokusId ? outlooks.find((o) => o.id === fokusId) : undefined),
    [outlooks, fokusId],
  );

  // Die Detailansicht hängt an der URL, nicht nur am State — sonst wäre sie
  // weder verlinkbar noch überlebte sie ein Neuladen.
  const oeffneDetail = (id: string | undefined | null) => {
    if (!id) return;
    setFokusId(id);
    router.replace(`/journal/outlook?outlook=${id}`);
  };

  const zurueckZurListe = () => {
    setFokusId(null);
    router.replace("/journal/outlook");
  };

  const handleSave = async (data: OutlookRecord) => {
    try {
      await saveOutlook(data);
      toast.success(data.id ? "Outlook aktualisiert" : "Outlook angelegt");
      await reload();
    } catch {
      toast.error("Speichern fehlgeschlagen");
      throw new Error("save failed");
    }
  };

  /**
   * Statuswechsel läuft über den einzigen Schreibpfad: Signal (falls verknüpft),
   * Outlook und Backend-Lebenszyklus in einem Aufruf. Ohne den Backend-Teil
   * bliebe ein hier abgeschlossenes Setup im Screener sticky auf HIT — genau
   * der Fehler, der die Software vorher verstummen liess.
   *
   * Manuell angelegte Outlooks haben keine `signalId`: dann wird weder
   * `signals` geschrieben noch `markPair` gerufen, der Wechsel funktioniert
   * trotzdem vollständig.
   */
  const setStatus = async (o: OutlookRecord, next: SetupStatus) => {
    if (!o.id) return;
    try {
      await setSetupStatus({
        signalId: o.signalId ?? null,
        outlookId: o.id,
        pair: o.symbol,
        next,
      });
    } catch {
      toast.error("Statuswechsel unvollständig — bitte neu laden");
    }
    await reload();
  };

  // Kein Statuswechsel, deshalb bewusst direkt: der Stern ist eine reine
  // Markierung und berührt weder Lebenszyklus noch Backend.
  const toggleStar = async (o: OutlookRecord) => {
    if (!o.id) return;
    await updateOutlook(o.id, { isStarred: !o.isStarred });
    await reload();
  };

  const handleDelete = async (o: OutlookRecord) => {
    if (!o.id || !confirm(`Outlook ${o.symbol} löschen?`)) return;
    await removeOutlook(o.id);
    toast.success("Outlook gelöscht");
    if (fokusId === o.id) zurueckZurListe();
    await reload();
  };

  // Journalieren: Prefill in sessionStorage, dann ins Journal (Muster des alten Journals)
  const transferToJournal = (o: OutlookRecord) => {
    const notes = [
      `Outlook: ${o.thesis}`,
      o.fundamentalOutlook ? `Fundamental: ${o.fundamentalOutlook}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    sessionStorage.setItem(
      "tradePrefill",
      JSON.stringify({
        pair: o.symbol,
        direction: o.direction,
        notes,
        confluences: o.confluences || [],
        outlookId: o.id,
        signalId: o.signalId ?? null,
      }),
    );
    router.push("/journal");
  };

  /** Zone/Entry/SL/TP — in Liste und Detail identisch dargestellt. */
  const Levels = ({ o }: { o: OutlookRecord }) =>
    o.interestingZone || o.targetEntry || o.targetSl || o.targetTp ? (
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-muted">
        {o.interestingZone && <span>Zone {o.interestingZone}</span>}
        {o.targetEntry && <span>E {o.targetEntry}</span>}
        {o.targetSl && <span className="text-down">SL {o.targetSl}</span>}
        {o.targetTp && <span className="text-up">TP {o.targetTp}</span>}
      </div>
    ) : null;

  // ── Detailansicht: ein Setup, alles dazu ───────────────────────────────────
  if (fokus) {
    const statusCfg = OUTLOOK_STATUS_CONFIG[fokus.status];
    const signal = fokus.signalId ? signals[fokus.signalId] : undefined;
    const card = cardForOutlook(fokus, signal, quintiles);
    return (
      <div className="space-y-4 anim-fade-in max-w-[900px] mx-auto">
        <button
          onClick={zurueckZurListe}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-text transition-colors"
        >
          <i className="ph-bold ph-arrow-left" />
          Alle Outlooks
        </button>

        <Panel>
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => toggleStar(fokus)}
                className={`text-base ${fokus.isStarred ? "text-warn" : "text-faint hover:text-muted"}`}
                title="Favorit"
              >
                <i className={`ph-${fokus.isStarred ? "fill" : "bold"} ph-star`} />
              </button>
              <span className="font-bold text-[18px] font-mono">{fokus.symbol}</span>
              <Badge tone={fokus.direction === "long" ? "up" : "down"}>{fokus.direction}</Badge>
              <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
              <span className="ml-auto">
                <ConfidenceStars value={fokus.confidence} />
              </span>
            </div>

            <Herkunft outlook={fokus} signal={signal} />

            {/* Verdikt, Quintile, Linien-Info und High-Impact-Kalender —
                die Inhalte des früheren Cockpit-Popups. */}
            <FundamentalDetail
              card={card}
              rankingByCcy={rankingByCcy}
              eventsByCcy={eventsByCcy}
            />

            {fokus.thesis && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-faint mb-1">
                  These
                </div>
                <p className="text-[13px] text-text whitespace-pre-wrap">{fokus.thesis}</p>
              </div>
            )}

            {fokus.fundamentalOutlook && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-faint mb-1">
                  Fundamentale Einschätzung
                </div>
                <p className="text-[12px] text-muted whitespace-pre-wrap">
                  {fokus.fundamentalOutlook}
                </p>
              </div>
            )}

            <Levels o={fokus} />

            {(fokus.confluences?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {fokus.confluences!.map((c) => (
                  <span
                    key={c}
                    className="px-1.5 py-0.5 rounded bg-surface2 text-[10px] text-muted"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {(fokus.strategyChecklist?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-faint">
                  Checkliste {fokus.strategyChecklist!.filter((i) => i.checked).length}/
                  {fokus.strategyChecklist!.length}
                </div>
                {fokus.strategyChecklist!.map((item, i) => (
                  <div
                    key={item.ruleId || i}
                    className={`flex items-center gap-2 text-[12px] ${item.checked ? "text-text" : "text-faint"}`}
                  >
                    <i className={`ph-bold ${item.checked ? "ph-check-square" : "ph-square"}`} />
                    {item.text}
                  </div>
                ))}
              </div>
            )}

            <FundamentalsCompare symbol={fokus.symbol} fundamentals={fundamentals} />

            <div className="flex items-center gap-1 pt-3 border-t border-border/60">
              <StatusAktionen
                outlook={fokus}
                onStatus={setStatus}
                onJournal={transferToJournal}
              />
              <span className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditing(fokus);
                    setShowWizard(true);
                  }}
                  className="p-1.5 rounded text-faint hover:text-accent transition-colors"
                  title="Bearbeiten"
                >
                  <i className="ph-bold ph-pencil-simple" />
                </button>
                <button
                  onClick={() => handleDelete(fokus)}
                  className="p-1.5 rounded text-faint hover:text-down transition-colors"
                  title="Löschen"
                >
                  <i className="ph-bold ph-trash" />
                </button>
              </span>
            </div>
          </div>
        </Panel>

        {showWizard && (
          <OutlookWizardModal
            outlook={editing}
            onSave={handleSave}
            onClose={() => {
              setShowWizard(false);
              setEditing(undefined);
            }}
          />
        )}
      </div>
    );
  }

  // ── Listenansicht ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 anim-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { value: "all" as const, label: "Offen" },
            { value: "starred" as const, label: "★" },
            { value: "observation" as const, label: setupLabel("beobachtung") },
            { value: "waiting" as const, label: setupLabel("wartend") },
            { value: "active" as const, label: setupLabel("aktiv") },
            { value: "executed" as const, label: setupLabel("ausgefuehrt") },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="ml-auto flex items-center gap-2">
          {fundamentals?.updated != null && (
            <span className="text-[10px] text-faint font-mono">
              Fundamentals: {new Date(Number(fundamentals.updated) * 1000 || String(fundamentals.updated)).toLocaleString("de-DE")}
            </span>
          )}
          <Button size="sm" icon="ph-plus" onClick={() => setShowWizard(true)}>
            Neuer Outlook
          </Button>
        </div>
      </div>

      {loading ? (
        <Panel>
          <SkeletonRows rows={6} />
        </Panel>
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon="ph-binoculars"
            title="Keine Outlooks"
            description="Halte Trading-Thesen fest, bevor du handelst — Richtung, Level, Confluences, Checkliste. Jeder GVA-Hit legt hier automatisch einen Eintrag an."
            action={
              <Button icon="ph-plus" onClick={() => setShowWizard(true)}>
                Ersten Outlook anlegen
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((o) => {
            const statusCfg = OUTLOOK_STATUS_CONFIG[o.status];
            const signal = o.signalId ? signals[o.signalId] : undefined;
            return (
              <div
                key={o.id}
                id={`outlook-${o.id}`}
                className="bg-surface border border-border rounded-md p-4 flex flex-col gap-2 anim-slide-up"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleStar(o)}
                    className={`text-base ${o.isStarred ? "text-warn" : "text-faint hover:text-muted"}`}
                    title="Favorit"
                  >
                    <i className={`ph-${o.isStarred ? "fill" : "bold"} ph-star`} />
                  </button>
                  <button
                    onClick={() => oeffneDetail(o.id)}
                    className="font-semibold text-[14px] hover:text-accent transition-colors"
                    title="Details öffnen"
                  >
                    {o.symbol}
                  </button>
                  <Badge tone={o.direction === "long" ? "up" : "down"}>{o.direction}</Badge>
                  <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
                  <span className="ml-auto">
                    <ConfidenceStars value={o.confidence} />
                  </span>
                </div>

                <Herkunft outlook={o} signal={signal} />

                {o.thesis && <p className="text-[12px] text-muted line-clamp-3">{o.thesis}</p>}

                <Levels o={o} />

                {(o.confluences?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {o.confluences!.map((c) => (
                      <span key={c} className="px-1.5 py-0.5 rounded bg-surface2 text-[10px] text-muted">
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {(o.strategyChecklist?.length ?? 0) > 0 && (
                  <div className="text-[10px] text-muted font-mono">
                    Checkliste {o.strategyChecklist!.filter((i) => i.checked).length}/
                    {o.strategyChecklist!.length}
                  </div>
                )}

                <FundamentalsCompare symbol={o.symbol} fundamentals={fundamentals} />

                <div className="flex items-center gap-1 mt-auto pt-2 border-t border-border/60">
                  <StatusAktionen outlook={o} onStatus={setStatus} onJournal={transferToJournal} />
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditing(o);
                        setShowWizard(true);
                      }}
                      className="p-1.5 rounded text-faint hover:text-accent transition-colors"
                      title="Bearbeiten"
                    >
                      <i className="ph-bold ph-pencil-simple" />
                    </button>
                    <button
                      onClick={() => handleDelete(o)}
                      className="p-1.5 rounded text-faint hover:text-down transition-colors"
                      title="Löschen"
                    >
                      <i className="ph-bold ph-trash" />
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!fundamentals && !loading && (
        <p className="text-[11px] text-faint">
          Hinweis: `/api/fundamentals` (GVA-Backend) liefert noch keine Daten — Fundamental-Vergleich
          je Outlook erscheint automatisch, sobald der Endpoint live ist.
        </p>
      )}

      {showWizard && (
        <OutlookWizardModal
          outlook={editing}
          onSave={handleSave}
          onClose={() => {
            setShowWizard(false);
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
