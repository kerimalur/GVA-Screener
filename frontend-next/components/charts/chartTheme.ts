// Zentrale Chart-Farben — Single Source: identische Werte wie globals.css @theme.
// Recharts braucht konkrete Farbstrings (SVG-Attribute), daher hier gespiegelt;
// Änderungen IMMER in beiden Dateien nachziehen.
export const chart = {
  grid: "rgba(255,255,255,0.07)",
  axis: "rgba(255,255,255,0.14)",
  text: "#a89f8b",   // --color-muted
  faint: "#87806f",  // --color-faint
  up: "#4fd88a",     // --color-up
  down: "#f0665c",   // --color-down
  accent: "#e08a3c", // --color-accent (Hauptserie); kein Blau in der Palette
  warn: "#d9b23c",   // --color-warn
  neutral: "#87806f", // --color-neutral
  surface: "#2c2820", // --color-surface
  border: "rgba(255,255,255,0.12)", // --color-border
  // Serien-Palette: Akzent + semantische Farben + warme Sand-Abstufungen,
  // verschränkt angeordnet (ähnliche Töne nie benachbart). Serien sind
  // zusätzlich per Legende/Label benannt, Farbe ist nie der einzige Träger.
  palette: ["#e08a3c", "#4fd88a", "#ece7da", "#f0665c", "#a89f8b", "#d9b23c", "#6f6858"],
} as const;

export const tooltipStyle = {
  backgroundColor: "#1a1714", // --color-surface2
  border: "1px solid rgba(255,255,255,0.20)", // --color-border2
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "#ece7da", // --color-text
} as const;

export function fmtNumber(v: number, digits = 2): string {
  return v.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(Math.abs(v) < 10 ? 2 : 0);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

export type Timeframe = "1M" | "6M" | "1J" | "5J" | "Max";
export const TIMEFRAMES: Timeframe[] = ["1M", "6M", "1J", "5J", "Max"];

export function timeframeCutoff(tf: Timeframe): string | null {
  const now = new Date();
  switch (tf) {
    case "1M": now.setMonth(now.getMonth() - 1); break;
    case "6M": now.setMonth(now.getMonth() - 6); break;
    case "1J": now.setFullYear(now.getFullYear() - 1); break;
    case "5J": now.setFullYear(now.getFullYear() - 5); break;
    case "Max": return null;
  }
  return now.toISOString().slice(0, 10);
}
