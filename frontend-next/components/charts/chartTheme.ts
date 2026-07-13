// Zentrale Chart-Farben — Single Source: identische Werte wie globals.css @theme.
// Recharts braucht konkrete Farbstrings (SVG-Attribute), daher hier gespiegelt;
// Änderungen IMMER in beiden Dateien nachziehen.
export const chart = {
  grid: "rgba(255,255,255,0.08)",
  axis: "rgba(255,255,255,0.15)",
  text: "#d6d5d0",   // --color-muted
  faint: "#b0afa8",  // --color-faint
  up: "#46d275",     // --color-up
  down: "#f05b52",   // --color-down
  accent: "#ffffff", // Hauptserie weiß — kein Blau in der Palette
  warn: "#f5a623",   // --color-warn
  neutral: "#b0afa8",
  surface: "#414141", // --color-surface
  border: "rgba(255,255,255,0.30)",
  // Serien-Palette: Weiß + Grau-Abstufungen + semantische Farben, verschränkt
  // angeordnet (ähnliche Töne nie benachbart). dataviz-Validator (dark,
  // Surface #3a3a3a): CVD-Separation 26.7 PASS, Kontrast >=3:1 PASS;
  // Serien sind zusätzlich per Legende/Label benannt.
  palette: ["#ffffff", "#46d275", "#d6d5d0", "#f05b52", "#a8a7a0", "#f5a623", "#8a897f"],
} as const;

export const tooltipStyle = {
  backgroundColor: "#3a3a3a", // --color-surface2
  border: "1px solid rgba(255,255,255,0.50)", // --color-border2
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "#ffffff", // --color-text
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
