// Zentrale Chart-Farben/-Konstanten (deckungsgleich mit globals.css @theme)
export const chart = {
  grid: "#1e2530",
  axis: "#30363d",
  text: "#8b949e",
  faint: "#484f58",
  up: "#3fb950",
  down: "#f85149",
  accent: "#58a6ff",
  warn: "#d29922",
  neutral: "#6e7681",
  surface: "#161b22",
  border: "#21262d",
  // Serien-Palette für Multi-Line-Charts
  palette: ["#58a6ff", "#3fb950", "#f85149", "#d29922", "#bc8cff", "#39c5cf", "#ff7b72", "#7ee787"],
} as const;

export const tooltipStyle = {
  backgroundColor: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "#e6edf3",
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
