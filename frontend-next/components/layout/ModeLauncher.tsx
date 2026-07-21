"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MODES, type AppMode } from "./nav";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { fetchScreener } from "@/lib/gva/api";
import { loadSignals } from "@/lib/journal/signals";
import { loadGvaOutlooks, loadOpenManualOutlooks, outlooksBySignal } from "@/lib/journal/outlooks";
import { countTradesWithoutAdherence } from "@/lib/journal/trades";
import { assembleLanes } from "@/lib/cockpit/board";

/**
 * Startseite: „was mache ich heute?"
 *
 * Die Sidebar zeigte ~20 Einträge gleichzeitig und stellte damit bei jedem
 * Seitenaufruf dieselbe Frage neu. Hier wird sie einmal beantwortet — als
 * nummerierte Liste, nicht als Kachel-Raster: fünf Zeilen liest man von oben
 * nach unten, fünf Kacheln muss man absuchen.
 *
 * **Nichts darf den Launcher blockieren.** Jede Zahl kommt aus einem eigenen,
 * einzeln abgesicherten Fetch; scheitert einer, fehlt genau sein Zähler und der
 * Rest ist sofort bedienbar. Das Render-Backend schläft nach 15 min ein — die
 * Liste wartet nie darauf.
 */

const GVA_API = (
  process.env.NEXT_PUBLIC_GVA_API_URL || "https://gva-screener.onrender.com"
).replace(/\/+$/, "");

interface Badges {
  offeneHits: number | null;
  ohneAdherence: number | null;
  offeneReplays: number | null;
}

/** Zähler rechts in der Zeile. `tone` trägt die Dringlichkeit, nicht die Zahl. */
interface Zaehler {
  text: string;
  tone: string;
}

function ModusZeile({
  mode,
  nummer,
  zaehler,
  letzte,
}: {
  mode: AppMode;
  nummer: number;
  zaehler: Zaehler | null;
  letzte: boolean;
}) {
  return (
    <Link
      href={mode.base}
      className={`group flex items-center gap-5 py-5 px-1 border-t border-border transition-colors hover:bg-active/40 ${
        letzte ? "border-b" : ""
      }`}
    >
      <span className="font-mono text-[13px] text-faint w-6 shrink-0">
        {String(nummer).padStart(2, "0")}
      </span>
      <i className={`ph-bold ${mode.icon} text-[20px] w-7 shrink-0`} />
      <span className="flex-1 min-w-0">
        <span className="block text-[17px] font-bold tracking-tight">{mode.label}</span>
        <span className="block text-[12.5px] text-muted truncate">{mode.summary}</span>
      </span>
      {zaehler && (
        <span className={`font-mono text-[13px] font-bold shrink-0 ${zaehler.tone}`}>
          {zaehler.text}
        </span>
      )}
      <i className="ph-bold ph-arrow-right text-[15px] text-faint group-hover:text-text transition-colors shrink-0" />
    </Link>
  );
}

export default function ModeLauncher({
  datumLabel,
  begruessung,
  letzteNacht,
  nachtIstNeu,
}: {
  /** z.B. „Dienstag · 21. Juli" — serverseitig gebildet (Zeitzone Europe/Zurich). */
  datumLabel: string;
  /** „Guten Morgen" / „Guten Tag" / „Guten Abend" — ebenfalls vom Server. */
  begruessung: string;
  /** Datum der zuletzt ausgewerteten ML-Nacht ('YYYY-MM-DD'), null = keine. */
  letzteNacht: string | null;
  /** höchstens zwei Tage alt — serverseitig bestimmt (Render bleibt pur). */
  nachtIstNeu: boolean;
}) {
  const [vorname, setVorname] = useState("");
  const [badges, setBadges] = useState<Badges>({
    offeneHits: null,
    ohneAdherence: null,
    offeneReplays: null,
  });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!aliveRef.current || !user) return;
      const name =
        user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0];
      if (name) setVorname(String(name).split(" ")[0]);
    });

    // Offene Hits: dieselben Loader und dieselbe Lane-Assembly wie im Cockpit —
    // der Launcher darf keine eigene Vorstellung davon haben, was ein offenes
    // Setup ist. Der Scanner ist optional.
    Promise.all([
      fetchScreener().then((s) => s.data).catch(() => []),
      loadSignals("new").catch(() => []),
      loadSignals("watchlist").catch(() => []),
      loadGvaOutlooks().catch(() => []),
      loadOpenManualOutlooks().catch(() => []),
    ])
      .then(([scanner, neu, watch, gva, manuell]) => {
        if (!aliveRef.current) return;
        const lanes = assembleLanes(scanner, [...neu, ...watch], {}, outlooksBySignal(gva), manuell);
        setBadges((b) => ({ ...b, offeneHits: lanes.getroffen.length }));
      })
      .catch(() => {});

    countTradesWithoutAdherence()
      .then((n) => aliveRef.current && setBadges((b) => ({ ...b, ohneAdherence: n })))
      .catch(() => {});

    // Replay-Sessions liegen im FastAPI-Backend (Render). Beim Kaltstart kann
    // das lange dauern — deshalb strikt nebenläufig und ohne Fehlerpfad.
    fetch(`${GVA_API}/replay/sessions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { status?: string }[]) => {
        if (!aliveRef.current || !Array.isArray(rows)) return;
        setBadges((b) => ({ ...b, offeneReplays: rows.filter((s) => s.status !== "done").length }));
      })
      .catch(() => {});

    return () => {
      aliveRef.current = false;
    };
  }, []);

  const nachtZaehler: Zaehler | null = letzteNacht
    ? {
        text: nachtIstNeu
          ? "neue Nacht"
          : `${letzteNacht.slice(8, 10)}.${letzteNacht.slice(5, 7)}.`,
        tone: nachtIstNeu ? "text-accent" : "text-muted",
      }
    : null;

  const zaehlerFor = (mode: AppMode): Zaehler | null => {
    switch (mode.badge) {
      case "offeneHits":
        return badges.offeneHits
          ? { text: `${badges.offeneHits} Hits`, tone: "text-up" }
          : null;
      case "ohneAdherence":
        return badges.ohneAdherence
          ? { text: `${badges.ohneAdherence} offen`, tone: "text-warn" }
          : null;
      case "offeneReplays":
        return badges.offeneReplays
          ? { text: `${badges.offeneReplays} offen`, tone: "text-muted" }
          : null;
      case "letzteNacht":
        return nachtZaehler;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center anim-fade-in">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-accent mb-2.5">
        {datumLabel}
      </div>
      <h1 className="text-[42px] sm:text-[52px] font-bold tracking-[-1.5px] leading-none mb-1.5">
        {begruessung}
        {vorname ? `, ${vorname}.` : "."}
      </h1>
      <p className="text-[14.5px] text-muted mb-12">
        Fünf Modi, ein Fokus pro Klick. Wähle, was heute zählt.
      </p>

      <div className="w-full max-w-[640px] text-left">
        {MODES.map((m, i) => (
          <ModusZeile
            key={m.key}
            mode={m}
            nummer={i + 1}
            zaehler={zaehlerFor(m)}
            letzte={i === MODES.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
