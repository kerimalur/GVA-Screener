// Zentrale Chart-Farben — Single Source: identische Werte wie globals.css @theme.
// Recharts braucht konkrete Farbstrings (SVG-Attribute), daher hier gespiegelt;
// Änderungen IMMER in beiden Dateien nachziehen.
export const chart = {
  grid: "rgba(255,255,255,0.05)",
  axis: "rgba(255,255,255,0.10)",
  text: "#8d94a3",   // --color-muted
  faint: "#565d6b",  // --color-faint
  up: "#3ddc97",     // --color-up
  down: "#ef6461",   // --color-down
  accent: "#6c8cff", // --color-accent
  warn: "#f5a623",   // --color-warn
  neutral: "#565d6b",
  surface: "#131519", // --color-surface
  border: "rgba(255,255,255,0.07)",
  // Serien-Palette: Akzent + abgestufte Grautöne + semantische Farben —
  // bewusst reduziert (Terminal-Stil), keine bunte Default-Palette.
  // dataviz-Validator (dark, Surface #131519): CVD-Separation 18.9 PASS,
  // Kontrast >=3:1 PASS; Grau-Serien sind zusätzlich per Legende/Label benannt.
  palette: ["#6c8cff", "#c8cdd8", "#8d94a3", "#5d6472", "#3ddc97", "#ef6461", "#f5a623"],
} as const;

export const tooltipStyle = {
  backgroundColor: "#191c22", // --color-surface2
  border: "1px solid rgba(255,255,255,0.14)", // --color-border2
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "#f2f3f5", // --color-text
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
