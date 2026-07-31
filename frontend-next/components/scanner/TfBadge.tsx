import type { GvaTf } from "@/lib/gva/api";

/**
 * Timeframe-Badge einer GVA-Linie: 3D-Chart oder Wochenchart.
 * Fehlendes Tag = Altbestand aus der Zeit vor dem Weekly-Scan -> "3D".
 *
 * `onColor` für Kacheln mit farbigem Hintergrund (Hit/Prepare in der Heatmap):
 * dort haben die Flächenfarben des Themes zu wenig Kontrast, deshalb eine
 * abgedunkelte Fläche mit weisser Schrift statt der Theme-Tokens.
 */
export default function TfBadge({
  tf,
  onColor = false,
  className = "",
}: {
  tf?: GvaTf | null;
  onColor?: boolean;
  className?: string;
}) {
  const weekly = tf === "W";

  const stil = onColor
    ? "bg-black/35 text-white ring-1 ring-white/25"
    : weekly
      ? "bg-accent/20 text-accent ring-1 ring-accent/40"
      : "bg-surface2 text-text ring-1 ring-border";

  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${stil} ${className}`}
      title={weekly ? "GVA aus dem Wochenchart" : "GVA aus dem 3-Tages-Chart"}
    >
      {weekly ? "Woche" : "3D"}
    </span>
  );
}
