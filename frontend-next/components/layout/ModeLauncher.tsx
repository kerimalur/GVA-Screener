"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MODES, type AppMode } from "./nav";
import { fetchScreener } from "@/lib/gva/api";
import { loadSignals } from "@/lib/journal/signals";
import { loadGvaOutlooks, loadOpenManualOutlooks, outlooksBySignal } from "@/lib/journal/outlooks";
import { countTradesWithoutAdherence } from "@/lib/journal/trades";
import { assembleLanes } from "@/lib/cockpit/board";

/**
 * Startseite: „was mache ich heute?"
 *
 * Die Sidebar zeigte ~20 Einträge gleichzeitig und stellte damit bei jedem
 * Seitenaufruf dieselbe Frage neu. Hier wird sie einmal beantwortet — danach
 * sieht man nur noch die Seiten des gewählten Modus.
 *
 * **Nichts darf den Launcher blockieren.** Jede Zahl kommt aus einem eigenen,
 * einzeln abgesicherten Fetch; scheitert einer, fehlt genau sein Badge und der
 * Rest ist sofort bedienbar. Das Render-Backend schläft nach 15 min ein — beim
 * Kaltstart wartet die Statuszeile, die Kacheln nicht.
 */

const GVA_API = (
  process.env.NEXT_PUBLIC_GVA_API_URL || "https://gva-screener.onrender.com"
).replace(/\/+$/, "");

interface Zaehler {
  getroffen: number;
  naehert: number;
  beobachtet: number;
}

interface Badges {
  offeneHits: number | null;
  ohneAdherence: number | null;
  offeneReplays: number | null;
}

function Kachel({
  mode,
  badge,
}: {
  mode: AppMode;
  badge: { text: string; betont: boolean } | null;
}) {
  return (
    <Link
      href={mode.base}
      className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 hover:border-faint transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-surface2 text-accent">
          <i className={`ph-bold ${mode.icon} text-[17px]`} />
        </span>
        <span className="text-[15px] font-bold tracking-tight">{mode.label}</span>
        <i className="ph-bold ph-arrow-right ml-auto text-[13px] text-faint group-hover:text-text transition-colors" />
      </div>
      <p className="text-[11.5px] text-muted leading-snug">{mode.summary}</p>
      {badge && (
        <span
          className={`self-start px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
            badge.betont ? "bg-accent/15 text-accent" : "bg-surface2 text-muted"
          }`}
        >
          {badge.text}
        </span>
      )}
    </Link>
  );
}

function StatusZahl({
  label,
  wert,
  tone,
}: {
  label: string;
  wert: number | null;
  tone: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`font-mono text-[16px] font-bold ${tone}`}>{wert ?? "–"}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

export default function ModeLauncher({
  letzteNacht,
  nachtIstNeu,
}: {
  /** Datum der zuletzt ausgewerteten ML-Nacht ('YYYY-MM-DD'), null = keine. */
  letzteNacht: string | null;
  /** höchstens einen Tag alt — serverseitig bestimmt (Render bleibt pur). */
  nachtIstNeu: boolean;
}) {
  const [zaehler, setZaehler] = useState<Zaehler | null>(null);
  const [badges, setBadges] = useState<Badges>({
    offeneHits: null,
    ohneAdherence: null,
    offeneReplays: null,
  });
  const aliveRef = useRef(true);

  /**
   * Dieselben Loader wie im Cockpit, dieselbe Lane-Assembly — die Statuszeile
   * darf nicht ihre eigene Vorstellung davon haben, was „ein aktives Setup" ist.
   * Der Scanner ist optional: ohne ihn fehlt nur „nähert sich".
   */
  const ladeStatus = useCallback(async () => {
    const [scanner, neu, watch, gva, manuell] = await Promise.all([
      fetchScreener().then((s) => s.data).catch(() => []),
      loadSignals("new").catch(() => []),
      loadSignals("watchlist").catch(() => []),
      loadGvaOutlooks().catch(() => []),
      loadOpenManualOutlooks().catch(() => []),
    ]);
    if (!aliveRef.current) return;
    const lanes = assembleLanes(
      scanner,
      [...neu, ...watch],
      {},
      outlooksBySignal(gva),
      manuell,
    );
    setZaehler({
      getroffen: lanes.getroffen.length,
      naehert: lanes.naehert.length,
      beobachtet: lanes.watchlist.length + lanes.inArbeit.length,
    });
    setBadges((b) => ({ ...b, offeneHits: lanes.getroffen.length }));
  }, []);

  useEffect(() => {
    aliveRef.current = true;

    void ladeStatus().catch(() => {});

    countTradesWithoutAdherence()
      .then((n) => aliveRef.current && setBadges((b) => ({ ...b, ohneAdherence: n })))
      .catch(() => {});

    // Replay-Sessions liegen im FastAPI-Backend (Render). Beim Kaltstart kann
    // das lange dauern — deshalb strikt nebenläufig und ohne Fehlerpfad.
    fetch(`${GVA_API}/replay/sessions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { status?: string }[]) => {
        if (!aliveRef.current || !Array.isArray(rows)) return;
        const offen = rows.filter((s) => s.status !== "done").length;
        setBadges((b) => ({ ...b, offeneReplays: offen }));
      })
      .catch(() => {});

    return () => {
      aliveRef.current = false;
    };
  }, [ladeStatus]);

  const nachtBadge = (() => {
    if (!letzteNacht) return null;
    const datum = `${letzteNacht.slice(8, 10)}.${letzteNacht.slice(5, 7)}.`;
    return nachtIstNeu
      ? { text: `Nacht ${datum} ausgewertet`, betont: true }
      : { text: `letzte Nacht ${datum}`, betont: false };
  })();

  const badgeFor = (mode: AppMode): { text: string; betont: boolean } | null => {
    switch (mode.badge) {
      case "offeneHits":
        return badges.offeneHits ? { text: `${badges.offeneHits} offene Hits`, betont: true } : null;
      case "ohneAdherence":
        return badges.ohneAdherence
          ? { text: `${badges.ohneAdherence} ohne Adherence`, betont: false }
          : null;
      case "offeneReplays":
        return badges.offeneReplays
          ? { text: `${badges.offeneReplays} offene Sessions`, betont: false }
          : null;
      case "letzteNacht":
        return nachtBadge;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      {/* Live-Statuszeile: was gerade los ist, bevor man irgendwo hinklickt. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3">
        <StatusZahl label="getroffen" wert={zaehler?.getroffen ?? null} tone="text-warn" />
        <StatusZahl label="nähert sich" wert={zaehler?.naehert ?? null} tone="text-text" />
        <StatusZahl
          label="in Beobachtung"
          wert={zaehler?.beobachtet ?? null}
          tone="text-muted"
        />
        {zaehler === null && (
          <span className="text-[10px] font-mono text-faint">lädt …</span>
        )}
        <Link
          href="/cockpit"
          className="ml-auto text-[11.5px] text-accent hover:underline inline-flex items-center gap-1"
        >
          Zum Cockpit <i className="ph-bold ph-arrow-right text-[11px]" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m) => (
          <Kachel key={m.key} mode={m} badge={badgeFor(m)} />
        ))}
      </div>
    </div>
  );
}
