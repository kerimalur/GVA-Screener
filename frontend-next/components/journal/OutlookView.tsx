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
import {
  fetchFundamentals,
  splitPair,
  type FundamentalsData,
} from "@/lib/journal/fundamentals";

type StatusFilter = "all" | "starred" | OutlookStatus;

function ConfidenceStars({ value }: { value: number }) {
  return (
    <span className="text-warn text-[11px]">
      {"★".repeat(value)}
      <span className="text-faint">{"★".repeat(Math.max(0, 5 - value))}</span>
    </span>
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

export default function OutlookView() {
  const router = useRouter();
  const [outlooks, setOutlooks] = useState<OutlookRecord[]>([]);
  const [fundamentals, setFundamentals] = useState<FundamentalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showWizard, setShowWizard] = useState(false);
  const [editing, setEditing] = useState<OutlookRecord | undefined>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setOutlooks(await loadOutlooks());
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
    if (filter === "all") return sorted.filter((o) => o.status !== "cancelled" && o.status !== "executed");
    if (filter === "starred") return sorted.filter((o) => o.isStarred);
    return sorted.filter((o) => o.status === filter);
  }, [outlooks, filter]);

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

  const setStatus = async (o: OutlookRecord, status: OutlookStatus) => {
    if (!o.id) return;
    await updateOutlook(o.id, {
      status,
      ...(status === "active" ? { startedAt: new Date().toISOString() } : {}),
    });
    await reload();
  };

  const toggleStar = async (o: OutlookRecord) => {
    if (!o.id) return;
    await updateOutlook(o.id, { isStarred: !o.isStarred });
    await reload();
  };

  const handleDelete = async (o: OutlookRecord) => {
    if (!o.id || !confirm(`Outlook ${o.symbol} löschen?`)) return;
    await removeOutlook(o.id);
    toast.success("Outlook gelöscht");
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
      }),
    );
    router.push("/journal");
  };

  return (
    <div className="space-y-4 anim-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { value: "all" as const, label: "Offen" },
            { value: "starred" as const, label: "★" },
            { value: "observation" as const, label: "Beobachtung" },
            { value: "waiting" as const, label: "Wartend" },
            { value: "active" as const, label: "Aktiv" },
            { value: "executed" as const, label: "Ausgeführt" },
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
            icon="ph-crosshair"
            title="Keine Outlooks"
            description="Halte Trading-Thesen fest, bevor du handelst — Richtung, Level, Confluences, Checkliste."
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
            return (
              <div
                key={o.id}
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
                  <span className="font-semibold text-[14px]">{o.symbol}</span>
                  <Badge tone={o.direction === "long" ? "up" : "down"}>{o.direction}</Badge>
                  <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
                  <span className="ml-auto">
                    <ConfidenceStars value={o.confidence} />
                  </span>
                </div>

                {o.thesis && <p className="text-[12px] text-muted line-clamp-3">{o.thesis}</p>}

                {(o.interestingZone || o.targetEntry || o.targetSl || o.targetTp) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-muted">
                    {o.interestingZone && <span>Zone {o.interestingZone}</span>}
                    {o.targetEntry && <span>E {o.targetEntry}</span>}
                    {o.targetSl && <span className="text-down">SL {o.targetSl}</span>}
                    {o.targetTp && <span className="text-up">TP {o.targetTp}</span>}
                  </div>
                )}

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
                  {o.status === "observation" && (
                    <Button variant="subtle" size="sm" onClick={() => setStatus(o, "waiting")}>
                      Wartend
                    </Button>
                  )}
                  {(o.status === "observation" || o.status === "waiting") && (
                    <Button variant="subtle" size="sm" onClick={() => setStatus(o, "active")}>
                      Aktiv
                    </Button>
                  )}
                  {o.status === "active" && (
                    <Button variant="primary" size="sm" icon="ph-notebook" onClick={() => transferToJournal(o)}>
                      Journalieren
                    </Button>
                  )}
                  {o.status !== "cancelled" && o.status !== "executed" && (
                    <Button variant="ghost" size="sm" onClick={() => setStatus(o, "cancelled")}>
                      Abbrechen
                    </Button>
                  )}
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
