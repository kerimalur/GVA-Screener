/**
 * Zeit-Muster-Analyse für den Trade-Kalender — reine Aggregation ohne I/O,
 * gleiches Muster wie lib/journal/budget.ts, damit die Buckets ohne Browser
 * durchgerechnet und in scripts/time-patterns-check.mts kontrolliert werden.
 *
 * Zwei Schnitte über die Live-Trades eines Zeitraums:
 *   - nach Wochentag (Mo–Fr) aus `trade.date`
 *   - nach Handelssession aus `trade.session`
 *
 * Session-Quelle ist bewusst das vorhandene `session`-Feld (DB-Spalte
 * `trades.session`). Eine echte Eintritts-Uhrzeit speichert das Schema nicht,
 * und ohne Datenbasis wird nichts erfunden — Trades ohne Session-Angabe zählen
 * in der Wochentags-Sicht mit, in der Session-Sicht als „ohne Angabe".
 *
 * Winrate = wins / (wins + losses); Breakeven zählt wie in stats.ts nicht mit.
 * `null` heißt „keine entschiedenen Trades", NICHT 0 % — sonst läse sich ein
 * reiner Breakeven-Tag wie ein Totalverlust.
 */

import type { Trade } from "./types";

/** Unter dieser Zahl ist jede Quote Rauschen — ehrlicher Hinweis statt Prozent. */
export const MIN_PATTERN_TRADES = 5;

export type SessionKey = "london" | "newyork" | "asia";

export const SESSION_LABELS: Record<SessionKey, string> = {
  london: "London",
  newyork: "New York",
  asia: "Asia",
};

/** Anzeige-Reihenfolge der Sessions (chronologisch über den Handelstag). */
export const SESSION_ORDER: SessionKey[] = ["asia", "london", "newyork"];

/** Mo=0 … Fr=4. Wochenende bleibt bewusst außen vor (Task: Mo–Fr). */
export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr"] as const;

export interface BucketStat {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  /** wins/(wins+losses)*100; null wenn keine entschiedenen Trades */
  winRate: number | null;
  totalR: number;
}

export interface TimePatternResult {
  /** Live-Trades im Zeitraum (alle, inkl. Wochenende und ohne Session). */
  total: number;
  /** total >= MIN_PATTERN_TRADES — sonst nur ehrlicher Hinweis zeigen. */
  enough: boolean;
  /** genau 5 Buckets, Mo…Fr */
  weekday: BucketStat[];
  /** genau 3 Buckets, asia/london/newyork */
  session: BucketStat[];
  /** Trades ohne erkennbare Session */
  withoutSession: number;
}

/** Wochentag Mo=0…So=6, tz-sicher aus "YYYY-MM-DD" (lokale Mitternacht). */
function weekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return -1;
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** Rohes `session`-Feld → Bucket. Leer/unbekannt → null (= ohne Angabe). */
export function sessionOf(raw: string | undefined | null): SessionKey | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("asia") || s.includes("tokyo") || s.includes("sydney")) return "asia";
  if (s.includes("london") || s.includes("frankfurt") || s.includes("euro")) return "london";
  if (s.includes("new") || s.includes("york") || s === "ny" || s.includes("us")) return "newyork";
  return null;
}

function emptyBucket(key: string, label: string): BucketStat {
  return { key, label, trades: 0, wins: 0, losses: 0, winRate: null, totalR: 0 };
}

function addTrade(b: BucketStat, t: Trade): void {
  b.trades += 1;
  b.totalR += t.rMultiple;
  if (t.result === "win") b.wins += 1;
  else if (t.result === "loss") b.losses += 1;
}

function finalizeWinRate(b: BucketStat): void {
  const decided = b.wins + b.losses;
  b.winRate = decided > 0 ? (b.wins / decided) * 100 : null;
}

export function timePatterns(trades: Trade[]): TimePatternResult {
  const live = trades.filter((t) => t.sessionType === "live");

  const weekday = WEEKDAY_LABELS.map((l, i) => emptyBucket(String(i), l));
  const session = SESSION_ORDER.map((k) => emptyBucket(k, SESSION_LABELS[k]));
  let withoutSession = 0;

  for (const t of live) {
    const wd = weekdayIndex(t.date);
    if (wd >= 0 && wd < 5) addTrade(weekday[wd], t);

    const sk = sessionOf(t.session);
    if (sk) addTrade(session[SESSION_ORDER.indexOf(sk)], t);
    else withoutSession += 1;
  }

  weekday.forEach(finalizeWinRate);
  session.forEach(finalizeWinRate);

  return {
    total: live.length,
    enough: live.length >= MIN_PATTERN_TRADES,
    weekday,
    session,
    withoutSession,
  };
}
