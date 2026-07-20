import type { Freshness } from "@/lib/calc/realYield";

/**
 * Frische-Badge — eine Anzeige für alle Datenstände (Real Yield, Cockpit …).
 * Herausgelöst aus RealYieldView, damit es nicht zwei Frische-Darstellungen
 * gibt. Die Einstufung selbst kommt immer aus `freshnessOf`.
 *
 * Defaults = Real-Yield-Verhalten (unverändert). `labels`/`tones` überschreiben
 * Text bzw. Farbe, wenn eine andere Skala eine andere Sprache braucht.
 */

const DEFAULT_TONES: Record<Freshness, string> = {
  fresh: "bg-up/15 text-up",
  old: "bg-warn/15 text-warn",
  dead: "bg-down/15 text-down",
};

export default function FreshBadge({
  f,
  ageDays,
  labels,
  tones,
}: {
  f: Freshness;
  ageDays: number | null;
  labels?: Partial<Record<Freshness, string>>;
  tones?: Partial<Record<Freshness, string>>;
}) {
  const defaultLabel =
    f === "dead"
      ? "keine aktuellen Daten"
      : f === "old"
        ? `älterer Stand (${ageDays} T)`
        : "aktuell";
  const tone = tones?.[f] ?? DEFAULT_TONES[f];
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${tone}`}
    >
      {labels?.[f] ?? defaultLabel}
    </span>
  );
}
