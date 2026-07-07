"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Panel from "@/components/layout/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import { loadSignals, setSignalStatus, type SignalRecord } from "@/lib/journal/signals";
import { fundamentalsNote } from "@/lib/journal/fundamentals";

type Filter = "new" | "journaled" | "dismissed" | "all";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SignalsInbox() {
  const router = useRouter();
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("new");
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSignals(await loadSignals(filter === "all" ? undefined : filter));
    } catch {
      toast.error("Fehler beim Laden der Signale");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten-Fetch bei Mount/Filterwechsel
    reload();
  }, [reload]);

  // Journalieren: TradeForm-Prefill (Pair, Datum, Setup "GVA", Fundamental-Snapshot)
  const journalize = async (s: SignalRecord) => {
    const snap = s.fundamentalSnapshot;
    const lineTxt = s.lineType ? `${s.lineType.toUpperCase()}-Line` : "Line";
    const notes = [
      `GVA-Signal: ${lineTxt} ${s.lineLevel} getroffen am ${fmtWhen(s.hitAt)}`,
      snap?.base ? `${snap.base.code}: ${fundamentalsNote(snap.base)}` : "",
      snap?.quote ? `${snap.quote.code}: ${fundamentalsNote(snap.quote)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await setSignalStatus(s.id, "journaled");
    } catch {
      toast.error("Status-Update fehlgeschlagen");
      return;
    }
    sessionStorage.setItem(
      "tradePrefill",
      JSON.stringify({
        pair: s.pair,
        direction: s.lineType === "short" ? "short" : "long",
        date: s.hitAt.split("T")[0],
        notes,
        setups: ["setup_3day_gva"],
        signalId: s.id,
      }),
    );
    router.push("/journal");
  };

  const dismiss = async (s: SignalRecord) => {
    try {
      await setSignalStatus(s.id, "dismissed");
      setSignals((prev) => prev.filter((x) => x.id !== s.id));
    } catch {
      toast.error("Verwerfen fehlgeschlagen");
    }
  };

  return (
    <div className="space-y-4 anim-fade-in">
      <div className="flex items-center gap-3">
        <Segmented
          options={[
            { value: "new" as const, label: "Neu" },
            { value: "journaled" as const, label: "Journaliert" },
            { value: "dismissed" as const, label: "Verworfen" },
            { value: "all" as const, label: "Alle" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <Button variant="ghost" size="sm" icon="ph-arrows-clockwise" className="ml-auto" onClick={reload}>
          Aktualisieren
        </Button>
      </div>

      {loading ? (
        <Panel>
          <SkeletonRows rows={5} />
        </Panel>
      ) : signals.length === 0 ? (
        <Panel>
          <EmptyState
            icon="ph-tray"
            title={filter === "new" ? "Keine neuen Signale" : "Keine Signale"}
            description="Jeder GVA-Line-HIT des Scanners landet hier automatisch — zusätzlich zum Telegram-Alert."
          />
        </Panel>
      ) : (
        <div className="space-y-2">
          {signals.map((s) => {
            const snap = s.fundamentalSnapshot;
            const isOpen = expanded === s.id;
            return (
              <div
                key={s.id}
                className="bg-surface border border-border rounded-md p-3.5 anim-slide-up"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-[14px]">{s.pair}</span>
                  {s.lineType && (
                    <Badge tone={s.lineType === "long" ? "up" : "down"}>
                      {s.lineType} Line
                    </Badge>
                  )}
                  <span className="text-[12px] font-mono text-muted">
                    Level {s.lineLevel}
                  </span>
                  <span className="text-[11px] font-mono text-faint">{fmtWhen(s.hitAt)}</span>
                  {s.status !== "new" && (
                    <Badge tone={s.status === "journaled" ? "accent" : "neutral"}>
                      {s.status === "journaled" ? "journaliert" : "verworfen"}
                    </Badge>
                  )}

                  <span className="ml-auto flex items-center gap-1.5">
                    {s.status === "new" && (
                      <>
                        <Button size="sm" icon="ph-notebook" onClick={() => journalize(s)}>
                          Journalieren
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          icon="ph-clock"
                          title="Bleibt als neu markiert"
                          onClick={() => setExpanded(isOpen ? null : s.id)}
                        >
                          Später ansehen
                        </Button>
                        <Button variant="ghost" size="sm" icon="ph-x" onClick={() => dismiss(s)}>
                          Verwerfen
                        </Button>
                      </>
                    )}
                    {snap && s.status !== "new" && (
                      <button
                        onClick={() => setExpanded(isOpen ? null : s.id)}
                        className="p-1.5 rounded text-faint hover:text-text transition-colors"
                        aria-label="Details"
                      >
                        <i className={`ph-bold ph-caret-${isOpen ? "up" : "down"}`} />
                      </button>
                    )}
                  </span>
                </div>

                {isOpen && snap && (
                  <div className="mt-3 pt-3 border-t border-border/60 grid md:grid-cols-2 gap-2 text-[11px] font-mono">
                    {[snap.base, snap.quote].filter(Boolean).map((c) => (
                      <div key={c!.code} className="flex items-start gap-2">
                        <span className="font-bold text-muted w-9 shrink-0">{c!.code}</span>
                        <span className="text-text">{fundamentalsNote(c)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
