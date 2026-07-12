import type { SeriesPoint } from "./seriesMath";
import { percentileRank } from "./percentile";

/**
 * Macro-Terminal-Scoring: deterministische G8-Fundamentalbewertung aus
 * FRED-Rohserien. Alle Sub-Scores sind auf -100..+100 normiert; TOTAL ist ihr
 * gleichgewichteter Durchschnitt. Keine externen APIs, kein LLM.
 */

// ── Statische Währungs-Meta ────────────────────────────────────────────────
export interface CcyMeta {
  ccy: string;
  flag: string;
  bank: string;
  /** Inflationsziel der Zentralbank (Midpoint) für Inflation-Score & Gap. */
  target: number;
  /** Währungssymbol für die Bilanzsumme (nur Fed/EZB/BoJ). */
  bsSymbol: string;
}

export const CCY_META: Record<string, CcyMeta> = {
  USD: { ccy: "USD", flag: "🇺🇸", bank: "Fed", target: 2, bsSymbol: "$" },
  EUR: { ccy: "EUR", flag: "🇪🇺", bank: "ECB", target: 2, bsSymbol: "€" },
  GBP: { ccy: "GBP", flag: "🇬🇧", bank: "BoE", target: 2, bsSymbol: "£" },
  JPY: { ccy: "JPY", flag: "🇯🇵", bank: "BoJ", target: 0, bsSymbol: "¥" },
  AUD: { ccy: "AUD", flag: "🇦🇺", bank: "RBA", target: 2.5, bsSymbol: "A$" },
  NZD: { ccy: "NZD", flag: "🇳🇿", bank: "RBNZ", target: 2, bsSymbol: "NZ$" },
  CAD: { ccy: "CAD", flag: "🇨🇦", bank: "BoC", target: 2, bsSymbol: "C$" },
  CHF: { ccy: "CHF", flag: "🇨🇭", bank: "SNB", target: 2, bsSymbol: "CHF" },
};

export type Regime =
  | "GOLDILOCKS"
  | "REFLATION"
  | "STAGFLATION"
  | "OVERHEATING"
  | "DISINFLATION";

export type SwingBias = "LONG" | "SHORT" | "NEUTRAL";
export type QeQt = "QE" | "QT" | "HOLD" | "NONE";
export type PolicyBias = "HAWKISH" | "DOVISH" | "NEUTRAL";

export interface MacroInput {
  ccy: string;
  cli: SeriesPoint[];
  bci: SeriesPoint[];
  cpiYoY: SeriesPoint[]; // bereits als YoY % berechnet
  policy: SeriesPoint[];
  yield10: SeriesPoint[];
  unemployment: SeriesPoint[];
  sentiment: SeriesPoint[];
  retail: SeriesPoint[];
  balanceSheet: SeriesPoint[];
}

export interface MacroGlobals {
  vix: number | null;
  t10y2y: number | null;
}

export interface SubScores {
  growth: number;
  inflation: number;
  labour: number;
  rates: number;
  realYield: number;
  sentiment: number;
  retail: number;
  liquidity: number;
  curve: number;
}

export interface CbMonitor {
  lastChangeBps: number | null;
  lastChangeDate: string | null;
  realRate: number | null;
  inflationGap: number | null;
  balanceSheet: number | null;
  balanceSheetDisplay: string;
  qeqt: QeQt;
  policyBias: PolicyBias;
}

export interface MacroScore {
  ccy: string;
  flag: string;
  bank: string;
  scores: SubScores;
  total: number;
  regime: Regime;
  swingBias: SwingBias;
  // Anzeige-Primitive für die Karten
  policyRate: number | null;
  cpiYoY: number | null;
  yield10: number | null;
  cliLevel: number | null;
  growthDir: -1 | 0 | 1;
  inflationDir: -1 | 0 | 1;
  cb: CbMonitor;
}

// ── Helfer ─────────────────────────────────────────────────────────────────
function latest(s: SeriesPoint[]): number | null {
  return s.length > 0 ? s[s.length - 1].value : null;
}

function valueMonthsAgo(s: SeriesPoint[], months: number): number | null {
  if (s.length === 0) return null;
  const cutoff = new Date(s[s.length - 1].date);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return [...s].reverse().find((p) => p.date <= cutoffStr)?.value ?? null;
}

/** 3M-Trend-Vorzeichen mit Toleranzband. +1 steigend, -1 fallend, 0 stabil. */
function trendSign(s: SeriesPoint[], months: number, eps: number): -1 | 0 | 1 | null {
  const now = latest(s);
  const past = valueMonthsAgo(s, months);
  if (now === null || past === null) return null;
  const d = now - past;
  return d > eps ? 1 : d < -eps ? -1 : 0;
}

