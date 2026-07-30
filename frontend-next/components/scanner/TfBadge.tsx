import type { GvaTf } from "@/lib/gva/api";

/** Timeframe-Badge einer GVA-Linie: 3D-Chart oder Wochenchart.
 *  Fehlendes Tag = Altbestand aus der Zeit vor dem Weekly-Scan -> "3D". */
export default function TfBadge({
  tf,
  className = "",
}: {
  tf?: GvaTf | null;
  className?: string;
}) {
  const weekly = tf === "W";
  return (
    <span
      className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded uppercase ${
        weekly ? "bg-accent/20 text-accent" : "bg-surface2 text-muted"
      } ${className}`}
      title={weekly ? "GVA aus dem Wochenchart" : "GVA aus dem 3-Tages-Chart"}
    >
      {weekly ? "Woche" : "3D"}
    </span>
  );
}
