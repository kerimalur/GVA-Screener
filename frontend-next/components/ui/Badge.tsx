import type { ReactNode } from "react";

type Tone = "up" | "down" | "warn" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  up: "bg-up/10 text-up border-up/30",
  down: "bg-down/10 text-down border-down/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  accent: "bg-accent/10 text-accent border-accent/30",
  neutral: "bg-surface2 text-muted border-border2",
};

export default function Badge({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: Tone;
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${TONES[tone]} ${className}`}
    >
      {icon && <i className={`ph-bold ${icon}`} />}
      {children}
    </span>
  );
}
