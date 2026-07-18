/**
 * Gemeinsame Typen/URL-Bauer für den Fundamental-Track-Endpoint des Backends
 * (`/replay/fundamental-track`, Render). Genutzt von FundamentalTrack (Einzel-
 * Pair-Ansicht) und SetupFinder (Ranking-Modus über alle 28 Pairs) — eine
 * Quelle, kein dupliziertes Mapping.
 */

export const TRACK_API = (
  process.env.NEXT_PUBLIC_GVA_API_URL || "https://gva-screener.onrender.com"
).replace(/\/+$/, "");

export interface TrackWeek {
  week_start: string;
  base_q: number;
  base_score: number;
  quote_q: number;
  quote_score: number;
  bias: "long" | "short" | "neutral";
  ret_1w: number | null;
  hit_1w: boolean | null;
  ret_4w: number | null;
  hit_4w: boolean | null;
}

export interface TrackSummary {
  n: number;
  hits: number;
  rate: number | null;
}

export interface Track {
  pair: string;
  base_ccy: string;
  quote_ccy: string;
  weeks: TrackWeek[];
  summary: { h1?: TrackSummary; h4?: TrackSummary };
}

export const RANGE_PRESETS = [
  { key: "52", label: "52 Wochen", weeks: 52 },
  { key: "104", label: "2 Jahre", weeks: 104 },
  { key: "260", label: "5 Jahre", weeks: 260 },
  { key: "520", label: "10 Jahre", weeks: 520 },
  { key: "custom", label: "Eigener Zeitraum", weeks: 0 },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"];

/** URL für ein Pair; null = Custom-Range noch unvollständig (nicht laden). */
export function trackUrl(pair: string, range: RangeKey, from: string, to: string): string | null {
  if (range === "custom") {
    return from && to
      ? `${TRACK_API}/replay/fundamental-track?pair=${pair}&from=${from}&to=${to}`
      : null;
  }
  return `${TRACK_API}/replay/fundamental-track?pair=${pair}&weeks=${range}`;
}
