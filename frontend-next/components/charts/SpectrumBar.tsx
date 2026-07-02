"use client";

interface SpectrumBarProps {
  /** -10 (sehr dovish) … +10 (sehr hawkish) */
  score: number;
  label: string;
  sublabel?: string;
  title?: string;
}

/** Horizontaler Dovish↔Hawkish-Spektrum-Balken mit Marker. */
export default function SpectrumBar({ score, label, sublabel, title }: SpectrumBarProps) {
  const clamped = Math.max(-10, Math.min(10, score));
  const pct = ((clamped + 10) / 20) * 100;
  const color =
    clamped > 2 ? "bg-up" : clamped < -2 ? "bg-down" : "bg-warn";

  return (
    <div className="flex items-center gap-3" title={title}>
      <div className="w-14 shrink-0">
        <div className="text-[12px] font-bold font-mono">{label}</div>
        {sublabel && <div className="text-[10px] text-muted">{sublabel}</div>}
      </div>
      <div className="flex-1 relative h-2 rounded-full bg-gradient-to-r from-down/50 via-warn/40 to-up/50">
        {/* Nulllinie */}
        <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-px h-3.5 bg-faint" />
        {/* Marker */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-bg shadow ${color}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="w-12 text-right font-mono text-[12px] font-bold shrink-0">
        {clamped > 0 ? "+" : ""}
        {clamped.toFixed(1)}
      </div>
    </div>
  );
}
