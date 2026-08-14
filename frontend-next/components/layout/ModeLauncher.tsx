"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MODES, type AppMode } from "./nav";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Startseite des Labors: „woran arbeite ich gerade?"
 *
 * Früher standen hier fünf Modi mit vier Zählern, von denen drei aus dem
 * Journal und dem Cockpit kamen — offene Hits, unbewertete Trades, offene
 * Replay-Sessions. Diese Bereiche liegen seit dem 13.08.2026 in KerimOS
 * (siehe ../../TRADING-UMBAU.md); übrig bleibt der eine Zähler, der zum Labor
 * gehört: wann die Engine zuletzt gerechnet hat.
 *
 * **Nichts darf den Launcher blockieren.** Die Nacht-Angabe kommt bereits
 * fertig vom Server, der Rest ist ein einzelner, abgesicherter Aufruf für den
 * Vornamen. Das Render-Backend wird hier gar nicht mehr gefragt.
 */

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

  const zaehlerFor = (mode: AppMode): Zaehler | null =>
    mode.badge === "letzteNacht" ? nachtZaehler : null;

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center anim-fade-in">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-accent mb-2.5">
        {datumLabel}
      </div>
      <h1 className="text-[42px] sm:text-[52px] font-bold tracking-[-1.5px] leading-none mb-1.5">
        {begruessung}
        {vorname ? `, ${vorname}.` : "."}
      </h1>
      <p className="text-[14.5px] text-muted mb-12 max-w-[480px]">
        Labor für Machine Learning, Quant-Auswertung und Fundamentaldaten.
        Gehandelt wird nebenan in KerimOS — hier wird gemessen.
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

      <a
        href="https://kerimos.vercel.app/trading"
        className="mt-10 text-[12.5px] text-faint hover:text-muted transition-colors"
      >
        → Zum Trading in KerimOS
      </a>
    </div>
  );
}