function clamp(v: number, lo = -100, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Sub-Score-Berechnungen ───────────────────────────────────────────────
function cliLevelScore(level: number): number {
  if (level > 100.5) return 100;
  if (level > 100.2) return 50;
  if (level >= 99.8) return 0;
  if (level >= 99.5) return -50;
  return -100;
}

function growthScore(cli: SeriesPoint[], bci: SeriesPoint[]): number {
  const cliLvl = latest(cli);
  const cliS = cliLvl !== null ? cliLevelScore(cliLvl) : null;

  // BCI-Niveau als rollierendes 3J-Perzentil (36 Monatspunkte bzw. 12 Quartale).
  let bciS: number | null = null;
  if (bci.length > 0) {
    const win = bci.slice(-36).map((p) => p.value);
    const pct = percentileRank(bci[bci.length - 1].value, win);
    bciS = (pct - 50) * 2;
  }

  if (cliS !== null && bciS !== null) return clamp(cliS * 0.6 + bciS * 0.4);
  if (cliS !== null) return clamp(cliS);
  if (bciS !== null) return clamp(bciS);
  return 0;
}

function inflationScore(cpiYoY: number | null, target: number): number {
  if (cpiYoY === null) return 0;
  const d = cpiYoY - target;
  if (d > 2) return 100;
  if (d > 1) return 50;
  if (d >= -1) return 0;
  if (d >= -2) return -50;
  return -100;
}

function labourScore(unemployment: SeriesPoint[]): number {
  const t = trendSign(unemployment, 3, 0.1);
  if (t === null) return 0;
  // fallende Arbeitslosigkeit = stark (+), steigende = schwach (−)
  return t === -1 ? 50 : t === 1 ? -50 : 0;
}

function ratesScore(policy: SeriesPoint[]): number {
  const now = latest(policy);
  const past = valueMonthsAgo(policy, 3);
  if (now === null || past === null) return 0;
  const d = now - past;
  if (d > 0.25) return 100;
  if (d > 0.1) return 50;
  if (d < -0.25) return -100;
  if (d < -0.1) return -50;
  return 0;
}

function realYieldScore(yield10: number | null, cpiYoY: number | null): number {
  if (yield10 === null || cpiYoY === null) return 0;
  const rv = yield10 - cpiYoY;
  if (rv > 2) return 100;
  if (rv > 0) return 50;
  if (rv < -2) return -100;
  if (rv < 0) return -50;
  return 0;
}

function confidenceTrendScore(s: SeriesPoint[], eps: number): number {
  const t = trendSign(s, 3, eps);
  if (t === null) return 0;
  return t * 50;
}

function liquidityScore(
  ccy: string,
  balanceSheet: SeriesPoint[],
  vix: number | null,
): number {
  let score = 0;
  const now = latest(balanceSheet);
  const past = valueMonthsAgo(balanceSheet, 3);
  if (now !== null && past !== null && now !== 0) {
    const pct = ((now - past) / Math.abs(past)) * 100;
    if (pct > 0.5) score += 50; // QE
    else if (pct < -0.5) score -= 50; // QT
  }
  if (ccy === "USD" && vix !== null) {
    if (vix < 15) score += 25;
    else if (vix > 25) score -= 25;
  }
  return clamp(score);
}

function curveScore(ccy: string, t10y2y: number | null): number {
  if (ccy !== "USD" || t10y2y === null) return 0;
  return t10y2y > 0 ? 50 : t10y2y < 0 ? -50 : 0;
}

// ── Regime & Bias ──────────────────────────────────────────────────────────
function growthDirection(cli: SeriesPoint[], bci: SeriesPoint[]): -1 | 0 | 1 {
  const lvl = latest(cli);
  if (lvl !== null) return lvl > 100.2 ? 1 : lvl < 99.8 ? -1 : 0;
  // Fallback ohne CLI (NZD): BCI-Vorzeichen (Percent Balance um 0)
  const b = latest(bci);
  if (b !== null) return b > 0 ? 1 : b < 0 ? -1 : 0;
  return 0;
}

function classifyRegime(growthDir: -1 | 0 | 1, inflationDir: -1 | 0 | 1): Regime {
  if (growthDir === 1 && inflationDir <= 0) return "GOLDILOCKS";
  if (growthDir === 1 && inflationDir === 1) return "OVERHEATING";
  if (growthDir === -1 && inflationDir === 1) return "STAGFLATION";
  if (growthDir === -1 && inflationDir <= 0) return "DISINFLATION";
  return "REFLATION";
}

// ── Central-Bank-Monitor ────────────────────────────────────────────────────
function lastRateChange(policy: SeriesPoint[]): { bps: number; date: string } | null {
  if (policy.length < 2) return null;
  // jüngstes Datum, an dem sich der Wert vom vorherigen unterscheidet
  for (let i = policy.length - 1; i > 0; i--) {
    if (policy[i].value !== policy[i - 1].value) {
      return { bps: Math.round((policy[i].value - policy[i - 1].value) * 100), date: policy[i].date };
    }
  }
  return null; // konstant über die ganze Historie
}

function formatBalanceSheet(ccy: string, value: number | null): string {
  if (value === null) return "n/a";
  const sym = CCY_META[ccy]?.bsSymbol ?? "";
  // WALCL/ECBASSETSW in Mio., JPNASSETS in 100-Mio-Yen → grobe T-Normierung.
  const trillions = ccy === "JPY" ? value / 10_000_000 : value / 1_000_000;
  return `${sym}${trillions.toFixed(1)}T`;
}

function policyBiasOf(rate6mDelta: number | null, gap: number | null): PolicyBias {
  const hawkish = (rate6mDelta !== null && rate6mDelta > 0.1) || (gap !== null && gap > 1);
  const dovish = (rate6mDelta !== null && rate6mDelta < -0.1) || (gap !== null && gap < -1);
  if (hawkish && !dovish) return "HAWKISH";
  if (dovish && !hawkish) return "DOVISH";
  if (hawkish && dovish && rate6mDelta !== null) return rate6mDelta >= 0 ? "HAWKISH" : "DOVISH";
  return "NEUTRAL";
}

// ── Hauptfunktion ────────────────────────────────────────────────────────
export function scoreCurrency(input: MacroInput, g: MacroGlobals): MacroScore {
  const meta = CCY_META[input.ccy];
  const target = meta?.target ?? 2;

  const cpiYoY = latest(input.cpiYoY);
  const yld = latest(input.yield10);
  const cliLvl = latest(input.cli);
  const policyRate = latest(input.policy);

  const scores: SubScores = {
    growth: growthScore(input.cli, input.bci),
    inflation: inflationScore(cpiYoY, target),
    labour: labourScore(input.unemployment),
    rates: ratesScore(input.policy),
    realYield: realYieldScore(yld, cpiYoY),
    sentiment: confidenceTrendScore(input.sentiment, 0.5),
    retail: confidenceTrendScore(input.retail, 0.3),
    liquidity: liquidityScore(input.ccy, input.balanceSheet, g.vix),
    curve: curveScore(input.ccy, g.t10y2y),
  };

  const vals = Object.values(scores);
  const total = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);

  const growthDir = growthDirection(input.cli, input.bci);
  const inflationDir: -1 | 0 | 1 = cpiYoY === null ? 0 : cpiYoY > target ? 1 : -1;
  const regime = classifyRegime(growthDir, inflationDir);
  const swingBias: SwingBias = total >= 15 ? "LONG" : total <= -15 ? "SHORT" : "NEUTRAL";

  // CB-Monitor
  const change = lastRateChange(input.policy);
  const rate6mDelta =
    policyRate !== null && valueMonthsAgo(input.policy, 6) !== null
      ? policyRate - (valueMonthsAgo(input.policy, 6) as number)
      : null;
  const gap = cpiYoY !== null ? cpiYoY - target : null;
  const bsNow = latest(input.balanceSheet);
  const bsPast = valueMonthsAgo(input.balanceSheet, 3);
  let qeqt: QeQt = "NONE";
  if (bsNow !== null && bsPast !== null && bsPast !== 0) {
    const pct = ((bsNow - bsPast) / Math.abs(bsPast)) * 100;
    qeqt = pct > 0.5 ? "QE" : pct < -0.5 ? "QT" : "HOLD";
  }

  const cb: CbMonitor = {
    lastChangeBps: change?.bps ?? null,
    lastChangeDate: change?.date ?? null,
    realRate: policyRate !== null && cpiYoY !== null ? policyRate - cpiYoY : null,
    inflationGap: gap,
    balanceSheet: bsNow,
    balanceSheetDisplay: formatBalanceSheet(input.ccy, bsNow),
    qeqt,
    policyBias: policyBiasOf(rate6mDelta, gap),
  };

  return {
    ccy: input.ccy,
    flag: meta?.flag ?? "🏳️",
    bank: meta?.bank ?? input.ccy,
    scores,
    total,
    regime,
    swingBias,
    policyRate,
    cpiYoY,
    yield10: yld,
    cliLevel: cliLvl,
    growthDir,
    inflationDir,
    cb,
  };
}

export const SUBSCORE_LABELS: Array<{ key: keyof SubScores; label: string }> = [
  { key: "growth", label: "Growth" },
  { key: "inflation", label: "Inflation" },
  { key: "labour", label: "Labour" },
  { key: "rates", label: "Rates" },
  { key: "realYield", label: "Real Yield" },
  { key: "sentiment", label: "Sentiment" },
  { key: "retail", label: "Retail" },
  { key: "liquidity", label: "Liquidity" },
  { key: "curve", label: "Curve/Risk" },
];

export const REGIME_STYLE: Record<Regime, { label: string; cls: string }> = {
  GOLDILOCKS: { label: "GOLDILOCKS", cls: "bg-up/15 text-up border-up/30" },
  OVERHEATING: { label: "OVERHEATING", cls: "bg-warn/15 text-warn border-warn/30" },
  STAGFLATION: { label: "STAGFLATION", cls: "bg-down/15 text-down border-down/30" },
  DISINFLATION: { label: "DISINFLATION", cls: "bg-accent/15 text-accent border-accent/30" },
  REFLATION: { label: "REFLATION", cls: "bg-surface2 text-muted border-border" },
};
